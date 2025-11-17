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
- **Dynamic tool discovery** - Automatically discovers tools from the supervisor at runtime
- **Provides built-in tools** - Code execution and document conversion (via supervisor)
- **Extensible architecture** - Add new tools by only modifying the supervisor
- **Run locally** - No API costs, complete privacy with local models
- **Rich output** - Includes stdout/stderr from tool execution for better debugging

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

### Debug Mode

Enable debug logging to see all messages between user/agent/tools:

```bash
# Using --debug flag
bun run src/index.ts --debug "Your prompt here"

# Using -d shorthand
bun run src/index.ts -d "Calculate factorial of 5"
```

Debug mode shows:
- 📝 System prompt sent to the LLM
- 💬 User messages
- 💭 LLM responses at each step
- 🔧 Tool calls with full arguments
- 🌐 HTTP requests to the supervisor
- ✅ HTTP responses from the supervisor
- 📦 Tool results returned to the LLM
- 🏁 Finish reasons
- 📊 Token usage per step

This is extremely helpful for debugging issues, understanding the agent's reasoning, and seeing exactly what data flows between components.

### Programmatic Usage

```typescript
import { runAgent } from "./src/index.js";

await runAgent("Your prompt here", {
  provider: "anthropic",
  model: "claude-3-5-sonnet-20241022",
  supervisorUrl: "http://localhost:8080",
  maxSteps: 5,
  systemPrompt: "Custom system prompt...",
  debug: true, // Enable debug logging
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
│  │   Dynamic Tool Loading       │  │
│  │   - Fetches from supervisor  │  │
│  │   - Auto-discovers new tools │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
              │
              │ HTTP (GET /tools, POST /tools/execute)
              ↓
┌─────────────────────────────────────┐
│   @any-agent/tools-supervisor       │
│   - Exposes available tools via API │
│   - Runs tools in Docker containers │
│   - Manages artifacts/files         │
│   - Returns stdout/stderr output    │
└─────────────────────────────────────┘
```

### Flow

1. Agent starts up and fetches available tools from supervisor (`GET /tools`)
2. Tool definitions are dynamically loaded based on supervisor's response
3. User provides a prompt
4. Agent sends prompt + tool definitions to LLM
5. LLM decides to call tools (if needed)
6. Agent executes tools via HTTP request to supervisor (`POST /tools/execute`)
7. Tools run in sandboxed Docker containers
8. Results (including stdout/stderr) returned to LLM
9. Steps 5-8 repeat until task is complete
10. Final response returned to user

### Dynamic Tool Discovery

**The agent automatically discovers available tools from the supervisor at startup.** This means:

- ✅ Tool descriptions fetched dynamically from supervisor's `/tools` endpoint
- ✅ Tool schemas imported from `@any-agent/core/schemas` for validation
- ✅ Tools are always in sync with what the supervisor supports
- ✅ Single source of truth for tool schemas (the core package)
- ✅ Reduced code duplication and maintenance burden

**How it works:**
1. Agent fetches available tools from supervisor (`GET /tools`)
2. Agent matches each tool type to its corresponding schema from `@any-agent/core/schemas`
3. Agent builds tool definitions with proper validation and descriptions
4. If a tool is added to both the supervisor and core schemas, it's automatically available

## Extending with New Tools

To add a new tool, you need to update three places:

### Steps to Add a New Tool

1. **Define the Schema in Core**

   Add your tool's input schema to `@any-agent/core/src/schemas.ts`:

   ```typescript
   // In BaseToolRequestSchema section
   export const MyToolInputSchema = BaseToolRequestSchema.extend({
     tool: z.literal("my_tool"),
     input: z.string().describe("Description of the input"),
     // ... other tool-specific parameters
   });

   // Add to the discriminated union
   export const ToolRequestSchema = z.discriminatedUnion("tool", [
     CodeExecutionInputSchema,
     DocumentConverterInputSchema,
     MyToolInputSchema, // Add your schema here
   ]);
   ```

2. **Implement the Tool Handler in the Supervisor**

   Create a new tool handler class in `@any-agent/tools-supervisor/src/tools/`:

   ```typescript
   import type { ToolHandler, ToolExecutionContext, ToolExecutionResult } from "./tool-handler.js";
   import { MyToolInputSchema } from "@any-agent/core/schemas";

   export class MyToolHandler implements ToolHandler<MyToolInput> {
     readonly toolType = "my_tool";
     readonly name = "My Tool";
     readonly description = "What this tool does and when to use it";
     readonly inputSchema = MyToolInputSchema;

     async execute(input: MyToolInput, context: ToolExecutionContext): Promise<ToolExecutionResult> {
       // Implement your tool logic here
       return {
         exitCode: 0,
         inputFiles: new Set(),
         stdout: "Tool output here",
       };
     }
   }
   ```

   Then register it in `@any-agent/tools-supervisor/src/index.ts`:

   ```typescript
   import { MyToolHandler } from "./tools/my-tool.js";
   toolRegistry.register(new MyToolHandler());
   ```

3. **Add Schema Mapping in Simple Agent**

   In `@any-agent/simple-agent/src/tools.ts`, add your schema to the `TOOL_SCHEMAS` map:

   ```typescript
   import { MyToolInputSchema } from "@any-agent/core/schemas";

   const TOOL_SCHEMAS: Record<string, z.ZodSchema> = {
     code_execution: CodeExecutionInputSchema.omit({ tool: true, sessionId: true }),
     document_converter: DocumentConverterInputSchema.omit({ tool: true, sessionId: true }),
     my_tool: MyToolInputSchema.omit({ tool: true, sessionId: true }), // Add this
   };
   ```

4. **Restart and Use**

   ```bash
   # Restart the supervisor
   cd packages/tools/supervisor
   bun run start

   # Use your new tool
   cd packages/simple-agent
   bun run src/index.ts "Use my new tool to do something"
   ```

The agent will automatically discover the new tool from the supervisor and use the schema from the core package for validation!

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
  - `debug` (optional) - Enable debug logging to see all messages (default: false)

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
