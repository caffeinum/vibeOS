# Development Dockerfile with hot reload
# Builds for linux/amd64 and linux/arm64.
FROM oven/bun:1.3.14-debian

# Create a non-root user matching host user.
# trixie-based bun images ship `useradd` only, no `adduser`.
RUN useradd --system --uid 502 --gid 20 --create-home --home-dir /home/nextjs nextjs

WORKDIR /app

# Install claude-code globally as root
RUN bun add -g @anthropic-ai/claude-code

# System deps. chromium comes from Debian so it resolves on every arch —
# Chrome for Testing (what `puppeteer browsers install` fetches) has no
# linux/arm64 build and exits 1 silently there.
# jq: the agent's system prompt pipes mcp output through it
# (src/app/api/chat/route.ts). npm: terminal.tsx ships `npm install` / `npm run
# dev` / build / test as user-facing presets that run inside this container.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3-pip nodejs npm chromium jq && \
    pip3 install --break-system-packages uv && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy application files
COPY --chown=502:20 . .

RUN chown -R 502:20 /app /home/nextjs

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

# Start the mcp daemon alongside the dev server.
#
# `wait -n` returns as soon as the FIRST job exits, so the container dies if
# either process does. Previously the daemon was backgrounded with nohup and
# its status discarded: it could exit 127 on a missing binary and the container
# still looked healthy, because `bun run dev` held the foreground and vouched
# for a process it never checked.
#
# bash, not sh: Debian's sh is dash, which has no `wait -n`.
# `exit $?` is load-bearing — keep it if anything is ever added after this line.
CMD ["bash", "-c", "/app/node_modules/.bin/mcp daemon & bun run dev & wait -n; exit $?"]
