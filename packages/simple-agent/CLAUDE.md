
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
2. Integrates with **@any-agent/tools-supervisor** for sandboxed tool execution
3. Supports **Anthropic Claude**, **OpenAI GPT**, **LM Studio**, **Ollama**, and any **OpenAI-compatible API**
4. Provides **code execution** and **document conversion** capabilities

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
```

## Adding New Tools

To add a new tool:

1. Define the tool schema in `src/tools.ts`
2. Implement the tool execution function
3. Make HTTP requests to the tools supervisor at `/tools/execute`
4. Add the tool to the `createTools` function

Example:

```ts
export const myNewTool = (config: ToolsConfig) =>
  tool({
    description: "Description of what this tool does",
    parameters: z.object({
      param1: z.string().describe("Parameter description"),
    }),
    execute: async ({ param1 }) => {
      const response = await fetch(`${config.supervisorUrl}/tools/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "my_tool_name",
          sessionId: config.sessionId,
          param1,
          timeout: 30,
        }),
      });

      const result = await response.json();
      return result;
    },
  });
```
