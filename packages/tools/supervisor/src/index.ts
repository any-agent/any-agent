import Fastify from "fastify";
import Docker from "dockerode";
import path from "path";
import { nanoid } from "nanoid";
import process from "node:process";
import {
	ToolRequestSchema,
	ToolRequestSchemaAgentParams,
	type ToolResponse,
} from "@any-agent/core/schemas";
import {
	getArtifactPath,
	createWorkspace,
	listWorkspaceFiles,
	categorizeArtifacts,
} from "@any-agent/core/storage";
import { ToolRegistry } from "./tools/tool-handler.js";
import { CodeExecutionTool } from "./tools/code-execution.js";
import { DocumentConverterTool } from "./tools/document-converter.js";
import z from "zod";
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
toolRegistry.register(new DocumentConverterTool(docker));

console.log("Registered tools:", toolRegistry.getToolTypes().join(", "));

// Fastify server instance
const fastify = Fastify({ logger: true });

// Debug UI routes (only if DEBUG_UI env var is set)
if (process.env.DEBUG_UI === "true") {
	// GET /debug - Debug landing page listing all tools
	fastify.get("/debug", async (_, reply) => {
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
	console.log("  - Document converter: /debug/document-converter");
}

// GET /tools - List all available tools with their metadata
fastify.get("/tools", async (_, reply) => {
	const tools = toolRegistry.getTools().map((tool) => {
		return {
			toolType: tool.toolType,
			description: tool.description,
			parameters: z.toJSONSchema(tool.inputSchema).properties,
		};
	}).reduce((acc, i) => {
		const { toolType, description, parameters } = i;
		acc[toolType] = { description, parameters };
		return acc;
	}, {} as Record<string, { description: string, parameters?: typeof z.core.JSONSchema }>);

	reply.send(tools);
});

// POST /tools/execute - Execute any registered tool
fastify.post("/tools/execute", async (request, reply) => {
	// Validate request body
	const parseToolParamsResult = ToolRequestSchema.safeParse(request.body);
	const parseAgentParamsResult = ToolRequestSchemaAgentParams.safeParse(request.body);

	if (!parseAgentParamsResult.success) {
		reply.code(400).send({
			error: "Invalid request body (agent params)",
			details: parseAgentParamsResult.error.issues,
		});
		return;
	}

	if (!parseToolParamsResult.success) {
		reply.code(400).send({
			error: "Invalid request body (tool params)",
			details: parseToolParamsResult.error.issues,
		});
		return;
	}

	const toolRequest = parseToolParamsResult.data;
	const { sessionId, timeout, tool: toolType } = parseAgentParamsResult.data;

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
			timeout,
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
			...(result.stdout && { stdout: result.stdout }),
			...(result.stdoutTrimmed && { stdoutTrimmed: result.stdoutTrimmed }),
			...(result.stderr && { stderr: result.stderr }),
			...(result.stderrTrimmed && { stderrTrimmed: result.stderrTrimmed }),
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

// Start the server
fastify.listen({ port: 8080, host: "0.0.0.0" }).catch((err) => {
	fastify.log.error(err);
	process.exit(1);
});

// Graceful shutdown handling
const shutdown = async (signal: string) => {
	console.log(`\nReceived ${signal}, closing server gracefully...`);
	try {
		await fastify.close();
		console.log("Server closed successfully");
		process.exit(0);
	} catch (err) {
		console.error("Error during shutdown:", err);
		process.exit(1);
	}
};

// Listen for termination signals
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
