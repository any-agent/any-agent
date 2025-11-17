import type { ToolRequest } from "@any-agent/core/schemas";
import type { z } from "zod";

/**
 * Context information passed to tool handlers
 */
export interface ToolExecutionContext {
	sessionId: string;
	jobId: string;
	workDir: string;
	protocol: string;
	host: string;
	timeout: number; // Timeout in seconds
}

/**
 * Result returned by tool handlers
 */
export interface ToolExecutionResult {
	exitCode: number;
	inputFiles: Set<string>;
	stdout?: string;
	stdoutTrimmed?: boolean;
	stderr?: string;
	stderrTrimmed?: boolean;
}

/**
 * Metadata describing a tool for LLM consumption
 */
export interface ToolMetadata {
	/**
	 * The unique tool type identifier (e.g., "code_execution")
	 */
	toolType: string;

	/**
	 * Human-readable name of the tool
	 */
	name: string;

	/**
	 * Description of what the tool does and when to use it
	 */
	description: string;

	/**
	 * Zod schema for the tool's input parameters
	 */
	inputSchema: z.ZodType;
}

/**
 * Base interface for all tool handlers
 */
export interface ToolHandler<TInput extends ToolRequest = ToolRequest> {
	/**
	 * The tool type this handler processes
	 */
	readonly toolType: string;

	/**
	 * Human-readable name of the tool
	 */
	readonly name: string;

	/**
	 * Description of what the tool does and when to use it
	 */
	readonly description: string;

	/**
	 * Zod schema for validating tool input
	 */
	readonly inputSchema: z.ZodType<TInput>;

	/**
	 * Execute the tool with the given input and context
	 */
	execute(input: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

/**
 * Registry for managing tool handlers
 */
export class ToolRegistry {
	private handlers = new Map<string, ToolHandler>();

	/**
	 * Register a tool handler
	 */
	register(handler: ToolHandler): void {
		this.handlers.set(handler.toolType, handler);
	}

	/**
	 * Get a tool handler by type
	 */
	get(toolType: string): ToolHandler | undefined {
		return this.handlers.get(toolType);
	}

	/**
	 * Check if a tool handler exists
	 */
	has(toolType: string): boolean {
		return this.handlers.has(toolType);
	}

	/**
	 * Get all registered tool types
	 */
	getToolTypes(): string[] {
		return Array.from(this.handlers.keys());
	}

	/**
	 * Get metadata for all registered tools
	 */
	getTools(): ToolMetadata[] {
		return Array.from(this.handlers.values()).map((handler) => ({
			toolType: handler.toolType,
			name: handler.name,
			description: handler.description,
			inputSchema: handler.inputSchema,
		}));
	}
}
