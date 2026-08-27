#!/usr/bin/env python3
"""
Serves the vibeOS web demo and proxies model calls.

The API key stays in this process. It is never sent to the browser, never
embedded in the page, and never appears in a URL — which matters because this
is meant to be exposed over a public tunnel. The page calls /api/generate on
its own origin; this process adds the key and forwards to Anthropic.

  ANTHROPIC_API_KEY=sk-... DEMO_TOKEN=abc123 python3 server.py [port]

DEMO_TOKEN gates /api/generate so a public tunnel URL is not an open, billable
endpoint. Static files are served without it.
"""
import json
import os
import socket
import sys
import threading
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
# Fall back to a key file so the secret never appears in a command line
# (visible to `ps`) or in this repo's history.
if not OPENAI_KEY:
    try:
        OPENAI_KEY = (open(os.path.join(ROOT, ".openai-key")).read().strip())
    except OSError:
        pass
DEMO_TOKEN = os.environ.get("DEMO_TOKEN", "")

# Whichever key is present wins; set VIBEOS_PROVIDER to force one.
PROVIDER = os.environ.get("VIBEOS_PROVIDER") or ("anthropic" if ANTHROPIC_KEY else "openai" if OPENAI_KEY else "")
MODEL = os.environ.get("VIBEOS_MODEL") or ("claude-sonnet-5" if PROVIDER == "anthropic" else "gpt-5.6-terra")
API_KEY = ANTHROPIC_KEY if PROVIDER == "anthropic" else OPENAI_KEY

SYSTEM = """You build things for vibeOS, a small desktop OS. It has two places to
put software, and you choose which one the request needs.

Reply with SOURCE ONLY — no markdown fences, no commentary before or after.

=== TARGET 1: a desktop window (default) ===
Header, exactly:
    // @title <Short Name>
    // @target browser
    // @requires <space-separated caps, or `none`>
Capabilities: `files` (read the user's workspace), `shell` (run commands in the
VM). Use `none` unless genuinely needed.
Then: export default function (mount, api) { ... }
  - `mount` is an empty HTMLElement. Render into it with mount.innerHTML and
    wire listeners.
  - `api.list()` -> [{name, dir}] for the workspace (needs `files`).
  - `api.shell(cmd)` -> stdout as a string from the VM (needs `shell`).
  - Plain JavaScript only. No JSX, no imports, no external URLs, no build step.
  - Style inline for a dark UI: text #e8eaf0, panels #0c0e14, borders #23262f.
  - Under 60 lines, and it must actually work.

=== TARGET 2: a program inside the VM ===
Use this when the request is about files, text processing, system tasks, or
anything that wants a shell rather than a UI. Header, exactly:
    // @title <Short Name>
    // @target vm
    // @file <name.sh>
Then a POSIX shell script for BusyBox ash. Constraints that matter:
  - BusyBox only: no bash arrays, no GNU-only flags, no package manager, no
    network. Available: sh, ls, cat, grep, sed, awk, wc, sort, head, tail, cut,
    tr, find, echo, test.
  - The workspace is mounted at /mnt. Read and write there.
  - Print results to stdout; that is what the user sees."""


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # keep the tunnel log readable
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s - %s\n" % (self.address_string(), self.path.split("?")[0]))

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/health":
            return self._json(200, {"ok": True, "model": MODEL, "provider": PROVIDER,
                                    "keyed": bool(API_KEY), "gated": bool(DEMO_TOKEN)})
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/generate":
            return self._json(404, {"error": "no such endpoint"})

        if DEMO_TOKEN and self.headers.get("x-demo-token") != DEMO_TOKEN:
            return self._json(401, {"error": "Missing or wrong demo token."})
        if not API_KEY:
            return self._json(503, {"error": "This server was started without ANTHROPIC_API_KEY."})

        try:
            n = int(self.headers.get("content-length", 0))
            body = json.loads(self.rfile.read(n)) or {}
            prompt = (body.get("prompt") or "").strip()
            history = body.get("history") or []          # [{role, content}], recent turns
        except Exception:
            return self._json(400, {"error": "Malformed request."})
        if not prompt:
            return self._json(400, {"error": "Empty prompt."})

        if PROVIDER == "openai":
            url = "https://api.openai.com/v1/chat/completions"
            payload = {
                "model": MODEL,
                "max_completion_tokens": 2000,
                "messages": [{"role": "system", "content": SYSTEM}]
                            + history[-6:]
                            + [{"role": "user", "content": prompt}],
            }
            headers = {"authorization": f"Bearer {API_KEY}", "content-type": "application/json"}
        else:
            url = "https://api.anthropic.com/v1/messages"
            payload = {
                "model": MODEL,
                "max_tokens": 2000,
                "system": SYSTEM,
                "messages": history[-6:] + [{"role": "user", "content": prompt}],
            }
            headers = {"x-api-key": API_KEY, "anthropic-version": "2023-06-01",
                       "content-type": "application/json"}

        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read())
        except urllib.error.HTTPError as e:
            # Surface the real upstream reason — "credit balance is too low"
            # reads very differently from "invalid key", and guessing wastes time.
            try:
                detail = json.loads(e.read()).get("error", {}).get("message", "")
            except Exception:
                detail = e.reason
            return self._json(502, {"error": f"{PROVIDER} returned {e.code}: {detail}"})
        except Exception as e:
            return self._json(502, {"error": f"Could not reach {PROVIDER}: {e}"})

        if PROVIDER == "openai":
            source = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
        else:
            source = "".join(b.get("text", "") for b in data.get("content", [])
                             if b.get("type") == "text").strip()
        if source.startswith("```"):  # strip a fence if the model adds one anyway
            source = source.split("\n", 1)[-1]
            source = source.rsplit("```", 1)[0].strip()
        target = "vm" if "@target vm" in source else "browser"
        if target == "browser" and "export default" not in source:
            return self._json(502, {"error": "Model did not return a module.", "source": source[:400]})
        return self._json(200, {"source": source, "model": MODEL, "target": target})


class V6Server(ThreadingHTTPServer):
    address_family = socket.AF_INET6


def serve(server):
    server.serve_forever()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(ROOT)
    handler = partial(Handler, directory=ROOT)

    # Listen on BOTH loopback families. "localhost" resolves to ::1 on macOS,
    # so an IPv4-only bind silently misses browsers and tunnels that pick IPv6
    # -- and worse, a second static server can occupy the other family on the
    # same port, so half the requests reach the wrong process. That is exactly
    # what happened here: ngrok reached an unrelated http.server on ::1 and
    # every /api call 404'd.
    servers = []
    for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        try:
            cls = V6Server if family is socket.AF_INET6 else ThreadingHTTPServer
            servers.append(cls((host, port), handler))
        except OSError as e:
            print(f"  note: could not bind {host}:{port} ({e.strerror}) — "
                  f"something else may already be on this port", flush=True)

    if not servers:
        sys.exit(f"Nothing could bind port {port}. Stop whatever is using it and retry.")

    print(f"vibeOS demo on http://localhost:{port}  "
          f"({len(servers)} listener{'s' if len(servers) > 1 else ''})  "
          f"provider={PROVIDER or 'none'} model={MODEL}  "
          f"key={'yes' if API_KEY else 'NO'}  gated={'yes' if DEMO_TOKEN else 'no'}", flush=True)

    for s in servers[1:]:
        threading.Thread(target=serve, args=(s,), daemon=True).start()
    serve(servers[0])
