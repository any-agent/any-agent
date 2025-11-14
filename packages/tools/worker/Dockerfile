# Use a stable Ubuntu base
FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Update system and install basic system utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    ca-certificates \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@latest

# Install Bun (JavaScript runtime)
RUN curl -fsSL https://bun.sh/install | bash && \
    mv ~/.bun /usr/local/bun && \
    ln -sf /usr/local/bun/bin/bun /usr/local/bin/bun

# Optional: Add a non-root user for code execution security
RUN useradd -ms /bin/bash runner
USER runner
WORKDIR /home/runner

# Environment variables
ENV PATH="/usr/local/bun/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Default command - open shell
CMD ["bash"]
