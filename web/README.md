# vibeOS in the browser

A build of vibeOS that runs entirely in a tab. Hosted at
**[vibeos.sh/app](https://vibeos.sh/app)**.

    ./fetch-assets.sh          # ~11 MB of v86 engine + a small Linux image
    python3 -m http.server 8080
    open http://localhost:8080

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

## server.py

Optional. Serves this folder and proxies model calls so a key can live in a
process instead of a browser — useful for demos over a tunnel. The hosted build
does not use it.
