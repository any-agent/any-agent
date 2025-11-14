// server.js
import Fastify from "fastify";
import Docker from "dockerode";
import { writeFile, readdir } from "node:fs/promises";
import path from "path";
import { mkdir, chmod } from "fs/promises";
import { nanoid } from "nanoid";
import process from "node:process";
import os from "node:os";

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

fastify.post("/run", async (request, reply) => {
	const { language, code, filename = "script.js" } = request.body || {};
	if (!code) {
		reply.code(400).send({ error: "Missing 'code' field in body" });
		return;
	}

	const id = nanoid(6);
	const baseDir = path.join(os.homedir(), ".aa-storage");
	const workDir = path.join(baseDir, `job-${id}`);
	console.log("processing job: ", workDir)
	await mkdir(workDir, { recursive: true });
	await chmod(workDir, 0o755);

	const scriptPath = path.join(workDir, filename);
	await writeFile(scriptPath, code);

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

	const logs = [];
	const stream = await container.attach({
		stream: true,
		stdout: true,
		stderr: true,
	});
	stream.on("data", (chunk) => logs.push(chunk.toString()));

	await container.start();
	const result = await container.wait(); // waits for process to exit

	const exitCode = result.StatusCode;
	const combinedOutput = logs.join("");

	// Gather artifacts (filenames only)
	let artifacts = [];
	try {
		artifacts = await readdir(workDir);
	} catch (err) {
		fastify.log.error(err);
	}

	reply.send({
		id,
		exitCode,
		output: combinedOutput,
		artifacts,
	});
});

function getRunCommand(lang, file) {
	switch (lang) {
		case "python":
			return `python3 ${file}`;
		case "node":
			return `node ${file}`;
		case "bun":
			return `bun run ${file}`;
		case "bash":
		default:
			return `bash ${file}`;
	}
}

fastify.listen({ port: 8080, host: "0.0.0.0" }).catch((err) => {
	fastify.log.error(err);
	process.exit(1);
});
