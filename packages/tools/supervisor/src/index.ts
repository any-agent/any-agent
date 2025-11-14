// server.js
import Fastify from "fastify";
import Docker from "dockerode";
import path from "path";
import { nanoid } from "nanoid";
import process from "node:process";
import {
	ToolRequestSchema,
	ToolResponseSchema,
	RunRequestSchema,
	RunResponseSchema,
	type ToolRequest,
	type ToolResponse,
	type RunRequest,
	type RunResponse,
} from "./core/schemas.js";
import {
	getArtifactPath,
	createWorkspace,
	listWorkspaceFiles,
	categorizeArtifacts,
} from "./core/storage.js";
import { ToolRegistry } from "./core/tool-handler.js";
import { CodeExecutionTool } from "./tools/code-execution.js";

const docker = new Docker({
	// socketPath: path.join(os.homedir(), "podman/podman.sock"),
	socketPath: process.env.DOCKER_SOCKET_PATH
});

docker.version().then(console.log).catch((e) => {
	console.error(e);
	process.exit(-1);
});

// Tool registry - register all available tools
const toolRegistry = new ToolRegistry();
toolRegistry.register(new CodeExecutionTool(docker));

console.log("Registered tools:", toolRegistry.getToolTypes().join(", "));

// Fastify server instance
const fastify = Fastify({ logger: true });

// Debug UI routes (only if DEBUG_UI env var is set)
if (process.env.DEBUG_UI === "true") {
	// GET /debug - Debug landing page listing all tools
	fastify.get("/debug", async (request, reply) => {
		const debugIndexPath = path.join(import.meta.dir, "debug", "index.html");
		const debugIndexHtml = await Bun.file(debugIndexPath).text();
		reply.type("text/html").send(debugIndexHtml);
	});

	// GET /debug/:toolName - Tool-specific debug UI
	fastify.get("/debug/:toolName", async (request, reply) => {
		const { toolName } = request.params as { toolName: string };
		const debugToolPath = path.join(import.meta.dir, "debug", `${toolName}.html`);

		const debugToolFile = Bun.file(debugToolPath);
		const exists = await debugToolFile.exists();

		if (!exists) {
			reply.code(404).send({
				error: "Debug UI not found for this tool",
				availableTools: toolRegistry.getToolTypes()
			});
			return;
		}

		const debugToolHtml = await debugToolFile.text();
		reply.type("text/html").send(debugToolHtml);
	});

	console.log("Debug UI enabled:");
	console.log("  - Landing page: /debug");
	console.log("  - Code execution: /debug/code-execution");
}

// POST /tools/execute - Execute any registered tool
fastify.post("/tools/execute", async (request, reply) => {
	// Validate request body
	const parseResult = ToolRequestSchema.safeParse(request.body);

	if (!parseResult.success) {
		reply.code(400).send({
			error: "Invalid request body",
			details: parseResult.error.issues,
		});
		return;
	}

	const toolRequest = parseResult.data;
	const { sessionId } = toolRequest;
	const toolType = toolRequest.tool;

	// Find the appropriate tool handler
	const handler = toolRegistry.get(toolType);
	if (!handler) {
		reply.code(400).send({
			error: `Unknown tool type: ${toolType}`,
			availableTools: toolRegistry.getToolTypes(),
		});
		return;
	}

	const id = nanoid(6);
	const workDir = await createWorkspace(sessionId, id);
	console.log(`Processing ${toolType} job:`, workDir);

	try {
		// Execute the tool
		const context = {
			sessionId,
			jobId: id,
			workDir,
			protocol: request.protocol || "http",
			host: request.headers.host || "localhost:8080",
		};

		const result = await handler.execute(toolRequest, context);

		// Gather all files in workspace
		const allFiles = await listWorkspaceFiles(workDir);

		// Categorize artifacts into inputs and outputs
		const { inputs: inputArtifacts, outputs: outputArtifacts } =
			categorizeArtifacts(
				allFiles,
				result.inputFiles,
				context.protocol,
				context.host,
				sessionId,
				id
			);

		const response: ToolResponse = {
			sessionId,
			tool: toolType,
			id,
			exitCode: result.exitCode,
			artifacts: {
				inputs: inputArtifacts,
				outputs: outputArtifacts,
			},
		};

		reply.send(response);
	} catch (err) {
		fastify.log.error(err);
		reply.code(500).send({
			error: "Tool execution failed",
			details: err instanceof Error ? err.message : String(err),
		});
	}
});

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

// POST /run - Legacy endpoint for code execution (backward compatibility)
fastify.post("/run", async (request, reply) => {
	// Validate request body
	console.log(request.body);
	const parseResult = RunRequestSchema.safeParse(request.body);

	if (!parseResult.success) {
		reply.code(400).send({
			error: "Invalid request body",
			details: parseResult.error.issues,
		});
		return;
	}

	const { sessionId, language, code, filename } = parseResult.data;

	// Convert to tool request format
	const toolRequest = {
		tool: "code_execution" as const,
		sessionId,
		language,
		code,
		filename,
	};

	const handler = toolRegistry.get("code_execution");
	if (!handler) {
		reply.code(500).send({ error: "Code execution tool not available" });
		return;
	}

	const id = nanoid(6);
	const workDir = await createWorkspace(sessionId, id);
	console.log("Processing code execution job:", workDir);

	try {
		const context = {
			sessionId,
			jobId: id,
			workDir,
			protocol: request.protocol || "http",
			host: request.headers.host || "localhost:8080",
		};

		const result = await handler.execute(toolRequest, context);

		// Gather all files in workspace
		const allFiles = await listWorkspaceFiles(workDir);

		// Categorize artifacts into inputs and outputs
		const { inputs: inputArtifacts, outputs: outputArtifacts } =
			categorizeArtifacts(
				allFiles,
				result.inputFiles,
				context.protocol,
				context.host,
				sessionId,
				id
			);

		const response: RunResponse = {
			sessionId,
			id,
			exitCode: result.exitCode,
			artifacts: {
				inputs: inputArtifacts,
				outputs: outputArtifacts,
			},
		};

		reply.send(response);
	} catch (err) {
		fastify.log.error(err);
		reply.code(500).send({
			error: "Code execution failed",
			details: err instanceof Error ? err.message : String(err),
		});
	}
});

fastify.listen({ port: 8080, host: "0.0.0.0" }).catch((err) => {
	fastify.log.error(err);
	process.exit(1);
});
