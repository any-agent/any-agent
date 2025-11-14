# Code Execution Supervisor

A secure code execution supervisor that spawns Docker/Podman containers to run code in isolated Ubuntu Linux environments.

## Overview

This supervisor provides an API for executing code in various languages (Python, Node.js, Bun, Bash) within containerized environments. It manages the container lifecycle, handles input/output artifacts, and provides secure isolation for code execution.

## Features

- **Multi-language Support**: Execute Python, Node.js, Bun, and Bash code
- **Secure Isolation**: Network disabled, memory limits (512MB), PID limits (128), CPU quotas (50%)
- **Artifact Management**: Automatic mounting of input/output files between host and container
- **Stream Handling**: Captures and returns stdout/stderr from container execution
- **Docker/Podman Compatible**: Works with both Docker and Podman through dockerode

## Installation

Install dependencies:

```bash
bun install
```

## Prerequisites

- Docker or Podman installed and running
- Built worker image: `aa-worker:latest` (Ubuntu-based image with python3, node, and bun)
- Set `DOCKER_SOCKET_PATH` environment variable (defaults to Docker socket)

## Running the Supervisor

Start the API server:

```bash
bun run src/index.ts
```

The API will be available at `http://localhost:8080`

## API Endpoints

### POST /run

Execute code in a containerized environment.

**Request Body:**
```json
{
  "sessionId": "session-xyz",
  "language": "python|node|bun|bash",
  "code": "print('Hello, World!')",
  "filename": "script.py"
}
```

**Response:**
```json
{
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

### GET /artifacts/:sessionId/:jobId/:filename

Download an artifact file from a completed job.

**Parameters:**
- `sessionId`: The session identifier
- `jobId`: The job identifier (returned from POST /run)
- `filename`: The name of the artifact file

**Response:** Binary file download with appropriate Content-Type header

## How It Works

1. Receives code execution request via API with sessionId
2. Creates a temporary workspace directory in `~/.aa-storage/{sessionId}/job-{id}`
3. Writes code to file in the workspace (tracked as input artifact)
4. Spawns a Docker/Podman container with the `aa-worker:latest` image
5. Mounts the workspace directory to `/workspace` in the container
6. Executes the code with appropriate runtime (python3, node, bun, or bash)
7. Captures stdout/stderr streams and writes them to `stdout` and `stderr` files in the workspace
8. Scans workspace to identify input vs output artifacts
9. Returns execution results with:
   - Exit code
   - Input artifacts (original script files) with download URLs
   - Output artifacts (stdout, stderr, and any generated files) with download URLs
10. Auto-removes container after execution
11. All artifacts remain available for download via the artifacts endpoint
