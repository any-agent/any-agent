import { z } from "zod";
import type { ToolResponse } from "@any-agent/core/schemas";

/**
 * Configuration for the tools supervisor
 */
export interface ToolsConfig {
	supervisorUrl: string;
	sessionId: string;
}

/**
 * Get default filename based on language
 */
function getDefaultFilename(language: string): string {
	switch (language) {
		case "python":
			return "script.py";
		case "node":
		case "bun":
			return "script.js";
		case "bash":
			return "script.sh";
		default:
			return "script.txt";
	}
}

/**
 * Create all tools with the given configuration
 */
export function createTools(config: ToolsConfig) {
	return {
		code_execution: {
			description:
				"Execute code in a sandboxed Docker container. Supports Python, Node.js, Bun, and Bash. Returns execution results and any generated files.",
			inputSchema: z.object({
				language: z
					.enum(["python", "node", "bun", "bash"])
					.describe("Programming language or runtime to use"),
				code: z.string().describe("The code to execute"),
				filename: z.string().optional().describe("Filename for the code file"),
			}),
			execute: async (params: { language: string; code: string; filename?: string }) => {
				const { language, code, filename } = params;
				const response = await fetch(`${config.supervisorUrl}/tools/execute`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						tool: "code_execution",
						sessionId: config.sessionId,
						language,
						code,
						filename: filename || getDefaultFilename(language),
						timeout: 30,
					}),
				});

				if (!response.ok) {
					const error = await response.text();
					throw new Error(`Code execution failed: ${error}`);
				}

				const result = (await response.json()) as ToolResponse;

				return {
					exitCode: result.exitCode,
					success: result.exitCode === 0,
					artifacts: result.artifacts,
					message:
						result.exitCode === 0
							? "Code executed successfully"
							: "Code execution failed",
				};
			},
		},
		document_converter: {
			description:
				"Convert documents between different formats using Pandoc in a sandboxed environment. Supports PDF, Markdown, HTML, DOCX, and more.",
			inputSchema: z.object({
				fileContent: z
					.string()
					.describe("Base64-encoded content of the file to convert"),
				filename: z.string().describe("Name of the input file"),
				conversionScript: z
					.string()
					.describe(
						"Bash script for running pandoc conversion (e.g., 'pandoc input.pdf -o output.md')",
					),
			}),
			execute: async (params: { fileContent: string; filename: string; conversionScript: string }) => {
				const { fileContent, filename, conversionScript } = params;
				const response = await fetch(`${config.supervisorUrl}/tools/execute`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						tool: "document_converter",
						sessionId: config.sessionId,
						fileContent,
						filename,
						conversionScript,
						timeout: 60,
					}),
				});

				if (!response.ok) {
					const error = await response.text();
					throw new Error(`Document conversion failed: ${error}`);
				}

				const result = (await response.json()) as ToolResponse;

				return {
					exitCode: result.exitCode,
					success: result.exitCode === 0,
					artifacts: result.artifacts,
					message:
						result.exitCode === 0
							? "Document converted successfully"
							: "Document conversion failed",
				};
			},
		},
	};
}
