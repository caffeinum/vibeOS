# vibeOS ([vibeos.sh](https://vibeos.sh/?ref=github-readme))

**Aleks Bykhun’s AI-native browser desktop for Codex & ChatGPT agents** — a real i686 Linux VM in WebAssembly, a desktop shell (menu bar, dock, windows), and an agent that edits the system and writes apps on demand. Optional Docker build for a full local server + Chromium desktop.

[vibeos.sh/app](https://vibeos.sh/app) · [source](https://github.com/caffeinum/vibeOS) · MIT · experimental

## try it

Open **[vibeos.sh/app](https://vibeos.sh/app)** in a Chromium browser (Chrome, Edge, Arc, …). No install. Sign in with ChatGPT (Codex) or paste your own API key — keys stay in the browser and go straight to the provider.

## what this repo is

| path | what it is |
| --- | --- |
| [`web/`](web/) | **Browser build** — static page + v86 WASM Linux (`web/README.md` has fetch/serve steps). This is what powers [vibeos.sh/app](https://vibeos.sh/app). |
| [`src/`](src/) | **Container / dev server** — Next.js desktop with tRPC, embedded Chromium (CDP), terminals, and agent chat. Run locally or via Docker. |

The browser tab is the product most people mean by “vibeOS”: the guest runs `uname` for real; agents call tools like `vm_exec`, `edit_file`, and `create_app` against that stack. External agents (Claude Code, Cursor, Codex) can drive the same desktop through **[vibeos-mcp](https://github.com/caffeinum/vibeos-mcp)** — pairing instructions live in the app under **Settings → Capabilities**.

## learn more on vibeos.sh

- [Home](https://vibeos.sh/) — overview and Docker quick start on the landing site  
- [The AI operating system for Codex & ChatGPT agents](https://vibeos.sh/ai-operating-system) — what “AI OS” means here, MCP, and how this differs from chat-only clients  

Additional SEO landing paths on **vibeos.sh** (shipped from the landing repo as they land): `/how-to-use`, `/browser-os`, `/computer-use`. Only `/ai-operating-system` is live on the site today; the others will appear at those URLs when published.

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

### container / Next.js dev

**Prerequisites:** [Bun](https://bun.sh), Docker (optional), `ANTHROPIC_API_KEY` if you use Claude-backed paths in the server build.

```bash
bun install
export ANTHROPIC_API_KEY="your-key"   # when needed
bun run dev
# http://localhost:3000
```

**Docker:**

```bash
echo "ANTHROPIC_API_KEY=your-key" > .env
docker compose up --build
```

Prebuilt image (amd64 + arm64): `ghcr.io/caffeinum/vibeos:latest` — see [vibeos.sh](https://vibeos.sh/) for `docker run` one-liner.

## project structure

```
.
├── web/                 # browser WASM desktop (v86 + agent kernel)
├── src/
│   ├── app/             # Next.js app router
│   ├── server/          # tRPC routers, browser-use, CDP
│   └── components/      # desktop UI (dock, terminal, browser, …)
├── Dockerfile
└── docker-compose.yml
```

## environment variables

- `ANTHROPIC_API_KEY` — Claude / Claude Code paths in the container build  
- `NODE_ENV` — `production` for production builds  
- `PORT` — server port (default `3000`)  

## license

MIT — see [LICENSE](LICENSE).
