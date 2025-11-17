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

interface AvailableTools {
	[name: string]: {
		description: string;
		inputSchema: z.ZodType;
		execute: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>>
	}
}

/**
 * Response from /tools endpoint
 */
interface ToolsListResponse {
	[name: string]: {
		description: string;
		// parameters: Record<string, any>;
	};
}

/**
 * Map of tool types to their input schemas
 */
const TOOL_SCHEMAS: Record<string, z.ZodType> = {
	code_execution: CodeExecutionInputSchema,
	document_converter: DocumentConverterInputSchema,
};

/**
 * Fetch available tools from the supervisor
 */
async function fetchAvailableTools(supervisorUrl: string): Promise<ToolsListResponse> {
	try {
		const response = await fetch(`${supervisorUrl}/tools`);

		if (!response.ok) {
			throw new Error(`Failed to fetch tools: ${response.statusText}`);
		}

		const data = (await response.json()) as ToolsListResponse;
		return data;
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
	return async (params: Record<string, unknown>) => {
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
			if (result.stdout) {
				parts.push(result.stdout);
			} else {
				parts.push("Tool executed successfully");
			}
		} else {
			parts.push(`Failed (exit code: ${result.exitCode})\n`);
			if (result.stderr) {
				parts.push(result.stderr)
			}
		}

		output.result = parts.join("\n");

		if (config.debug) {
			console.log(`\nToolcall reply to LLM:`);
			console.log(JSON.stringify(output));
		}

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
	const tools: AvailableTools = {};

	for (const [tool, { description }] of Object.entries(availableTools)) {
		// Get the schema for this tool type
		const inputSchema = TOOL_SCHEMAS[tool];

		if (!inputSchema) {
			console.warn(`No schema found for tool type: ${tool}, skipping...`);
			continue;
		}

		tools[tool] = {
			description,
			inputSchema,
			execute: createToolExecutor(config, tool),
		};
	}

	return tools;
}
