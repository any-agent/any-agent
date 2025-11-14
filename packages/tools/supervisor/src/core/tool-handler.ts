import type { ToolRequest } from "./schemas.js";

/**
 * Context information passed to tool handlers
 */
export interface ToolExecutionContext {
	sessionId: string;
	jobId: string;
	workDir: string;
	protocol: string;
	host: string;
}

/**
 * Result returned by tool handlers
 */
export interface ToolExecutionResult {
	exitCode: number;
	inputFiles: Set<string>;
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
}
