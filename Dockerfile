# Development Dockerfile with hot reload
FROM oven/bun:1

# Create a non-root user matching host user
RUN adduser --system --uid 502 --gid 20 nextjs

WORKDIR /app

# Install claude-code globally as root
RUN bun add -g @anthropic-ai/claude-code

# Enable multi-arch and install uv (Python package manager), npm, and multi-arch libraries
RUN dpkg --add-architecture amd64 && \
    apt-get update && apt-get install -y python3-pip nodejs npm libc6:amd64 libstdc++6:amd64 && \
    pip3 install --break-system-packages uv

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Install Chrome for puppeteer as root
RUN npx puppeteer browsers install chrome

# Copy application files
COPY --chown=nextjs:staff . .

# Create home directory and change ownership
RUN mkdir -p /home/nextjs && chown -R nextjs:staff /home/nextjs
RUN chown -R nextjs:staff /app

# Switch to non-root user
USER nextjs

# Set HOME environment variable for the nextjs user
ENV HOME=/home/nextjs

# Expose ports
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"

# Start mcp daemon in background and then dev server
CMD ["sh", "-c", "nohup /app/node_modules/.bin/mcp daemon & bun run dev"]