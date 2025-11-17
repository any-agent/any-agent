import { z } from "zod";
import type { ToolResponse } from "@any-agent/core/schemas";
import {
	CodeExecutionInputSchema,
	DocumentConverterInputSchema,
} from "@any-agent/core/schemas";

/**
 * Configuration for the tools supervisor
 */
export interface ToolsConfig {
	supervisorUrl: string;
	sessionId: string;
	debug?: boolean;
}

/**
 * Response from /tools endpoint
 */
interface ToolsListResponse {
	tools: Array<{
		toolType: string;
		name: string;
		description: string;
		parameters: Record<string, any>;
	}>;
}

/**
 * Map of tool types to their input schemas
 */
const TOOL_SCHEMAS: Record<string, z.ZodSchema> = {
	code_execution: CodeExecutionInputSchema.omit({ tool: true, sessionId: true }),
	document_converter: DocumentConverterInputSchema.omit({ tool: true, sessionId: true }),
};

/**
 * Fetch available tools from the supervisor
 */
async function fetchAvailableTools(supervisorUrl: string): Promise<ToolsListResponse["tools"]> {
	try {
		const response = await fetch(`${supervisorUrl}/tools`);

		if (!response.ok) {
			throw new Error(`Failed to fetch tools: ${response.statusText}`);
		}

		const data = (await response.json()) as ToolsListResponse;
		return data.tools;
	} catch (error) {
		console.error("Failed to fetch tools from supervisor:", error);
		throw new Error(
			`Could not connect to tools supervisor at ${supervisorUrl}. ` +
			`Make sure the supervisor is running.`
		);
	}
}

/**
 * Create a tool executor for a given tool type
 */
function createToolExecutor(config: ToolsConfig, toolType: string) {
	return async (params: Record<string, any>) => {
		const requestBody = {
			tool: toolType,
			sessionId: config.sessionId,
			...params,
		};

		if (config.debug) {
			console.log(`\n🌐 HTTP Request to Supervisor:`);
			console.log(`  URL: POST ${config.supervisorUrl}/tools/execute`);
			console.log(`  Body: ${JSON.stringify(requestBody, null, 2)}`);
		}

		const response = await fetch(`${config.supervisorUrl}/tools/execute`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const error = await response.text();
			if (config.debug) {
				console.log(`\n❌ HTTP Response Error:`);
				console.log(`  Status: ${response.status} ${response.statusText}`);
				console.log(`  Body: ${error}`);
			}
			throw new Error(`Tool execution failed: ${error}`);
		}

		const result = (await response.json()) as ToolResponse;

		if (config.debug) {
			console.log(`\n✅ HTTP Response from Supervisor:`);
			console.log(`  Status: ${response.status} ${response.statusText}`);
			console.log(`  Body: ${JSON.stringify(result, null, 2)}`);
		}

		// Format the response with stdout/stderr if available
		const output: Record<string, any> = {
			exitCode: result.exitCode,
			success: result.exitCode === 0,
			artifacts: result.artifacts,
		};

		if (result.stdout) {
			output.stdout = result.stdout;
			if (result.stdoutTrimmed) {
				output.stdoutTrimmed = true;
			}
		}

		if (result.stderr) {
			output.stderr = result.stderr;
			if (result.stderrTrimmed) {
				output.stderrTrimmed = true;
			}
		}

		// Build a comprehensive message for the LLM
		const parts: string[] = [];

		if (result.exitCode === 0) {
			parts.push("Tool executed successfully");
		} else {
			parts.push(`Tool execution failed (exit code: ${result.exitCode})`);
		}

		if (result.stdout) {
			parts.push(`\nOutput:\n${result.stdout}`);
			if (result.stdoutTrimmed) {
				parts.push("(output was trimmed to 10KB)");
			}
		}

		if (result.stderr) {
			parts.push(`\nErrors:\n${result.stderr}`);
			if (result.stderrTrimmed) {
				parts.push("(errors were trimmed to 10KB)");
			}
		}

		const outputFiles = Object.keys(result.artifacts.outputs);
		if (outputFiles.length > 0) {
			parts.push(`\nGenerated files: ${outputFiles.join(", ")}`);
		}

		output.message = parts.join("\n");

		return output;
	};
}

/**
 * Create all tools dynamically from the supervisor
 */
export async function createTools(config: ToolsConfig) {
	// Fetch available tools from the supervisor
	const availableTools = await fetchAvailableTools(config.supervisorUrl);

	// Build the tools object dynamically
	const tools: Record<string, any> = {};

	for (const tool of availableTools) {
		// Get the schema for this tool type
		const inputSchema = TOOL_SCHEMAS[tool.toolType];

		if (!inputSchema) {
			console.warn(`No schema found for tool type: ${tool.toolType}, skipping...`);
			continue;
		}

		tools[tool.toolType] = {
			description: tool.description,
			inputSchema,
			execute: createToolExecutor(config, tool.toolType),
		};
	}

	return tools;
}
