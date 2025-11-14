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
		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];

		const stream = await container.attach({
			stream: true,
			stdout: true,
			stderr: true,
		});

		// Docker multiplexes stdout/stderr in the stream
		stream.on("data", (chunk) => {
			const str = chunk.toString();
			// TODO: Properly demux stdout/stderr
			stdoutChunks.push(str);
		});

		await container.start();
		const result = await container.wait();

		const exitCode = result.StatusCode;

		// Write stdout and stderr to files
		const stdoutContent = stdoutChunks.join("");
		await writeWorkspaceFile(workDir, "stdout", stdoutContent);

		const stderrContent = stderrChunks.join("");
		await writeWorkspaceFile(workDir, "stderr", stderrContent);

		return { exitCode, inputFiles };
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
