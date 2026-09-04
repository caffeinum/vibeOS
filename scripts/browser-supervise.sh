#!/bin/bash
# Keep a headless chromium alive for the local CDP browser.
#
# NAMED browser-supervise.sh ON PURPOSE — do not rename it back to
# chromium-supervise.sh. Linux truncates a process's comm to 15 characters, so
# that name becomes "chromium-superv", which CONTAINS "chromium" and is
# therefore matched by `pkill chromium` / `pgrep chromium`. Anyone debugging in
# this container who types the obvious thing kills this supervisor along with
# the browser, and chromium then stays dead while the container reports healthy
# — the exact silent death the `while true` loop below exists to prevent,
# reachable by one plausible keystroke. "browser-supervi" does not match.
# (Use `pkill -x chromium` to kill only the browser.)
#
# NOT part of the CMD's `wait -n` set. The mcp daemon is both always-running and
# load-bearing, so the container should die with it. Chromium is neither —
# browsers crash under load routinely, and taking the user's dev server down
# with a tab crash is a worse failure than the one it would prevent.
#
# `while true`, never `until`: `until cmd; do ...; done` stops when cmd
# SUCCEEDS, so a chromium exiting 0 — graceful shutdown, Browser.close over
# CDP, a handled SIGTERM — would end this supervisor silently and permanently,
# with the container still reporting healthy and nothing in the log.
#
# The profile is deliberately never wiped. It lives in the container layer, so
# it dies with the container unless the user mounts a volume — ephemeral by
# default, persistent only if they opt in. A size-capped wipe was considered and
# rejected: no browser deletes your profile at a threshold, and it would have
# meant every crash silently logged the user out.

set -u

PROFILE_DIR="${CHROME_PROFILE_DIR:-/home/nextjs/.chrome-profile}"
PORT="${CHROME_CDP_PORT:-9222}"

n=0
while true; do
  # --remote-debugging-address is explicit rather than relying on chromium
  # defaulting to loopback. This is a security property: unauthenticated CDP is
  # equivalent to RCE and can navigate file:// to read the container's
  # filesystem. The flag states the intent; the CI assertion that the socket is
  # bound to 127.0.0.1 is what enforces it. Never EXPOSE or publish this port.
  chromium \
    --headless=new \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --no-first-run \
    --no-default-browser-check \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$PROFILE_DIR" \
    about:blank
  rc=$?

  # rc is captured on the line immediately after chromium. Read it after the
  # increment below and you get the status of the assignment, which is always 0
  # — a diagnostic that reports a clean exit for every crash.
  n=$((n + 1))
  echo "[browser-supervise] exited rc=$rc, restart #$n" >&2

  # Capped backoff, so a permanently broken chromium is loud and cheap rather
  # than a hot loop that spins once a second forever behind a healthy-looking
  # container. POSIX `if`, not an arithmetic ternary: that is a bashism, and
  # this file should survive being run under a #!/bin/sh shebang.
  if [ "$n" -lt 5 ]; then
    sleep $((n * 2))
  else
    sleep 10
  fi
done
