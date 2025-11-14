# Tool Execution Supervisor

A general-purpose tool execution supervisor that spawns Docker/Podman containers to run tools in isolated environments.

## Overview

This supervisor provides an extensible API for executing various tools within containerized environments. It manages the container lifecycle, handles input/output artifacts, and provides secure isolation for tool execution.

### Available Tools

- **code_execution**: Execute code in various languages (Python, Node.js, Bun, Bash)
- More tools can be added through the plugin system

## Features

- **Extensible Tool System**: Plugin-based architecture for adding new tools
- **Code Execution Tool**: Built-in support for Python, Node.js, Bun, and Bash
- **Secure Isolation**: Network disabled, memory limits (512MB), PID limits (128), CPU quotas (50%)
- **Artifact Management**: Automatic handling of input/output files with download URLs
- **Stream Handling**: Captures stdout/stderr as downloadable artifacts
- **Docker/Podman Compatible**: Works with both Docker and Podman through dockerode
- **Session Management**: Organize jobs by sessionId for multi-job workflows

## Installation

Install dependencies:

```bash
bun install
```

## Prerequisites

- Docker or Podman installed and running
- Built worker image: `aa-worker:latest` (Ubuntu-based image with python3, node, and bun)
- Set `DOCKER_SOCKET_PATH` environment variable (defaults to Docker socket)
- Optional: Set `DEBUG_UI=true` to enable the debug UI at `/debug`

## Running the Supervisor

Start the API server:

```bash
bun run src/index.ts
```

The API will be available at `http://localhost:8080`

## API Endpoints

### POST /tools/execute

Execute any registered tool.

**Request Body:**
```json
{
  "tool": "code_execution",
  "sessionId": "session-xyz",
  "language": "python",
  "code": "print('Hello, World!')",
  "filename": "script.py"
}
```

**Response:**
```json
{
  "tool": "code_execution",
  "sessionId": "session-xyz",
  "id": "abc123",
  "exitCode": 0,
  "artifacts": {
    "inputs": {
      "script.py": "http://localhost:8080/artifacts/session-xyz/abc123/script.py"
    },
    "outputs": {
      "stdout": "http://localhost:8080/artifacts/session-xyz/abc123/stdout",
      "stderr": "http://localhost:8080/artifacts/session-xyz/abc123/stderr",
      "output.txt": "http://localhost:8080/artifacts/session-xyz/abc123/output.txt"
    }
  }
}
```

**Note:** stdout and stderr are written as artifact files in the job directory, not returned in the response body.

### POST /run (Legacy)

Legacy endpoint for code execution (backward compatibility). Same as `/tools/execute` with `tool: "code_execution"`, but doesn't require the `tool` field.

### GET /artifacts/:sessionId/:jobId/:filename

Download an artifact file from a completed job.

**Parameters:**
- `sessionId`: The session identifier
- `jobId`: The job identifier (returned from POST /run)
- `filename`: The name of the artifact file

**Response:** Binary file download with appropriate Content-Type header

### GET /debug

Debug UI landing page listing all available tools. Access at `http://localhost:8080/debug`

**Note:** Debug UI is only available when `DEBUG_UI=true` is set in the environment.

### GET /debug/:toolName

Tool-specific debug UI for testing individual tools.

**Available Debug UIs:**
- `/debug/code-execution` - Code execution tool debugger

**Features:**
- Interactive forms for tool-specific inputs
- Execute tools and view results in real-time
- Display input and output artifacts with download links
- Inline viewer for stdout/stderr content
- Error handling and validation feedback
- Navigation back to debug landing page

## How It Works

1. Receives tool execution request via API with tool type and sessionId
2. Looks up the appropriate tool handler from the registry
3. Creates a temporary workspace directory in `~/.aa-storage/{sessionId}/job-{id}`
4. Tool handler executes its logic (e.g., for code execution):
   - Writes input files to the workspace
   - Spawns a Docker/Podman container with the appropriate image
   - Mounts the workspace directory to `/workspace` in the container
   - Executes the tool within the isolated container
   - Captures stdout/stderr streams and writes them to artifact files
5. Scans workspace to identify input vs output artifacts
6. Returns execution results with:
   - Tool type and exit code
   - Input artifacts (original files) with download URLs
   - Output artifacts (stdout, stderr, and any generated files) with download URLs
7. Auto-removes container after execution
8. All artifacts remain available for download via the artifacts endpoint

## Adding New Tools

To add a new tool:

1. Create a new tool handler implementing the `ToolHandler` interface in `src/tools/`
2. Register the tool in `src/index.ts` with `toolRegistry.register()`
3. Add the tool's input schema to `src/core/schemas.ts`
4. The tool will automatically be available via `/tools/execute`
