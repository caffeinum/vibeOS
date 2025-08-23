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

# Create a non-root user with a proper home directory
RUN addgroup --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs --home /home/nextjs --create-home --shell /bin/sh nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Python runner for Dedalus
COPY --from=builder --chown=nextjs:nodejs /app/src/server/dedalus-runner.py ./src/server/dedalus-runner.py

# Install global packages in a shared location
RUN mkdir -p /usr/local/share/bun-global && \
    chmod 755 /usr/local/share/bun-global

# Set BUN_INSTALL to shared location before installing global packages
ENV BUN_INSTALL="/usr/local/share/bun-global"
ENV PATH="/usr/local/share/bun-global/bin:${PATH}"

# Install global packages
RUN bun add -g @makosst/mcp
RUN bun add -g @anthropic-ai/claude-code

# Make sure the binaries are executable by all users
RUN chmod -R 755 /usr/local/share/bun-global

# Set up environment for Claude Code
ENV ANTHROPIC_API_KEY=""

# Create a startup script that checks for mcp before running it
RUN echo '#!/bin/sh\n\
if command -v mcp >/dev/null 2>&1; then\n\
    mcp daemon &\n\
fi\n\
exec bun run server.js' > /app/start.sh && \
    chmod +x /app/start.sh && \
    chown nextjs:nodejs /app/start.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application with mcp daemon
CMD ["/app/start.sh"]