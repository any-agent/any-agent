# =============================================
# Code execution base image with Pandoc toolchain
# =============================================
FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------------
# Base system utilities and locales
# ------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    ca-certificates \
    unzip \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    software-properties-common \
    locales \
    pandoc \
    gnupg \
    texlive \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-xetex \
    texlive-luatex \
    ghostscript \
    poppler-utils \
    wkhtmltopdf \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

# Set UTF-8 locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# ------------------------------------------------------------
# Install Node.js (LTS) and Bun
# ------------------------------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@latest && \
    curl -fsSL https://bun.sh/install | bash && \
    mv ~/.bun /usr/local/bun && \
    ln -sf /usr/local/bun/bin/bun /usr/local/bin/bun

ENV PATH="/usr/local/bun/bin:$PATH"

# ------------------------------------------------------------
# Install Python Pandoc filters (optional)
# ------------------------------------------------------------
RUN pip install --no-cache-dir \
    pypandoc \
    panflute \
    pandocfilters \
    pyyaml \
    click

# ------------------------------------------------------------
# Create non-root execution user
# ------------------------------------------------------------
RUN useradd -ms /bin/bash runner
USER runner
WORKDIR /home/runner

# ------------------------------------------------------------
# Environment configuration
# ------------------------------------------------------------
ENV PYTHONUNBUFFERED=1
ENV PATH="/usr/local/bun/bin:$PATH"

# ------------------------------------------------------------
# Default entrypoint - open interactive shell
# ------------------------------------------------------------
CMD ["bash"]
