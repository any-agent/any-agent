import Docker from "dockerode";
import type {
	ToolHandler,
	ToolExecutionContext,
	ToolExecutionResult,
} from "./tool-handler.js";
import { DocumentConverterInputSchema, type DocumentConverterInput } from "@any-agent/core/schemas";
import { writeWorkspaceFile } from "@any-agent/core/storage";

/**
 * Tool handler for converting documents to markdown using pandoc
 * Supports: PDF, DOCX, and other formats supported by pandoc
 */
export class DocumentConverterTool implements ToolHandler<DocumentConverterInput> {
	readonly toolType = "document_converter";
	readonly name = "Document Converter";
	readonly description = "Convert documents to pdf, markdown or other formats using pandoc, pdf2html, libreoffice in an isolated container. Supports PDF, DOCX, and other formats that those tools can handle. The file content must be base64-encoded and you provide a custom conversion script (bash commands). Output files, stdout, and stderr are captured as artifacts.";
	readonly inputSchema = DocumentConverterInputSchema;

	constructor(private docker: Docker) { }

	async execute(
		input: DocumentConverterInput,
		context: ToolExecutionContext
	): Promise<ToolExecutionResult> {
		const { fileContent, filename, conversionScript } = input;
		const { workDir, timeout } = context;

		// Decode base64 file content and write to workspace
		const fileBuffer = Buffer.from(fileContent, "base64");
		await writeWorkspaceFile(workDir, filename, fileBuffer);

		// Track input files
		const inputFiles = new Set([filename]);

		// Create and run container
		const container = await this.docker.createContainer({
			Image: "aa-worker:latest",
			Cmd: ["bash", "-c", conversionScript],
			WorkingDir: "/workspace",
			Volumes: { "/workspace": {} },
			HostConfig: {
				Binds: [`${workDir}:/workspace:Z`],
				NetworkMode: "none", // isolation
				AutoRemove: true,
				Memory: 512 * 1024 * 1024, // 512MB limit
				PidsLimit: 128,
				CpuQuota: 50000, // ~50% single core
			},
		});

		// Capture stdout/stderr
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];

		const stream = await container.attach({
			stream: true,
			stdout: true,
			stderr: true,
		});

		// Docker multiplexes stdout/stderr in the stream using the following format:
		// Header (8 bytes):
		//   - Byte 0: Stream type (0=stdin, 1=stdout, 2=stderr)
		//   - Bytes 1-3: Reserved
		//   - Bytes 4-7: Frame size (big-endian uint32)
		// Payload: The actual data
		stream.on("data", (chunk: Buffer) => {
			this.demuxDockerStream(chunk, stdoutChunks, stderrChunks);
		});

		const startTime = Date.now();
		await container.start();

		// Race between container completion and timeout
		let exitCode: number;
		let timedOut = false;

		try {
			const result = await Promise.race([
				container.wait(),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error("TIMEOUT")), timeout * 1000)
				),
			]);
			exitCode = result.StatusCode;
		} catch (error) {
			if (error instanceof Error && error.message === "TIMEOUT") {
				timedOut = true;
				exitCode = -1;
				const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

				// Kill the container
				try {
					await container.kill();
				} catch (killError) {
					// Container might already be stopped
					console.error("Error killing container:", killError);
				}

				// Append timeout message to stderr
				const timeoutMessage = `\nConversion timed out after ${elapsedTime}s (timeout was set to ${timeout}s)\n`;
				stderrChunks.push(Buffer.from(timeoutMessage, "utf-8"));
			} else {
				throw error;
			}
		}

		// Write stdout and stderr to files
		const stdoutContent = Buffer.concat(stdoutChunks).toString("utf-8");
		await writeWorkspaceFile(workDir, "stdout", stdoutContent);

		const stderrContent = Buffer.concat(stderrChunks).toString("utf-8");
		await writeWorkspaceFile(workDir, "stderr", stderrContent);

		return { exitCode, inputFiles };
	}

	/**
	 * Demultiplex Docker stream data into stdout and stderr buffers
	 * Docker stream format:
	 *   - Byte 0: Stream type (1=stdout, 2=stderr)
	 *   - Bytes 1-3: Reserved
	 *   - Bytes 4-7: Frame size (big-endian uint32)
	 *   - Bytes 8+: Payload data
	 */
	private demuxDockerStream(
		chunk: Buffer,
		stdoutChunks: Buffer[],
		stderrChunks: Buffer[]
	): void {
		let offset = 0;

		while (offset < chunk.length) {
			// Need at least 8 bytes for the header
			if (offset + 8 > chunk.length) {
				break;
			}

			const streamType = chunk.readUInt8(offset);
			const payloadSize = chunk.readUInt32BE(offset + 4);

			// Ensure we have the full payload
			if (offset + 8 + payloadSize > chunk.length) {
				break;
			}

			const payload = chunk.subarray(offset + 8, offset + 8 + payloadSize);

			// Route to appropriate stream based on type
			switch (streamType) {
				case 1: // stdout
					stdoutChunks.push(payload);
					break;
				case 2: // stderr
					stderrChunks.push(payload);
					break;
				// case 0: stdin (shouldn't happen in attach mode)
				// case 3: systemerr (rare)
			}

			offset += 8 + payloadSize;
		}
	}
}
