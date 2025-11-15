# @any-agent/scripts

Shared scripts for the any-agent monorepo.

## Overview

This package provides shared scripts that can be used across all packages in the monorepo via npm bin.

## Available Scripts

### `container-runtime`

Automatically detects and uses either Docker or Podman, whichever is available on your system.

**Detection order:**
1. **Docker** - checks if `docker` command is available
2. **Podman** - checks if `podman` command is available
3. **Error** - exits with error if neither is found

## Usage

### As a workspace dependency

Add to your `package.json`:

```json
{
  "dependencies": {
    "@any-agent/scripts": "workspace:*"
  },
  "scripts": {
    "build": "container-runtime build -t myimage:latest ."
  }
}
```

### Examples

**Building a container image:**
```json
{
  "scripts": {
    "build": "container-runtime build -t aa-worker:latest ."
  }
}
```

**Docker compose commands:**
```json
{
  "scripts": {
    "start": "container-runtime compose up -d --build",
    "stop": "container-runtime compose down"
  }
}
```

**Any container command:**
```json
{
  "scripts": {
    "ps": "container-runtime ps",
    "images": "container-runtime images"
  }
}
```

## Benefits

- ✅ **No manual configuration** - automatically detects Docker or Podman
- ✅ **Cross-platform** - works on macOS, Linux, and Windows (with WSL/Git Bash)
- ✅ **Consistent** - same commands work for all developers
- ✅ **Monorepo-friendly** - single source of truth, no script duplication
- ✅ **Easy to use** - just `container-runtime` in any workspace package's scripts

## Requirements

- Either Docker or Podman must be installed
- Bash shell (available by default on macOS/Linux, requires Git Bash on Windows)

## Packages Using This

- `@any-agent/tools-supervisor` - Supervisor API container management
- `@any-agent/tools-worker` - Worker container image building
