# vibeOS ([vibeos.sh](https://vibeos.sh/?ref=github-readme))

**Aleks Bykhun’s AI-native browser desktop for Codex & ChatGPT agents** — a real i686 Linux VM in WebAssembly, a desktop shell (menu bar, dock, windows), and an agent that edits the system and writes apps on demand. One `docker run` gets you the same desktop locally, with no request to our servers.

[vibeos.sh/app](https://vibeos.sh/app) · [source](https://github.com/caffeinum/vibeOS) · MIT · experimental

## try it

Open **[vibeos.sh/app](https://vibeos.sh/app)** in a Chromium browser (Chrome, Edge, Arc, …). No install. Sign in with ChatGPT (Codex) or paste your own API key — keys stay in the browser and go straight to the provider.

## what this repo is

| path | what it is |
| --- | --- |
| [`web/`](web/) | **Browser build** — static page + v86 WASM Linux (`web/README.md` has fetch/serve steps). This is what powers [vibeos.sh/app](https://vibeos.sh/app). |
| [`src/`](src/) | **Legacy** — the original Next.js/tRPC app with an embedded Chromium. Not what the published image runs any more; see the note at the end. |

The browser tab is the product most people mean by “vibeOS”: the guest runs `uname` for real; agents call tools like `vm_exec`, `edit_file`, and `create_app` against that stack. External agents (Claude Code, Cursor, Codex) can drive the same desktop through **[vibeos-mcp](https://github.com/caffeinum/vibeos-mcp)** — pairing instructions live in the app under **Settings → Capabilities**.

## learn more on vibeos.sh

- [Home](https://vibeos.sh/) — overview and Docker quick start on the landing site  
- [The AI operating system for Codex & ChatGPT agents](https://vibeos.sh/ai-operating-system) — what “AI OS” means here, MCP, and how this differs from chat-only clients  

- [How to use vibeOS](https://vibeos.sh/how-to-use) — the hosted page, the Docker image, pairing an agent
- [Linux in the browser](https://vibeos.sh/browser-os) — what v86 is doing and what it costs
- [Computer use](https://vibeos.sh/computer-use) — giving an agent a machine rather than a chat box

- [Is vibeOS real?](https://vibeos.sh/is-vibeos-real) — history, satire vs substance, naming collisions  

## not this project

Unrelated projects also called “VibeOS”:

- **[kaansenol5’s VibeOS](https://github.com/kaansenol5/VibeOS)** — a QEMU-based OS built with coding agents; different author, different stack.  
- **[VibeOS Cloud](https://vibeoscloud.com/)** (`os.vibeoscloud.com`) — a separate browser OS product with its own cloud sync and SDK; no affiliation.  

This repository is **caffeinum/vibeOS** — open source, MIT, maintained by Aleks Bykhun ([@caffeinum](https://github.com/caffeinum)).

## run locally

### browser build (`web/`)

See [`web/README.md`](web/README.md). Short version:

```bash
cd web && ./fetch-assets.sh && bunx serve .
# open http://localhost:3000
```

Hosted at [vibeos.sh/app](https://vibeos.sh/app), the page also uses small APIs on vibeos.sh (`/api/agent/prompt`, OAuth relay). A static local serve is enough to boot the VM; the full tool-using agent needs those endpoints or the container build below.

### run the whole thing yourself (Docker)

```bash
docker run -p 127.0.0.1:3000:3000 ghcr.io/caffeinum/vibeos
# then open http://localhost:3000/app
```

`linux/amd64` + `linux/arm64`, ~625 MB. That is the same desktop as
[vibeos.sh/app](https://vibeos.sh/app), served entirely from the container: the
static page, both chunked Linux disks, the BusyBox ISO, the guest's networking,
the agent relay and the CORS proxy. **No CDN, no account, no API key.** The check behind that
fails if any request leaves the container *while the desktop boots*, websockets
included — which is the claim that matters, because it is the claim the hosted
page cannot make. Once you are using it, the guest's own traffic goes out
through the container, and a model key you paste goes straight to your
provider: both leave your machine, neither goes to us.

Two things it does **not** do, because the honest version is shorter than the
discovery:

- **Past loopback there is no access control.** Origin and Host checks stop a
  page you merely visit from reaching it, but they constrain browsers — a
  program sets both headers itself. There is no authenticated ingress, so the
  `127.0.0.1:` above is load-bearing and remote or multi-user deployment is
  unsupported.
- **It is not a sandbox.** By default the guest and the proxy reach your LAN and
  this host's services, deliberately — that is the point of running it locally.
  Link-local and cloud metadata addresses stay refused even so. The accurate
  line is *"nothing goes to our servers"* — not *"nothing leaves your box"*,
  which the guest's own web traffic does, and not *"it cannot touch your
  machine"*, which the LAN reach contradicts.

No model key is needed or used by the server: you paste yours into the desktop
and the browser calls your provider directly.

Pairing an external agent needs `--relay`, because the package defaults to the
public relay. Copy the line the desktop's agent pane prints:

```bash
claude mcp add vibeos -- npx vibeos-mcp --token <token> --relay ws://localhost:3000/api/mcp/relay
```

A bare `npx vibeos-mcp` link is refused by a self-hosted desktop, on purpose,
naming the command that fixes it.

## project structure

```
.
├── web/                 # browser WASM desktop (v86 + agent kernel) — the product
├── src/                 # legacy Next.js/tRPC app (see below)
├── Dockerfile           # builds the legacy app, NOT the published image
└── docker-compose.yml   # ditto
```

**Where the published image comes from.** `ghcr.io/caffeinum/vibeos` is built
from the landing repo (private), not from the `Dockerfile` in this repo. So `docker compose up --build` here
gives you the legacy app, not the desktop — use the `docker run` line above for
that. `web/` is a byte-for-byte mirror of what that image and
[vibeos.sh/app](https://vibeos.sh/app) serve.

## the legacy Next.js app (`src/`)

The original vibeOS: a Next.js server with tRPC, an embedded Chromium driven
over CDP, terminals and agent chat. It still builds and still runs —

```bash
bun install && bun run dev    # http://localhost:3000
```

— and `ANTHROPIC_API_KEY` is the one environment variable it wants. It is not
what `ghcr.io/caffeinum/vibeos` publishes any more and it is not where new work
goes. Kept because it is the history of the project and some of it still works
better than its replacement.

## license

MIT — see [LICENSE](LICENSE).
