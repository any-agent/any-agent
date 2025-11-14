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

### Option 1: Run Locally with Bun

Start the API server directly:

```bash
bun run src/index.ts
```

The API will be available at `http://localhost:8080`

### Option 2: Run with Docker/Podman (Recommended for Production)

The supervisor can run as a containerized service using the **docker-out-of-docker (DooD)** pattern. The containerized supervisor uses the host's Docker/Podman daemon to launch worker containers.

#### Prerequisites for Containerized Deployment

1. **Docker or Podman** installed and running on the host
2. **Worker image built** on the host:
   ```bash
   # Navigate to worker directory
   cd ../worker

   # Build with Docker
   docker build -t aa-worker:latest .

   # Or build with Podman
   podman build -t aa-worker:latest .
   ```

3. **Storage directory** created on the host:
   ```bash
   # Mac (use /Users, NOT /tmp - see note below)
   mkdir -p ~/aa-storage
   chmod 755 ~/aa-storage

   # Linux
   mkdir -p /var/lib/aa-storage
   chmod 755 /var/lib/aa-storage
   ```

   **⚠️ Mac + Podman Users:** Do NOT use `/tmp` for storage! The VirtioFS filesystem on Mac has SELinux labeling issues that prevent the non-root `runner` user in worker containers from accessing files. Always use a path under `/Users` (e.g., `/Users/yourname/aa-storage`).

#### Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` for your platform:

   **Mac + Podman (with SSH tunnel):**
   ```bash
   DOCKER_SOCKET_PATH=/Users/yourname/podman/podman.sock
   AA_STORAGE_PATH=/Users/yourname/aa-storage
   DEBUG_UI=true
   ```
   ⚠️ **Important:** Do NOT use `/tmp` - use `/Users/yourname/aa-storage` instead

   **Mac + Docker Desktop:**
   ```bash
   DOCKER_SOCKET_PATH=/var/run/docker.sock
   AA_STORAGE_PATH=/Users/yourname/aa-storage
   DEBUG_UI=true
   ```

   **Linux + Docker:**
   ```bash
   DOCKER_SOCKET_PATH=/var/run/docker.sock
   AA_STORAGE_PATH=/var/lib/aa-storage
   DEBUG_UI=true
   ```

   **Linux + Podman (rootless):**
   ```bash
   DOCKER_SOCKET_PATH=/run/user/1000/podman/podman.sock
   AA_STORAGE_PATH=$HOME/.local/share/aa-storage
   DEBUG_UI=true
   ```

#### Build and Run

**Using Docker Compose:**
```bash
docker compose up --build
```

**Using Podman Compose:**
```bash
podman-compose up --build
```

**Run in detached mode:**
```bash
docker compose up -d --build
# Or
podman-compose up -d --build
```

#### Verify the Deployment

1. Check container status:
   ```bash
   docker ps
   # Or
   podman ps
   ```

2. View logs:
   ```bash
   docker compose logs -f supervisor
   # Or
   podman-compose logs -f supervisor
   ```

3. Test the API:
   ```bash
   curl http://localhost:8080/debug
   ```

#### How the DooD Pattern Works

1. **Socket Mount**: The host's Docker/Podman socket is mounted into the supervisor container at `/var/run/docker.sock`
2. **Storage Mount**: The storage directory (e.g., `/Users/yourname/aa-storage` on Mac, `/var/lib/aa-storage` on Linux) is mounted at the **SAME PATH** in both host and container
3. **Path Consistency**: When the supervisor tells the Docker daemon to mount `/Users/yourname/aa-storage/session-123/job-456` into a worker container, the daemon finds this path on the host
4. **Sibling Containers**: Worker containers are siblings to the supervisor container, not children (they share the host's daemon)

#### Security Considerations

**⚠️ Important:** Mounting the Docker socket gives the supervisor container full control over the Docker daemon. This is necessary for the DooD pattern but has security implications:

- The container can launch, stop, and manage any containers on the host
- The container can access all Docker resources
- Only run trusted code in the supervisor
- Consider using a Docker socket proxy with access controls for production deployments
- Ensure the supervisor container is kept up-to-date with security patches

#### Troubleshooting

**Container can't connect to Docker daemon:**
- Verify `DOCKER_SOCKET_PATH` in `.env` points to the correct socket
- Check socket permissions: `ls -l ${DOCKER_SOCKET_PATH}`
- For Podman on Mac, ensure SSH tunnel is active

**Worker containers can't access workspace files:**
- Verify `AA_STORAGE_PATH` is the same in both host and container
- Check directory permissions: `ls -ld ${AA_STORAGE_PATH}`
- Ensure the path exists on the host before starting
- **Mac + Podman:** Make sure you're NOT using `/tmp` - use `/Users/yourname/aa-storage` instead
- **Mac + Podman:** VirtioFS in `/tmp` has SELinux issues preventing non-root access

**Worker image not found:**
- Build the worker image on the host: `docker build -t aa-worker:latest ../worker`
- Verify with: `docker images | grep aa-worker`

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
