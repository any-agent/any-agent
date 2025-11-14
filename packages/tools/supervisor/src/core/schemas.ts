import { z } from "zod";

// Zod schemas for request/response validation
export const RunRequestSchema = z.object({
	sessionId: z.string().min(1, "Session ID must not be empty"),
	language: z.enum(["python", "node", "bun", "bash"]).default("bash"),
	code: z.string().min(1, "Code must not be empty"),
	filename: z.string().default("script.js"),
});

export const ArtifactSchema = z.record(z.string(), z.string()); // { filename: url }

export const RunResponseSchema = z.object({
	sessionId: z.string(),
	id: z.string(),
	exitCode: z.number(),
	artifacts: z.object({
		inputs: ArtifactSchema,
		outputs: ArtifactSchema,
	}),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;
export type RunResponse = z.infer<typeof RunResponseSchema>;
