// server.js
import Fastify from "fastify";
import Docker from "dockerode";
import { writeFile, readdir } from "node:fs/promises";
import path from "path";
import { mkdir, chmod } from "fs/promises";
import { nanoid } from "nanoid";
import process from "node:process";
import os from "node:os";
import { z } from "zod";

// Zod schemas for request/response validation
const RunRequestSchema = z.object({
	sessionId: z.string().min(1, "Session ID must not be empty"),
	language: z.enum(["python", "node", "bun", "bash"]).default("bash"),
	code: z.string().min(1, "Code must not be empty"),
	filename: z.string().default("script.js"),
});

const ArtifactSchema = z.record(z.string(), z.string()); // { filename: url }

const RunResponseSchema = z.object({
	sessionId: z.string(),
	id: z.string(),
	exitCode: z.number(),
	artifacts: z.object({
		inputs: ArtifactSchema,
		outputs: ArtifactSchema,
	}),
});

type RunRequest = z.infer<typeof RunRequestSchema>;
type RunResponse = z.infer<typeof RunResponseSchema>;

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

// GET /artifacts/:sessionId/:jobId/:filename - Download artifact
fastify.get("/artifacts/:sessionId/:jobId/:filename", async (request, reply) => {
	const { sessionId, jobId, filename } = request.params as {
		sessionId: string;
		jobId: string;
		filename: string;
	};

	const baseDir = path.join(os.homedir(), ".aa-storage");
	const artifactPath = path.join(baseDir, sessionId, `job-${jobId}`, filename);

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
	const baseDir = path.join(os.homedir(), ".aa-storage");
	const sessionDir = path.join(baseDir, sessionId);
	const workDir = path.join(sessionDir, `job-${id}`);
	console.log("processing job: ", workDir)
	await mkdir(workDir, { recursive: true });
	await chmod(workDir, 0o755);

	const scriptPath = path.join(workDir, filename);
	await writeFile(scriptPath, code);

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
	const stdoutPath = path.join(workDir, "stdout");
	await writeFile(stdoutPath, stdoutContent);

	// For now, stderr is empty unless we properly demux the stream
	const stderrPath = path.join(workDir, "stderr");
	await writeFile(stderrPath, stderrChunks.join(""));

	// Gather all files in workspace
	let allFiles: string[] = [];
	try {
		allFiles = await readdir(workDir);
	} catch (err) {
		fastify.log.error(err);
	}

	// Helper function to generate artifact URL
	const getArtifactUrl = (filename: string) => {
		const host = request.headers.host || "localhost:8080";
		const protocol = request.protocol || "http";
		return `${protocol}://${host}/artifacts/${sessionId}/${id}/${filename}`;
	};

	// Separate inputs and outputs
	const inputArtifacts: Record<string, string> = {};
	const outputArtifacts: Record<string, string> = {};

	for (const file of allFiles) {
		const url = getArtifactUrl(file);
		if (inputFiles.has(file)) {
			inputArtifacts[file] = url;
		} else {
			outputArtifacts[file] = url;
		}
	}

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
