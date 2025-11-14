# Container Runtime Detection Script

## Overview

The `container-runtime.sh` script automatically detects and uses either Docker or Podman, whichever is available on your system.

## How It Works

The script checks for container runtimes in this order:
1. **Docker** - checks if `docker` command is available
2. **Podman** - checks if `podman` command is available
3. **Error** - exits with error if neither is found

Once detected, the script executes the provided arguments with the detected runtime.

## Usage

The script is automatically used by the npm/bun scripts in `package.json`:

```bash
# These will use either docker or podman automatically
bun run start     # Build and start containers
bun run stop      # Stop containers
bun run restart   # Restart containers
```

## Manual Usage

You can also use the script directly:

```bash
# Check version (will use detected runtime)
./scripts/container-runtime.sh --version

# Run compose commands
./scripts/container-runtime.sh compose up -d
./scripts/container-runtime.sh compose down

# Run any container command
./scripts/container-runtime.sh ps
./scripts/container-runtime.sh images
```

## Examples

### With Docker installed:
```bash
$ ./scripts/container-runtime.sh --version
Docker version 24.0.0, build ...
```

### With Podman installed:
```bash
$ ./scripts/container-runtime.sh --version
podman version 5.7.0
```

### With neither installed:
```bash
$ ./scripts/container-runtime.sh --version
Error: Neither docker nor podman is installed
```

## Benefits

- **No manual configuration** - automatically detects what's available
- **Cross-platform** - works on macOS, Linux, and Windows (with WSL/Git Bash)
- **Consistent commands** - same npm scripts work for all users
- **Easy testing** - developers can use Docker while CI uses Podman (or vice versa)

## Requirements

- Either Docker or Podman must be installed
- Bash shell (available by default on macOS/Linux, requires Git Bash on Windows)
