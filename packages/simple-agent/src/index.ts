import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { nanoid } from "nanoid";
import { createTools } from "./tools.js";

/**
 * Simple agent configuration
 */
interface AgentConfig {
	/** The model provider to use */
	provider: "anthropic" | "openai" | "openai-compatible";
	/** The specific model to use (e.g., "claude-3-5-sonnet-20241022", "gpt-4") */
	model: string;
	/** URL of the tools supervisor */
	supervisorUrl: string;
	/** System prompt for the agent */
	systemPrompt?: string;
	/** Maximum number of tool call iterations */
	maxSteps?: number;
	/** Base URL for OpenAI-compatible endpoints (e.g., LM Studio) */
	baseURL?: string;
	/** API key for OpenAI-compatible endpoints (optional for local models) */
	apiKey?: string;
	/** Enable debug logging to see all messages */
	debug?: boolean;
}

/**
 * Run a simple agent with tools
 */
export async function runAgent(
	userPrompt: string,
	config: AgentConfig,
): Promise<void> {
	// Generate unique session ID
	const sessionId = nanoid();

	// Select the model based on provider
	let model;
	if (config.provider === "anthropic") {
		model = anthropic(config.model);
	} else if (config.provider === "openai-compatible") {
		// Create OpenAI-compatible client for LM Studio, Ollama, etc.
		const openaiCompatible = createOpenAICompatible({
			name: 'lmstudio',
			baseURL: config.baseURL || process.env.OPENAI_BASE_URL || "http://localhost:1234/v1",
		});
		model = openaiCompatible(config.model);
	} else {
		// Standard OpenAI
		const openaiClient = createOpenAI({
			apiKey: config.apiKey || process.env.OPENAI_API_KEY,
		});
		model = openaiClient(config.model);
	}

	console.log("\n=== Simple Agent ===");
	console.log(`Session ID: ${sessionId}`);
	console.log(`Model: ${config.provider}/${config.model}`);
	if (config.baseURL) {
		console.log(`Base URL: ${config.baseURL}`);
	}
	console.log(`Supervisor: ${config.supervisorUrl}`);

	// Fetch and create tools dynamically from the supervisor
	console.log("\nFetching available tools...");
	const tools = await createTools({
		supervisorUrl: config.supervisorUrl,
		sessionId,
		debug: config.debug,
	});

	const toolNames = Object.keys(tools);
	console.log(`Loaded ${toolNames.length} tools: ${toolNames.join(", ")}`);
	console.log(`\nPrompt: ${userPrompt}\n`);

	const systemPrompt = config.systemPrompt ||
		"You are a helpful assistant with access to code execution and document conversion tools. Use these tools to help the user accomplish their tasks.";

	if (config.debug) {
		console.log("=== DEBUG MODE ENABLED ===\n");
		console.log("📝 System Prompt:");
		console.log(systemPrompt);
		console.log("\n💬 User Message:");
		console.log(userPrompt);
		console.log("\n" + "=".repeat(80) + "\n");
	}

	try {
		// Generate response with tool calling
		const result = await generateText({
			model,
			tools,
			system: systemPrompt,
			prompt: userPrompt,
			onStepFinish: config.debug ? ({ text, toolCalls, toolResults, finishReason, usage }) => {
				console.log("🔄 Step Finished");
				console.log("─".repeat(80));

				if (text) {
					console.log("\n💭 LLM Response:");
					console.log(text);
				}

				if (toolCalls && toolCalls.length > 0) {
					console.log("\n🔧 Tool Calls:");
					for (const toolCall of toolCalls) {
						console.log(`\n  Tool: ${toolCall.toolName}`);
						console.log(`  ID: ${toolCall.toolCallId}`);
						console.log(`  Arguments: ${JSON.stringify((toolCall as any).args, null, 2)}`);
					}
				}

				if (toolResults && toolResults.length > 0) {
					console.log("\n📦 Tool Results:");
					for (const result of toolResults) {
						console.log(`\n  Tool Call ID: ${result.toolCallId}`);
						console.log(`  Result: ${JSON.stringify((result as any).result, null, 2)}`);
					}
				}

				if (finishReason) {
					console.log(`\n🏁 Finish Reason: ${finishReason}`);
				}

				if (usage) {
					console.log(`\n📊 Token Usage: ${usage.totalTokens} tokens`);
				}

				console.log("\n" + "=".repeat(80) + "\n");
			} : undefined,
		});

		console.log("=== Agent Response ===");
		console.log(result.text);
		console.log("\n=== Tool Calls ===");
		console.log(`Steps: ${result.steps.length}`);

		// Display tool usage
		for (const step of result.steps) {
			if (step.toolCalls && step.toolCalls.length > 0) {
				for (const toolCall of step.toolCalls) {
					console.log(`\nTool: ${toolCall.toolName}`);
					console.log(`Args: ${JSON.stringify((toolCall as any).args, null, 2)}`);
					if (step.toolResults) {
						const toolResult = step.toolResults.find(
							(r) => r.toolCallId === toolCall.toolCallId,
						);
						if (toolResult) {
							console.log(`Result: ${JSON.stringify((toolResult as any).result, null, 2)}`);
						}
					}
				}
			}
		}

		console.log(`\n=== Usage ===`);
		console.log(`Total tokens: ${result.usage.totalTokens}`);
	} catch (error) {
		console.error("Agent error:", error);
		throw error;
	}
}

/**
 * Example usage
 */
async function main() {
	// Get configuration from environment or use defaults
	const provider = (process.env.AI_PROVIDER as "anthropic" | "openai" | "openai-compatible") || "anthropic";

	// Determine default model based on provider
	let defaultModel: string;
	if (provider === "anthropic") {
		defaultModel = "claude-3-5-sonnet-20241022";
	} else if (provider === "openai-compatible") {
		defaultModel = "local-model"; // LM Studio uses model names from loaded models
	} else {
		defaultModel = "gpt-4o";
	}

	const model = process.env.AI_MODEL || defaultModel;
	const supervisorUrl = process.env.SUPERVISOR_URL || "http://localhost:8080";
	const baseURL = process.env.OPENAI_BASE_URL;
	const apiKey = process.env.OPENAI_API_KEY;

	// Check for required API keys (not needed for openai-compatible with local models)
	if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
		console.error("Error: ANTHROPIC_API_KEY environment variable is required");
		process.exit(1);
	}
	if (provider === "openai" && !process.env.OPENAI_API_KEY) {
		console.error("Error: OPENAI_API_KEY environment variable is required");
		process.exit(1);
	}

	// Parse command line arguments
	const args = process.argv.slice(2);
	const debugFlag = args.includes("--debug") || args.includes("-d");

	// Remove debug flag from args to get the prompt
	const promptArgs = args.filter(arg => arg !== "--debug" && arg !== "-d");
	const userPrompt = promptArgs.length > 0
		? promptArgs.join(" ")
		: "Write a Python script that calculates the first 10 Fibonacci numbers and execute it";

	await runAgent(userPrompt, {
		provider,
		model,
		supervisorUrl,
		baseURL,
		apiKey,
		debug: debugFlag,
	});
}

// Run if this is the main module
if (import.meta.main) {
	main().catch(console.error);
}
