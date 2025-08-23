# Use bun base image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the Next.js application with memory optimization
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN bun run build

# Production image, copy all the files and run
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install Python and uv for Dedalus runner
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv package manager - use a simpler approach
RUN curl -LsSf https://astral.sh/uv/install.sh | sh || \
    (echo "UV installation failed, trying alternative method" && \
     pip3 install uv)
ENV PATH="/root/.local/bin:/root/.cargo/bin:${PATH}"

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Python runner for Dedalus
COPY --from=builder --chown=nextjs:nodejs /app/src/server/dedalus-runner.py ./src/server/dedalus-runner.py

RUN bun add -g @makosst/mcp

# Install claude-code globally
RUN bun add -g @anthropic-ai/claude-code
# Don't run mcp daemon during build - it should be started at runtime if needed
# RUN mcp daemon

# Set up environment for Claude Code
ENV ANTHROPIC_API_KEY=""

# Create a startup script to run mcp daemon in background and then start the app (before switching to nextjs user)
RUN echo '#!/bin/sh\nmcp daemon &\nexec bun run server.js' > /app/start.sh && \
    chmod +x /app/start.sh && \
    chown nextjs:nodejs /app/start.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application with mcp daemon
CMD ["/app/start.sh"]