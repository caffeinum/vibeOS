# vibeOS in the browser

A build of vibeOS that runs entirely in a tab. Hosted at
**[vibeos.sh/app](https://vibeos.sh/app)**.

    ./fetch-assets.sh          # ~11 MB of v86 engine + a small Linux image
    bunx serve .
    open http://localhost:3000

It is a static page. There is no server component and no build step.

Served this way the agent runs in **one-shot mode**: paste a key and it writes
a window per request. The tool-using agent — list the workspace, run commands
in the VM, restyle the desktop, search the web — needs the small API that
vibeos.sh hosts alongside this page (`/api/agent/prompt`, and the ChatGPT
sign-in relay). The page detects which it has and says so.

## What it actually is

A real x86 VM boots in the background (v86, BSD-licensed) and is the system of
record. The desktop is just windows onto it. An agent writes apps at runtime —
either a **browser window** (an ES module, imported live, no build step) or a
**shell script installed into the VM**.

- **Apps are real files.** Generated apps land in the VM and are mirrored to a
  folder you pick on disk, so the native build can open the same workspace.
- **Sync is a diff**, not a mount: push/pull per file, auto every 60s, plus a
  live push whenever the VM writes. Conflicts are never resolved automatically.
- **Bring your own key.** It is stored in `localStorage` and sent straight to
  Anthropic or OpenAI. No key ships with the app and none reaches vibeos.sh.

## What a tab cannot do

Your files outside folders you explicitly grant (Chromium only — Firefox and
Safari have no picker), your binaries, your processes. The VM's shell is real
but it runs on a virtual disk. That boundary is why the native build exists,
and the UI marks apps that need capabilities this mode lacks instead of letting
them fail on open.

## Networking

The VM has no network unless you give it a relay, under Settings > Network.
v86's published build supports `wisp://` and `ws://` backends; the `fetch`
backend that a plain CORS proxy would drive exists on v86's master branch but
is **not** in the npm package, so WISP is the working option — and the better
one, since it carries real TCP and therefore TLS and `apt`.

Verified against a public WISP server: the guest gets a DHCP lease and
`wget http://icanhazip.com` returns a public address.
