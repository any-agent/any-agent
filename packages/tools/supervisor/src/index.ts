// server.js
import Fastify from "fastify";
import Docker from "dockerode";
import path from "path";
import { nanoid } from "nanoid";
import process from "node:process";
import {
	RunRequestSchema,
	RunResponseSchema,
	type RunRequest,
	type RunResponse,
} from "./core/schemas.js";
import {
	getArtifactPath,
	createWorkspace,
	writeWorkspaceFile,
	listWorkspaceFiles,
	categorizeArtifacts,
} from "./core/storage.js";

const docker = new Docker({
	// socketPath: path.join(os.homedir(), "podman/podman.sock"),
	socketPath: process.env.DOCKER_SOCKET_PATH
});

docker.version().then(console.log).catch((e) => {
	console.error(e);
	process.exit(-1);
});

// Fastify server instance
const fastify = Fastify({ logger: true });

// GET /debug - Debug UI for testing the supervisor (only if DEBUG_UI env var is set)
if (process.env.DEBUG_UI === "true") {
	fastify.get("/debug", async (request, reply) => {
		const debugHtmlPath = path.join(import.meta.dir, "debug.html");
		const debugHtml = await Bun.file(debugHtmlPath).text();
		reply.type("text/html").send(debugHtml);
	});
	console.log("Debug UI enabled at /debug");
}

// GET /artifacts/:sessionId/:jobId/:filename - Download artifact
fastify.get("/artifacts/:sessionId/:jobId/:filename", async (request, reply) => {
	const { sessionId, jobId, filename } = request.params as {
		sessionId: string;
		jobId: string;
		filename: string;
	};

	const artifactPath = getArtifactPath(sessionId, jobId, filename);

	// Send file or 404 if not found
	try {
		const file = Bun.file(artifactPath);
		const exists = await file.exists();

		if (!exists) {
			reply.code(404).send({ error: "Artifact not found" });
			return;
		}

		reply.type(file.type || "application/octet-stream");
		const bytes = await file.bytes();
		reply.send(Buffer.from(bytes));
	} catch (err) {
		fastify.log.error(err);
		reply.code(500).send({ error: "Failed to read artifact" });
	}
});

fastify.post("/run", async (request, reply) => {
	// Validate request body
	console.log(request.body)
	const parseResult = RunRequestSchema.safeParse(request.body);

	if (!parseResult.success) {
		reply.code(400).send({
			error: "Invalid request body",
			details: parseResult.error.issues
		});
		return;
	}

	const { sessionId, language, code, filename } = parseResult.data;

	const id = nanoid(6);
	const workDir = await createWorkspace(sessionId, id);
	console.log("processing job: ", workDir);

	await writeWorkspaceFile(workDir, filename, code);

	// Track input files
	const inputFiles = new Set([filename]);

	const command = getRunCommand(language, filename);

	// Podman container configuration (Docker-compatible)
	const container = await docker.createContainer({
		Image: "aa-worker:latest", // built runtime image
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

	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];

	const stream = await container.attach({
		stream: true,
		stdout: true,
		stderr: true,
	});

	// Docker multiplexes stdout/stderr in the stream
	// First byte indicates stream type: 1=stdout, 2=stderr
	stream.on("data", (chunk) => {
		const str = chunk.toString();
		// Simple heuristic: if chunk starts with control chars, it's multiplexed
		// Otherwise just capture everything as stdout
		stdoutChunks.push(str);
	});

	await container.start();
	const result = await container.wait(); // waits for process to exit

	const exitCode = result.StatusCode;

	// Write stdout and stderr to files
	const stdoutContent = stdoutChunks.join("");
	await writeWorkspaceFile(workDir, "stdout", stdoutContent);

	// For now, stderr is empty unless we properly demux the stream
	const stderrContent = stderrChunks.join("");
	await writeWorkspaceFile(workDir, "stderr", stderrContent);

	// Gather all files in workspace
	const allFiles = await listWorkspaceFiles(workDir);

	// Categorize artifacts into inputs and outputs
	const host = request.headers.host || "localhost:8080";
	const protocol = request.protocol || "http";
	const { inputs: inputArtifacts, outputs: outputArtifacts } = categorizeArtifacts(
		allFiles,
		inputFiles,
		protocol,
		host,
		sessionId,
		id
	);

	const response: RunResponse = {
		sessionId,
		id,
		exitCode,
		artifacts: {
			inputs: inputArtifacts,
			outputs: outputArtifacts,
		},
	};

	reply.send(response);
});

function getRunCommand(lang: RunRequest["language"], file: string): string {
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

fastify.listen({ port: 8080, host: "0.0.0.0" }).catch((err) => {
	fastify.log.error(err);
	process.exit(1);
});
