
# Simple Agent Package

This package provides a simple LLM agent loop using the Vercel AI SDK with @any-agent tools.

## Development with Bun

Default to using Bun instead of Node.js.

- Use `bun run src/index.ts` to run the agent
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Bun automatically loads .env, so don't use dotenv

## Architecture

This package implements a simple agent that:

1. Uses **Vercel AI SDK** for LLM orchestration and tool calling
2. **Dynamically discovers tools** from the supervisor at runtime via `/tools` endpoint
3. Integrates with **@any-agent/tools-supervisor** for sandboxed tool execution
4. Supports **Anthropic Claude**, **OpenAI GPT**, **LM Studio**, **Ollama**, and any **OpenAI-compatible API**
5. Automatically includes **stdout/stderr** output in tool responses for better debugging

**Key Feature:** Tools are not hardcoded! The agent fetches available tools from the supervisor, so adding new tools only requires changes to the supervisor.

## Key Files

- `src/index.ts` - Main agent implementation and example usage
- `src/tools.ts` - Tool definitions for the AI SDK (code execution, document conversion)
- `package.json` - Dependencies and scripts

## Environment Variables

Choose one of the following configurations:

### Cloud APIs

```bash
# Anthropic Claude
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
AI_MODEL=claude-3-5-sonnet-20241022

# OpenAI GPT
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
AI_MODEL=gpt-4o
```

### Local Models

```bash
# LM Studio
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:1234/v1
AI_MODEL=your-model-name
OPENAI_API_KEY=not-needed

# Ollama
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
OPENAI_API_KEY=ollama
```

### All Configurations

```bash
# Tools supervisor URL (default: http://localhost:8080)
SUPERVISOR_URL=http://localhost:8080
```

## Usage

Run the agent with a prompt:

```bash
# Use default example prompt
bun run src/index.ts

# Provide custom prompt
bun run src/index.ts "Your prompt here"

# Enable debug mode to see all messages
bun run src/index.ts --debug "Your prompt here"
bun run src/index.ts -d "Your prompt here"
```

Debug mode shows all communication between user/agent/LLM/tools including:
- System/user messages
- LLM responses and reasoning
- Tool calls with full arguments
- HTTP requests/responses to supervisor
- Tool execution results
- Token usage per step

## Adding New Tools

To add a new tool, you need to update three places:

1. **Define schema in `@any-agent/core/src/schemas.ts`**
2. **Implement handler in `@any-agent/tools-supervisor/src/tools/`**
3. **Add schema mapping in `@any-agent/simple-agent/src/tools.ts`**

The agent will automatically discover the tool from the supervisor and use the schema from core for validation.

### Quick Example

**1. Core schema:**
```ts
export const MyToolInputSchema = BaseToolRequestSchema.extend({
  tool: z.literal("my_tool"),
  input: z.string().describe("Your input parameter"),
});

// Add to ToolRequestSchema union
export const ToolRequestSchema = z.discriminatedUnion("tool", [
  CodeExecutionInputSchema,
  DocumentConverterInputSchema,
  MyToolInputSchema, // Add here
]);
```

**2. Supervisor handler:**
```ts
import { MyToolInputSchema } from "@any-agent/core/schemas";

export class MyToolHandler implements ToolHandler<MyToolInput> {
  readonly toolType = "my_tool";
  readonly name = "My Tool";
  readonly description = "What it does";
  readonly inputSchema = MyToolInputSchema;

  async execute(input, context): Promise<ToolExecutionResult> {
    return { exitCode: 0, inputFiles: new Set(), stdout: "output" };
  }
}
```

**3. Agent schema map:**
```ts
// In src/tools.ts TOOL_SCHEMAS
my_tool: MyToolInputSchema.omit({ tool: true, sessionId: true }),
```

See README.md for complete details.
