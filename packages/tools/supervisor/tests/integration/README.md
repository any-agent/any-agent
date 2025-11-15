# Integration Tests

Integration tests for the Tool Execution Supervisor that test the full stack including Docker container execution.

## Prerequisites

1. **Docker/Podman** must be running
2. **Worker image** `aa-worker:latest` must be built
3. **Supervisor** must be running on the test endpoint (default: `http://localhost:8080`)

## Running Tests

### Start the supervisor in one terminal:
```bash
bun run src/index.ts
```

### Run integration tests in another terminal:
```bash
# Run all integration tests
bun test tests/integration

# Run specific test file
bun test tests/integration/code-execution.test.ts

# Run with custom endpoint
INTEGRATION_TEST_ENDPOINT=http://localhost:8081 bun test tests/integration
```

## Configuration

- **INTEGRATION_TEST_ENDPOINT**: API endpoint to test (default: `http://localhost:8080`)
- **DOCKER_SOCKET_PATH**: Docker socket path (inherited from .env)

## Test Coverage

### Code Execution Tests
- ✅ Python (stdout, stderr, file creation, exit codes)
- ✅ Node.js (stdout, stderr, file creation)
- ✅ Bun (stdout, file creation)
- ✅ Bash (stdout, stderr, file creation, exit codes)

### Verification Methods
- HTTP artifact downloads
- Direct storage file access
- Schema validation with Zod

## Test Artifacts

Test artifacts are stored in `~/.aa-storage/int-test-*` directories and are not automatically cleaned up. This allows for debugging after test runs.

To manually clean up:
```bash
rm -rf ~/.aa-storage/int-test-*
```

## Parallel Execution

Tests can run in parallel. Each test uses a unique session ID based on epoch milliseconds: `int-test-{timestamp}`
