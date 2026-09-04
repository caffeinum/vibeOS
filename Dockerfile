# Development Dockerfile with hot reload
# Builds for linux/amd64 and linux/arm64.
FROM oven/bun:1.3.14-debian

# OCI metadata. `image.source` is what links the GHCR package back to this
# repo -- without it the published package page shows no source at all.
LABEL org.opencontainers.image.source="https://github.com/caffeinum/vibeOS" \
      org.opencontainers.image.url="https://vibeos.sh/?ref=ghcr" \
      org.opencontainers.image.title="vibeOS" \
      org.opencontainers.image.description="an open source AI-native desktop -- every window written on demand" \
      org.opencontainers.image.licenses="MIT"

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

# Local CDP endpoint. Loopback only, and never EXPOSEd or published: an
# unauthenticated CDP port is equivalent to remote code execution and can
# navigate file:// to read this container's filesystem. The Next server proxies
# it in-process.
ENV CHROME_CDP_PORT=9222
ENV CHROME_PROFILE_DIR=/home/nextjs/.chrome-profile

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
#
# browser-supervise.sh is started but deliberately kept OUT of the wait set: it
# restarts itself, and a tab crash must not take the dev server with it.
#
# Hence `wait -n "$mcp" "$dev"` with explicit PIDs. Bare `wait -n` waits for ANY
# background job, which would have silently included chromium and reintroduced
# exactly the coupling this avoids.
CMD ["bash", "-c", "/app/scripts/browser-supervise.sh & /app/node_modules/.bin/mcp daemon & mcp=$!; bun run dev & dev=$!; wait -n \"$mcp\" \"$dev\"; exit $?"]
