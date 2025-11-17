import { z } from "zod";

// Common schemas
export const ArtifactSchema = z.record(z.string(), z.string()); // { filename: url }

// Base tool request schema
export const ToolRequestSchemaAgentParams = z.object({
	tool: z.string().min(1, "Tool must not be empty"),
	sessionId: z.string().min(1, "Session ID must not be empty"),
	timeout: z
		.number()
		.int()
		.min(1, "Timeout must be at least 1 second")
		.max(900, "Timeout cannot exceed 900 seconds (15 minutes)")
		.default(30)
		.describe("Execution timeout in seconds (default: 30s, max: 900s)"),
});

// Code execution tool schemas
export const CodeExecutionInputSchema = z.object({
	language: z.enum(["python", "node", "bun", "bash"]).default("bash"),
	code: z.string().min(1, "Code must not be empty"),
	filename: z.string().default("script.js"),
});

// Document converter tool schemas
export const DocumentConverterInputSchema = z.object({
	fileContent: z.string().min(1, "File content must not be empty (base64 encoded)"),
	filename: z.string().min(1, "Filename must not be empty"),
	conversionScript: z
		.string()
		.min(1, "Conversion script must not be empty")
		.describe("Bash script for running pandoc conversion (e.g., 'pandoc input.pdf -o output.md')"),
});

// Union of all tool input schemas (add more as tools are created)
export const ToolRequestSchema = z.union([
	CodeExecutionInputSchema,
	DocumentConverterInputSchema,
]);

// Tool response schema (generic for all tools)
export const ToolResponseSchema = z.object({
	sessionId: z.string(),
	tool: z.string(),
	id: z.string(),
	exitCode: z.number(),
	artifacts: z.object({
		inputs: ArtifactSchema,
		outputs: ArtifactSchema,
	}),
	stdout: z.string().optional().describe("Standard output (omitted if empty, trimmed if > 10KB)"),
	stdoutTrimmed: z.boolean().optional().describe("Indicates if stdout was trimmed (only present if stdout is trimmed)"),
	stderr: z.string().optional().describe("Standard error (omitted if empty, trimmed if > 10KB)"),
	stderrTrimmed: z.boolean().optional().describe("Indicates if stderr was trimmed (only present if stderr is trimmed)"),
});

// Types
export type CodeExecutionInput = z.infer<typeof CodeExecutionInputSchema>;
export type DocumentConverterInput = z.infer<typeof DocumentConverterInputSchema>;
export type ToolRequest = z.infer<typeof ToolRequestSchema>;
export type ToolResponse = z.infer<typeof ToolResponseSchema>;

