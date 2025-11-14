#!/usr/bin/env bash
# Detect and use either Docker or Podman, whichever is available

# Check if docker is available
if command -v docker &> /dev/null; then
    RUNTIME="docker"
# Check if podman is available
elif command -v podman &> /dev/null; then
    RUNTIME="podman"
else
    echo "Error: Neither docker nor podman is installed" >&2
    exit 1
fi

# Execute the command with the detected runtime
# Replace 'podman' or 'docker' in the arguments with the detected runtime
exec "$RUNTIME" "$@"
