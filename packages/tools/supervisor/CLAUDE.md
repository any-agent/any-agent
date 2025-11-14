# Code Execution Supervisor - Development Guide

This is a supervisor service for secure code execution in containerized environments. It does NOT run code directly - instead, it spawns Docker/Podman containers and manages the execution lifecycle.

## Project Overview

- **Purpose**: Supervisor API for executing code in isolated Docker/Podman containers
- **Container Image**: `aa-worker:latest` (Ubuntu Linux with python3, node, bun)
- **API Framework**: Fastify
- **Runtime**: Bun (for running the supervisor itself)

## Architecture

The supervisor:
1. Receives code execution requests via REST API
2. Creates isolated workspace directories
3. Spawns Docker/Podman containers with the worker image
4. Mounts input/output artifacts between host and container
5. Manages stdout/stderr streams from container
6. Returns execution results and artifact listings

## Development Guidelines

### Running the Supervisor

```bash
bun run src/index.ts
```

### Environment Configuration

- Set `DOCKER_SOCKET_PATH` to point to your Docker/Podman socket
- Bun automatically loads .env files

### Supported Languages

The worker container supports:
- Python 3 (`python3`)
- Node.js (`node`)
- Bun (`bun run`)
- Bash (`bash`)

### Container Security

Containers are configured with:
- **Network**: Disabled (NetworkMode: "none")
- **Memory**: 512MB limit
- **PID**: 128 process limit
- **CPU**: 50% of single core quota
- **Auto-remove**: Containers are automatically cleaned up after execution

### API Endpoints

**POST /run**
- Accepts: `{ sessionId, language, code, filename }`
- Returns: `{ sessionId, id, exitCode, artifacts: { inputs, outputs } }`
- Artifacts are dictionaries mapping filenames to download URLs
- stdout/stderr are written as artifact files instead of being in the response

**GET /artifacts/:sessionId/:jobId/:filename**
- Downloads artifact files from completed jobs
- Uses `Bun.file()` for efficient file serving
- Returns appropriate Content-Type headers

### Code Organization

- `src/index.ts` - Main supervisor with Fastify server and Docker orchestration
- Uses dockerode for Docker/Podman compatibility
- Workspaces organized as `~/.aa-storage/{sessionId}/job-{id}`
- Input files (submitted code) tracked separately from output files (generated artifacts)

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
