# Tool Execution Supervisor - Development Guide

This is a general-purpose tool execution supervisor that runs tools in containerized environments. It provides an extensible plugin-based architecture for adding new tools.

## Project Overview

- **Purpose**: Supervisor API for executing various tools in isolated Docker/Podman containers
- **Architecture**: Plugin-based tool registry with extensible handlers
- **Primary Tool**: Code execution (Python, Node.js, Bun, Bash)
- **Container Image**: `aa-worker:latest` (Ubuntu Linux with python3, node, bun)
- **API Framework**: Fastify
- **Runtime**: Bun (for running the supervisor itself)

## Architecture

The supervisor uses a plugin-based tool registry:
1. **Tool Registry**: Manages registered tool handlers
2. **Tool Handlers**: Implement the `ToolHandler` interface for specific tools
3. **Execution Flow**:
   - Receives tool execution requests via REST API
   - Looks up the appropriate handler from the registry
   - Creates isolated workspace directories
   - Tool handler spawns containers and manages execution
   - Handles input/output artifacts and streams
   - Returns execution results with artifact URLs

## Development Guidelines

### Running the Supervisor

```bash
bun run src/index.ts
```

### Environment Configuration

- Set `DOCKER_SOCKET_PATH` to point to your Docker/Podman socket
- Set `DEBUG_UI=true` to enable the debug UI at `/debug` (optional)
- Bun automatically loads .env files

### Registered Tools

**code_execution** - Execute code in isolated containers
- Languages: Python 3, Node.js, Bun, Bash
- Container: `aa-worker:latest`
- Outputs: stdout, stderr, generated files

### Container Security

Containers are configured with:
- **Network**: Disabled (NetworkMode: "none")
- **Memory**: 512MB limit
- **PID**: 128 process limit
- **CPU**: 50% of single core quota
- **Auto-remove**: Containers are automatically cleaned up after execution

### API Endpoints

**POST /tools/execute**
- Accepts: `{ tool, sessionId, ...tool-specific-params }`
- Returns: `{ tool, sessionId, id, exitCode, artifacts: { inputs, outputs } }`
- Generic endpoint for any registered tool
- Tool-specific parameters depend on the tool being executed

**POST /run** (legacy, backward compatibility)
- Accepts: `{ sessionId, language, code, filename }`
- Returns: `{ sessionId, id, exitCode, artifacts: { inputs, outputs } }`
- Equivalent to `/tools/execute` with `tool: "code_execution"`

**GET /artifacts/:sessionId/:jobId/:filename**
- Downloads artifact files from completed jobs
- Uses `Bun.file()` for efficient file serving
- Returns appropriate Content-Type headers

**GET /debug** (only when `DEBUG_UI=true`)
- Interactive HTML debug UI for testing the supervisor
- Loaded from `src/debug.html` file
- Uses Alpine.js for reactivity (no build step required)
- Allows testing tool execution with immediate feedback
- Displays artifacts with inline viewing for stdout/stderr

### Code Organization

**Core:**
- `src/index.ts` - Main supervisor with Fastify server and tool registry
- `src/core/schemas.ts` - Zod schemas for all tools (request/response validation)
- `src/core/storage.ts` - Workspace and artifact management functions
- `src/core/tool-handler.ts` - Tool handler interface and registry

**Tools:**
- `src/tools/code-execution.ts` - Code execution tool handler
- Add new tools here implementing the `ToolHandler` interface

**UI:**
- `src/debug.html` - Debug UI (only served when `DEBUG_UI=true`)

**Storage:**
- Workspaces organized as `~/.aa-storage/{sessionId}/job-{id}`
- Input files tracked separately from output files

### Adding New Tools

1. Create `src/tools/your-tool.ts`:
```ts
import type { ToolHandler, ToolExecutionContext, ToolExecutionResult } from "../core/tool-handler.js";

export class YourTool implements ToolHandler {
  readonly toolType = "your_tool";

  async execute(input, context): Promise<ToolExecutionResult> {
    // Your tool logic here
    return { exitCode: 0, inputFiles: new Set() };
  }
}
```

2. Add schema to `src/core/schemas.ts`:
```ts
export const YourToolInputSchema = BaseToolRequestSchema.extend({
  tool: z.literal("your_tool"),
  // your tool-specific fields
});
```

3. Register in `src/index.ts`:
```ts
toolRegistry.register(new YourTool(docker));
```

### Testing

Use `bun test` to run tests:

```ts
import { test, expect } from "bun:test";

test("code execution", () => {
  // Test supervisor API endpoints
});
```

### Key Dependencies

- `fastify` - API server framework
- `dockerode` - Docker/Podman client
- `nanoid` - Unique job ID generation
