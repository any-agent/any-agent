# Use official Bun runtime image
FROM oven/bun:1

# Set working directory
WORKDIR /app

COPY dist ./dist

# Expose API port
EXPOSE 8080

# Set default storage path for containerized environment
ENV AA_STORAGE_PATH=/aa-storage

# Run the supervisor
CMD ["bun", "run", "dist/index.js"]
