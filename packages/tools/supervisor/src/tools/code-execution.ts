import Docker from "dockerode";
import type {
	ToolHandler,
	ToolExecutionContext,
	ToolExecutionResult,
} from "../core/tool-handler.js";
import type { CodeExecutionInput } from "../core/schemas.js";
import { writeWorkspaceFile } from "../core/storage.js";
import path from "path";

/**
 * Tool handler for executing code in isolated containers
 */
export class CodeExecutionTool implements ToolHandler<CodeExecutionInput> {
	readonly toolType = "code_execution";

	constructor(private docker: Docker) {}

	async execute(
		input: CodeExecutionInput,
		context: ToolExecutionContext
	): Promise<ToolExecutionResult> {
		const { language, code, filename } = input;
		const { workDir } = context;

		// Write the code file to workspace
		await writeWorkspaceFile(workDir, filename, code);

		// Track input files
		const inputFiles = new Set([filename]);

		// Get the command to run
		const command = this.getRunCommand(language, filename);

		// Create and run container
		const container = await this.docker.createContainer({
			Image: "aa-worker:latest",
			Cmd: ["bash", "-c", command],
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

		await container.start();
		const result = await container.wait();

		const exitCode = result.StatusCode;

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

	private getRunCommand(
		lang: CodeExecutionInput["language"],
		file: string
	): string {
		switch (lang) {
			case "python":
				return `python3 ${file}`;
			case "node":
				return `node ${file}`;
			case "bun":
				return `bun run ${file}`;
			case "bash":
				return `bash ${file}`;
		}
	}
}
