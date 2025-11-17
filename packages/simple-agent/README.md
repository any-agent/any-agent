# @any-agent/simple-agent

A simple, extensible LLM agent implementation using the [Vercel AI SDK](https://sdk.vercel.ai/) with sandboxed tool execution capabilities.

## Overview

This package provides a minimal agent loop that:

- **Uses Vercel AI SDK** for LLM orchestration and structured tool calling
- **Integrates with @any-agent/tools-supervisor** for secure, sandboxed code execution in Docker containers
- **Supports multiple LLM providers**:
  - Anthropic Claude (cloud)
  - OpenAI GPT (cloud)
  - **LM Studio** (local, privacy-focused)
  - **Ollama** (local, open-source)
  - Any OpenAI-compatible API
- **Provides built-in tools** for code execution and document conversion
- **Extensible architecture** - easily add new tools
- **Run locally** - No API costs, complete privacy with local models

## Features

### Code Execution Tool

Execute code in sandboxed Docker containers with support for:

- Python
- Node.js
- Bun
- Bash

The tool automatically captures outputs, errors, and any files generated during execution.

### Document Converter Tool

Convert documents between formats using Pandoc:

- PDF to Markdown
- Markdown to HTML/DOCX
- HTML to Markdown
- And more (any Pandoc-supported format)

## Prerequisites

1. **Bun runtime** - [Install Bun](https://bun.sh)
2. **Tools supervisor** - The `@any-agent/tools-supervisor` service must be running
3. **LLM Provider** - One of the following:
   - **Anthropic Claude** - Requires `ANTHROPIC_API_KEY`
   - **OpenAI GPT** - Requires `OPENAI_API_KEY`
   - **LM Studio** - Local models, no API key required
   - **Ollama** - Local models with OpenAI compatibility
   - Any OpenAI-compatible API endpoint

## Installation

```bash
bun install
```

## Configuration

Create a `.env` file in this directory:

### Anthropic Claude

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-3-5-sonnet-20241022
SUPERVISOR_URL=http://localhost:8080
```

### OpenAI GPT

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-4o
SUPERVISOR_URL=http://localhost:8080
```

### LM Studio (Local Models)

```bash
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:1234/v1
AI_MODEL=your-model-name  # The model identifier from LM Studio
OPENAI_API_KEY=not-needed  # Optional, LM Studio doesn't validate
SUPERVISOR_URL=http://localhost:8080
```

### Ollama (Local Models)

```bash
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2  # Or any Ollama model
OPENAI_API_KEY=ollama
SUPERVISOR_URL=http://localhost:8080
```

### Other OpenAI-Compatible APIs

```bash
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=https://your-api-endpoint.com/v1
AI_MODEL=your-model-name
OPENAI_API_KEY=your-api-key
SUPERVISOR_URL=http://localhost:8080
```

## Usage

### Run with Default Example

```bash
bun run src/index.ts
```

This runs the default example: "Write a Python script that calculates the first 10 Fibonacci numbers and execute it"

### Run with Custom Prompt

```bash
bun run src/index.ts "Your prompt here"
```

Examples:

```bash
# Code execution
bun run src/index.ts "Create a Python script that sorts a list of numbers"

# Multi-step reasoning
bun run src/index.ts "Calculate the sum of squares of the first 20 even numbers using Python"

# Document conversion (requires file as base64)
bun run src/index.ts "Convert the provided PDF to markdown"
```

### Programmatic Usage

```typescript
import { runAgent } from "./src/index.js";

await runAgent("Your prompt here", {
  provider: "anthropic",
  model: "claude-3-5-sonnet-20241022",
  supervisorUrl: "http://localhost:8080",
  maxSteps: 5,
  systemPrompt: "Custom system prompt...",
});
```

## Architecture

### Components

```
┌─────────────────────────────────────┐
│      Simple Agent (this package)   │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Vercel AI SDK              │  │
│  │   - LLM orchestration        │  │
│  │   - Tool calling loop        │  │
│  └──────────────────────────────┘  │
│              │                      │
│              ↓                      │
│  ┌──────────────────────────────┐  │
│  │   Tool Definitions           │  │
│  │   - code_execution           │  │
│  │   - document_converter       │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
              │
              │ HTTP
              ↓
┌─────────────────────────────────────┐
│   @any-agent/tools-supervisor       │
│   - Runs tools in Docker containers │
│   - Manages artifacts/files         │
│   - Provides /tools/execute API     │
└─────────────────────────────────────┘
```

### Flow

1. User provides a prompt
2. Agent sends prompt + tool definitions to LLM
3. LLM decides to call tools (if needed)
4. Agent executes tools via HTTP request to supervisor
5. Tools run in sandboxed Docker containers
6. Results returned to LLM
7. Steps 3-6 repeat until task is complete
8. Final response returned to user

## Extending with New Tools

### 1. Define Your Tool in `src/tools.ts`

```typescript
export const myCustomTool = (config: ToolsConfig) =>
  tool({
    description: "What your tool does",
    parameters: z.object({
      input: z.string().describe("Input parameter description"),
    }),
    execute: async ({ input }) => {
      const response = await fetch(`${config.supervisorUrl}/tools/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "my_custom_tool",
          sessionId: config.sessionId,
          input,
          timeout: 30,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tool execution failed: ${await response.text()}`);
      }

      return await response.json();
    },
  });
```

### 2. Add to Tool Registry

```typescript
export function createTools(config: ToolsConfig) {
  return {
    code_execution: codeExecutionTool(config),
    document_converter: documentConverterTool(config),
    my_custom_tool: myCustomTool(config), // Add here
  };
}
```

### 3. Implement Tool Handler in Supervisor

See `@any-agent/tools-supervisor` documentation for implementing the backend tool handler.

## API Reference

### `runAgent(prompt, config)`

Execute the agent with a given prompt.

**Parameters:**

- `prompt` (string) - The user's prompt/task
- `config` (AgentConfig) - Configuration object
  - `provider` - "anthropic", "openai", or "openai-compatible"
  - `model` - Model name (e.g., "claude-3-5-sonnet-20241022", "gpt-4o", "llama-3.1-8b")
  - `supervisorUrl` - URL of the tools supervisor
  - `systemPrompt` (optional) - Custom system prompt
  - `maxSteps` (optional) - Max tool calling iterations (default: 5)
  - `baseURL` (optional) - Base URL for OpenAI-compatible endpoints (e.g., "http://localhost:1234/v1")
  - `apiKey` (optional) - API key for the provider (not required for local models)

**Returns:** Promise<void>

## Development

```bash
# Run the agent
bun run dev

# Type checking
bun run build

# Linting
bun run lint
```

## Examples

### Example 1: Simple Code Execution

```bash
bun run src/index.ts "Write and run a Python script that prints Hello World"
```

Output:

```
=== Simple Agent ===
Session ID: abc123
Model: anthropic/claude-3-5-sonnet-20241022
Prompt: Write and run a Python script that prints Hello World

=== Agent Response ===
I've created and executed a Python script that prints "Hello World".

=== Tool Calls ===
Steps: 2
Tool: code_execution
Args: {
  "language": "python",
  "code": "print('Hello World')"
}
Result: {
  "exitCode": 0,
  "success": true,
  "message": "Code executed successfully"
}
```

### Example 2: Multi-Step Task

```bash
bun run src/index.ts "Calculate factorial of 10 using Python"
```

The agent will:

1. Write a Python function to calculate factorial
2. Execute the code
3. Return the result (3,628,800)

## Using LM Studio

[LM Studio](https://lmstudio.ai/) allows you to run LLMs locally on your machine. Here's how to use it with this agent:

### 1. Install and Setup LM Studio

1. Download and install [LM Studio](https://lmstudio.ai/)
2. Download a model that supports tool calling (recommended models):
   - `Meta-Llama-3.1-8B-Instruct` or larger
   - `Mistral-7B-Instruct-v0.3` or newer
   - `Qwen2.5-7B-Instruct` or larger
   - Any model with tool/function calling support

### 2. Start the Local Server

1. Open LM Studio
2. Load your chosen model
3. Go to the "Local Server" tab
4. Click "Start Server"
5. The server will start on `http://localhost:1234` by default

### 3. Configure the Agent

Set these environment variables:

```bash
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:1234/v1
AI_MODEL=your-model-identifier
```

Note: The `AI_MODEL` should match the model identifier from LM Studio. You can find this in the LM Studio UI.

### 4. Run the Agent

```bash
bun run src/index.ts "Your prompt here"
```

### Tips for Local Models

- **Tool calling support**: Not all models support tool calling. Check the model card for "function calling" or "tool use" support.
- **Performance**: Larger models (13B+) generally perform better with complex tool calling.
- **Memory**: Ensure you have enough RAM/VRAM for your chosen model.
- **Speed**: Local inference is slower than cloud APIs but provides privacy and no API costs.

## Troubleshooting

### "Tools supervisor not available"

Ensure the `@any-agent/tools-supervisor` is running:

```bash
cd ../tools/supervisor
bun run start
```

### "API key not found"

Set the appropriate environment variable:

```bash
export ANTHROPIC_API_KEY=your_key_here
# OR
export OPENAI_API_KEY=your_key_here
```

### Tool execution timeouts

Increase the timeout in tool execution:

```typescript
timeout: 60; // seconds
```

## License

MIT

## Related Packages

- `@any-agent/core` - Core schemas and utilities
- `@any-agent/tools-supervisor` - Tool execution service
- `@any-agent/web` - Web interface for the agent
