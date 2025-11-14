import { z } from "zod";

// Common schemas
export const ArtifactSchema = z.record(z.string(), z.string()); // { filename: url }

// Base tool request schema
const BaseToolRequestSchema = z.object({
	sessionId: z.string().min(1, "Session ID must not be empty"),
});

// Code execution tool schemas
export const CodeExecutionInputSchema = BaseToolRequestSchema.extend({
	tool: z.literal("code_execution"),
	language: z.enum(["python", "node", "bun", "bash"]).default("bash"),
	code: z.string().min(1, "Code must not be empty"),
	filename: z.string().default("script.js"),
});

// Union of all tool input schemas (add more as tools are created)
export const ToolRequestSchema = z.discriminatedUnion("tool", [
	CodeExecutionInputSchema,
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
});

// Legacy schemas for backward compatibility
export const RunRequestSchema = CodeExecutionInputSchema.omit({ tool: true });
export const RunResponseSchema = ToolResponseSchema.omit({ tool: true });

// Types
export type CodeExecutionInput = z.infer<typeof CodeExecutionInputSchema>;
export type ToolRequest = z.infer<typeof ToolRequestSchema>;
export type ToolResponse = z.infer<typeof ToolResponseSchema>;

// Legacy types for backward compatibility
export type RunRequest = z.infer<typeof RunRequestSchema>;
export type RunResponse = z.infer<typeof RunResponseSchema>;
