/**
 * The tool surface and the operating manual of vibeOS, said once.
 *
 * Every agent that drives the desktop reads its tools from here: the built-in
 * agent (kernel/agent.js, both loops), the Codex route on the server
 * (lib/agent-tools.ts turns TOOL_SCHEMAS into AI SDK tools), and an agent on
 * vibeos-mcp (RemoteBridge.toolsFrame sends MCP_TOOL_SCHEMAS and
 * MCP_INSTRUCTIONS). The app contract every window app is held to, the
 * paste-key one-shot prompt, the shell line per machine image and the relay's
 * port list live here for the same reason: they used to be two or three hand
 * copies pinned together by tests, and they drifted anyway.
 *
 * Served, never forked — like skills.js and oauth.js, and not in OS_FILES. A
 * fork of kernel/agent.js reads the CURRENT surface on every boot; a fork made
 * before this file existed still carries its own constants and never looks
 * here. Everything is inside one function so no top-level name collides with
 * a kernel file's: the only global is VibeOSTools.
 *
 * Loaded as a classic script by index.html before the kernel and imported by
 * lib/ on the server (and by the container's front server under Node). Plain
 * JS, no bundler.
 */
var VibeOSTools = (function () {
// The relay's port list (lib/wisp-server.ts gives it to wisp-js), the tab's
// pre-check (kernel/net.js Net.refusal) and the sentence in the app contract.
const NET_PORTS = [80, 443, 21, 22, 70, 1965, 3000, 8080, 8443];

// What a VM script may assume, per machine image. The prompts are written
// with busybox's line and the image that actually booted swaps it in
// (lib/system-prompt.ts promptForImage on the server, kernel/agent.js forImage
// in the tab, which reads IMAGES[].shellLine — kernel/machine.js takes them
// from here). alpine's must name what scripts/alpine/Dockerfile installs.
const SHELL_LINES = {
  busybox: 'Then a POSIX shell script for BusyBox ash. No bash arrays, no GNU-only flags, no package manager, no network. Available: sh ls cat grep sed awk wc sort head tail cut tr find echo test. The workspace is at /mnt. Print results to stdout.',
  alpine: 'Then a POSIX shell script for Alpine Linux 3.20 (BusyBox ash, musl). apk works (run apk update first; the network is on): apk add <pkg>. Installed: busybox sh grep sed awk find, curl wget ca-certificates, git nano less — the BusyBox versions, so no GNU-only flags (no find -printf, no ls --time-style, no sed -z; list a directory with ls -1p). No bash, no glibc — a glibc binary will not run without gcompat. The workspace is at /mnt. Print results to stdout.',
  debian: 'Then a bash script for Debian 12. apt-get works (run apt-get update first; the network is on). Common tools are installed: bash coreutils grep sed awk find curl wget git nano vi. python3 is NOT installed by default. The workspace is at /mnt. Print results to stdout.',
};

// The contract a window app is held to: the three headers, what api offers,
// the layout rules, the size hint. Both system prompts embed it and
// create_app's description carries it, so an agent on vibeos-mcp — which
// never sees a prompt of ours — reads the same rules.
const APP_CONTRACT = `// @title <Short Name>
// @target browser
// @requires <space-separated caps, or none>
Pass icon with create_app (required): inline <svg>… markup, a data:image/svg+xml or data:image/png URL, or an http(s) URL to a PNG/SVG the desktop downloads. It is shown in the dock, the window title bar, and the chat card. Simple apps: a 32×32 SVG with one shape or letter matching the app.
Caps: files (read the workspace), shell (run commands in the VM), tty (a terminal on the VM: stdin, Ctrl-C, full-screen programs), net (raw TCP through the relay), ai (the connected model, api.ai.generate and api.ai.image). Use none unless needed.
Optional fourth header, where and how big the window opens: // @geometry <top-left|top-right|bottom-left|bottom-right> [<w>x<h>] or // @geometry <x>,<y>,<w>,<h> or // @geometry <w>x<h> alone (px; without it the window cascades at 430x320; a window is at least 300x180, is kept on screen under the menubar and clear of the dock, and is no bigger than the desktop). A helper, mascot or widget "in the corner of the screen" is a small window with a corner geometry, e.g. // @geometry bottom-right 300x220 — never position:fixed or a transform to escape the window.
Then: export default function (mount, api) { ... }
mount is a fixed-size pane (~430x320px, resizable). api.list() -> [{name,dir}] (needs files). api.onResize((w,h) => ...) when layout depends on size. api.mountSize() -> {width,height}.
api.shell(cmd, timeoutMs = 600000) -> Promise<string> (needs shell): one-shot commands. Waits up to ten minutes by default, because what an app runs is what a person typed into it — an apk add, a git clone. stdout and stderr together, ANSI stripped; rejects on timeout or while the machine is not running. It is ONE shell session shared by every app that uses it and the agent, so a cd leaks into everyone else's commands: never cd, use absolute paths. No stdin and no tty: vi, top, less, an interactive zsh hang until interrupted — those want api.tty(). List a directory with ls -1p. Pass a shorter timeoutMs for a quick status line you would rather see fail than wait on; a long build can go to the background, cmd > /mnt/job.log 2>&1 &, followed with api.shell("tail -n 20 /mnt/job.log").
api.tty() -> { write(bytesOrString), onData(fn) -> off, resize(cols, rows), close() } (needs tty): a terminal is api.tty(): bytes both ways, ctrl-c, top, nano, passwords work; api.shell is for one-shot commands. It is its own shell on the machine's second serial line, not the one api.shell and the agent share, so a cd there stays there. The line echoes what you write: paint what onData delivers (\\r, \\n, \\b and ANSI escapes; answer \\x1b[6n with \\x1b[row;colR or vi and ash wait on it) instead of echoing keys yourself; send Enter as \\r, Ctrl-C as \\x03, arrows as \\x1b[A..D, and resize(cols, rows) when the pane changes. One tty per machine: while the built-in Terminal or another app holds it, api.tty() throws naming the holder — show that message; closing that window releases it.
api.net.connect(host, port) -> { write(bytesOrString), onData(fn) -> off, onClose(fn) -> off, close(), state, reason } (needs net): opens raw TCP through the relay for a TCP client — a redis, irc or smtp toy; http stays on the proxy and the Browser, not this. Plain TCP only (no tls option; https means fetch or curl in the machine). localhost, private and loopback addresses and ports outside the relay's list (${NET_PORTS.join(', ')}) throw naming the rule; the relay closes a stream it refuses and onClose says why. The relay is a serverless function that ends about every 13 minutes: every open stream then closes with "network error: the relay reconnected and the connection was lost", so a long-lived client (irc, redis) must reconnect from onClose. A write after close throws. Closing the window closes the connection.
api.ai.generate({ prompt, images?, json?, system?, maxTokens? }) -> Promise<string | object> (needs ai): the model connected to this desktop — the tab's own, or the connected agent's (MCP sampling), in which case a call may take up to two minutes while a person approves it, so show your own "asking…" state — one plain completion with no tools. Anything that needs judgment — identify what is in a picture, estimate, summarise, classify, write — is a call to it, never a keyword table, a lookup of your own, or a "cannot do this in the browser" note. images is an array of data urls (canvas.toDataURL('image/jpeg') of a video frame, a file read as a data url); json: true asks for one JSON object and returns it parsed (name the keys in prompt); system replaces the one-line default. The reply is text the app shows with textContent; it rejects with the provider's own error — show that too. A window that needs it declares // @requires ai and shows a connect prompt while no model is present, then runs when one is.
api.ai.image({ prompt, size?, inputImage?, width?, height? }) -> Promise<{ dataUrl, size, asked, revisedPrompt? }> (needs ai): OpenAI image generation with the person's ChatGPT sign-in (gpt-image-2, a paid plan's daily image allowance) or OpenAI API key (gpt-image-1). One image takes about 1–2 minutes, so show elapsed time while you wait. size (asked) is 1024x1024, 1536x1024, or 1024x1536 (or pass width/height to pick the closest); the ChatGPT path may answer another size, which the result's size says. inputImage is an optional data url to edit or continue from. Rejects while another image is generating, on moderation, and with the provider's error text (a Free ChatGPT plan is refused that way).

Layout rules (required):
- Root element: width:100%; height:100%; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden. No document scroll, no min-height larger than the window, no fat browser scrollbars on mount.
- Fit the actual mount, not a desktop-sized page. Modest type (13-15px body, not huge serif headlines) and tight padding. Empty states must fit without overflowing.
- Do not imitate getslash.co / Slash-style UIs with oversized serif titles and generous vertical padding — those overflow a ~430×320px window immediately.
- If a region scrolls, use an inner child with overflow:auto and scrollbar-width:thin (or class app-scroll) — never scroll mount itself.
- Respond to resize: use flex/%/min-height:0 throughout, or api.onResize to reflow.

Plain JavaScript, no JSX, no external URLs. ONE import resolves and nothing else does: import { html, render } from 'lit' (lit-html 3, vendored with the desktop — no build step, no network). Its interpolations escape by default, so render(html\`<p>\${name}</p>\`, mount) is safe where innerHTML is not: reach for it instead of building markup by hand, and re-render the whole view on change rather than patching nodes. Plain DOM is fine for something small. Any other import, or any URL, fails at runtime. Aim for about 200 lines and stay under 1000. It must work.`;


// The whole api an app gets, in one line, at the TOP of create_app's
// description and of the MCP instructions. Some MCP clients cut a long tool
// description short: a Claude Code session on vibeos-mcp lost the contract
// right around api.tty() and had to read windows.js to find write/onData/
// resize/close. The details stay in APP_CONTRACT below; this is the index
// that survives a cut, and it names where the source is.
const APP_API_INDEX = 'App api (mount, api; // @requires cap): api.list() -> [{name,dir}] (files); api.shell(cmd, timeoutMs?) -> Promise<string> (shell); api.tty() -> { write(bytesOrString), onData(fn) -> off, resize(cols, rows), close() } (tty); api.net.connect(host, port) -> { write, onData(fn) -> off, onClose(fn) -> off, close(), state, reason } (net); api.ai.generate({ prompt, images?, json?, system?, maxTokens? }) -> Promise<string|object> (ai); api.ai.image({ prompt, size?, inputImage? }) -> Promise<{dataUrl, size}> (ai, 1–2 min); api.onResize((w, h) => …); api.mountSize() -> {width, height}. read_file system/ui/windows.js, function createAppApi.';

const CREATE_APP_LEAD = 'Create a vibeOS desktop window app (// @target browser, the contract below) or install a VM script (// @title, // @target vm, // @file <name.sh>, then a shell script for the Linux the prompt names). Pass title, complete source, and icon (window apps: inline SVG or PNG URL). The reply names the dock entry and the file.\n' + APP_API_INDEX + '\nA window app is held to this contract:';
const CREATE_APP_DESCRIPTION = CREATE_APP_LEAD + '\n' + APP_CONTRACT;

const SEARCH_FILE_DESCRIPTION = 'Find lines matching a regex. path is one file, a directory (system/, system/ui/) or a glob (system/**/*.js, apps/*.js): a directory or glob searches every text file under it and each hit carries file and line; 60 hits at most, binaries and files over 1 MB skipped and named; system/chat.json and the snapshots are never searched or listed. Use before edit_file on a system/ file. A path that matches nothing is refused naming what exists there.';
const LIST_FILES_DESCRIPTION = 'List the workspace. path is \'\' for the top (apps/, data/, system/) or a directory: apps/, data/, system/, system/kernel, system/ui. Entries carry kind (file|dir), size and modified; under system/ every file the OS loads is listed whether or not a copy is stored, with source (stored: your fork boots next; served: stock) and booted (which one this page runs — stored but booted served means reload_os is pending). A path that does not exist is refused naming what its parent holds.';

const MCP_INSTRUCTIONS_LEAD = `You are driving vibeOS through vibeos-mcp: a small desktop OS running in one browser tab, with a Linux VM (v86, i686) inside it. Every tool here runs in that tab; you see nothing else of it, so start with read_desktop (windows, dock, machine state; { window } for a window's text, { screen: 'png' } for the VM's VGA screen — there is no screenshot of the desktop itself). If a call fails or a window misbehaves, call read_desktop and check its errors: they are exactly what the person saw on the red bar, newest first, with where each came from.

The OS is files in the person's workspace, and you have root on them. system/kernel/*.js never hot-reloads (machine.js the VM, workspace.js the folder and sync, agent.js the model and these tools, boot.js the window registry and the boot); system/ui/*.js is what people see (windows.js, dock.js, chat.js, browser.js, settings.js) and reloads live; system/os.css is every style, and a theme is a [data-theme="id"] block there with a /* @theme id: Title — summary */ header on the line before. A change to the desktop is an edit to one of those files: search_file, read_file around the place, edit_file with an exact unique anchor, then reload_ui for a ui file (live, the turn continues) or reload_os for a kernel file or os.css (the page reloads; call it once, last — the pairing survives it, call again a few seconds later if a call fails right after). After reload_ui, read_desktop { window } the window you changed before saying it changed. Your first edit forks the served file into the workspace; a fork that fails to load is skipped on the next boot and the desktop says so, and write_file('') retires it.

The machine: vm_exec runs a shell line on ttyS0 and returns its output (timeout_s up to 600); /mnt is the workspace's data/ and apps/ flat, /mnt/system a read-only copy of the OS source for cat, grep and diff. Apps are files under apps/: a .js with a // @title header is a dock entry, and create_app writes one and opens it. Generated apps must use the desktop's CSS custom properties (var(--text), var(--panel), var(--accent) …), never hardcoded colours.

Results are JSON. A reply over 128 KB is refused naming the size — narrow the request. Everything you send and read goes through a relay in plaintext, and the token you hold is root on this desktop.

The person can type in vibeOS chat while you work: those lines are not pushed to you. When a tool result includes mailbox_hint, call get_mailbox and answer with reply_mailbox if you want a bubble in chat. Storage: data/mcp-mailbox-in.jsonl (human lines) and data/mcp-mailbox-state.json (read cursor).`;

const READ_DESKTOP_DESCRIPTION = 'What the desktop looks like, as text: every open window (app id, title, minimized, z-order — first is on top — geometry, whether it is the built-in chat/Browser/Settings or a generated app and its file), the dock entries, the machine pill (VM.state, image, net, tty), the theme, and errors: the page\'s recent errors newest first ({ time, message, source, shown } — shown: true is what the red bar showed the person; source third-party is a browser extension\'s throw kept off it). Pass { window: <title or app id> } for that window\'s body as trimmed text, one line per block (scripts and styles dropped, 8 KB cap); add { dom: true } for its sanitised outerHTML instead (no script, style, link or on* attributes, no javascript: urls, media and form urls replaced by data:, 16 KB cap); either way the value of a password or hidden input is withheld. { screen: \'png\' } is the machine\'s VGA screen as image {mimeType, data} (a jpeg no wider than 1024, under the relay\'s 128 KB frame) with the text console\'s rows as text when it is in text mode. A bitmap of the desktop itself is not available (no html2canvas is vendored): the text and DOM views are the substitute. Everything here is read; nothing runs.';

const PASTE_KEY_SYSTEM_PROMPT = `You build things for vibeOS, a small desktop OS. Reply with SOURCE ONLY - no markdown fences, no commentary.

TARGET 1, a desktop window (default). Header exactly:
${APP_CONTRACT}

TARGET 2, a program inside the VM. Use when the request is about files, text processing or system tasks. Header exactly:
// @title <Short Name>
// @target vm
// @file <name.sh>
${SHELL_LINES.busybox}

A remote agent (someone's own Claude Code, Cursor or Codex, through vibeos-mcp) may be connected to this desktop and edits or commands can come from it in parallel: a stale anchor in edit_file is refused, so re-read before you edit rather than assume the file is as you left it.`;

const TOOL_SCHEMAS = [
  { name: 'create_app', description: CREATE_APP_DESCRIPTION,
    parameters: { type: 'object', properties: {
      title: { type: 'string', description: 'Short display name for the app' },
      source: { type: 'string', description: 'Complete module source: // @title, // @target browser|vm, // @requires, then export default function (mount, api). Browser apps: root height:100%, display:flex, overflow:hidden; scroll inner panes only.' },
      icon: { type: 'string', description: 'Dock/window icon: inline <svg>… markup, a data:image/svg+xml or data:image/png URL, or an http(s) URL to a PNG/SVG (downloaded in the browser). Required for window apps; omit for // @target vm scripts.' },
    }, required: ['title', 'source', 'icon'] } },
  { name: 'vm_exec', description: 'Run a shell command in the vibeOS Linux VM and return its output (stdout and stderr, ANSI stripped). Waits 20 s by default; pass timeout_s (up to 600) for an install or a build, or background it (cmd > /mnt/job.log 2>&1 &) and tail the log.',
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'Shell command to execute in the VM' }, timeout_s: { type: 'integer', minimum: 1, maximum: 600, description: 'Seconds to wait before the command is interrupted with Ctrl-C and the call fails. Default 20.' } }, required: ['command'] } },
  { name: 'list_apps', description: 'List apps already saved in the vibeOS workspace. .js files without a // @title header are not apps and come back under unlisted with the reason; add the header with edit_file if the user wants one in the dock. The reply also carries the /mnt mapping: the mount is flat and subdirectories under /mnt are not mirrored, and unmirrored names the root entries the mirror skipped (directories, symlinks, special files).',
    parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'read_desktop', description: READ_DESKTOP_DESCRIPTION,
    parameters: { type: 'object', properties: { window: { type: 'string', description: 'A window\'s title or app id: its body as text, one line per block' }, dom: { type: 'boolean', description: 'With window: the sanitised outerHTML instead of text' }, screen: { type: 'string', enum: ['image', 'png'], description: 'The machine\'s VGA screen as an image, with the text console\'s rows' } }, required: [] } },
  { name: 'list_files', description: LIST_FILES_DESCRIPTION,
    parameters: { type: 'object', properties: { path: { type: 'string', description: "'' for the top, or a directory: apps/, data/, system/, system/kernel, system/ui" } }, required: [] } },
  { name: 'read_file', description: 'Read a file from the workspace. The operating system is system/kernel/*.js (the machine, the workspace, the agent loop; reload_os to apply) and system/ui/*.js (windows, dock, chat, Browser, Settings; reload_ui applies live), styled by system/os.css. Optional line range for big files.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, from: { type: 'integer' }, to: { type: 'integer' } }, required: ['path'] } },
  { name: 'search_file', description: SEARCH_FILE_DESCRIPTION,
    parameters: { type: 'object', properties: { path: { type: 'string' }, pattern: { type: 'string' } }, required: ['path', 'pattern'] } },
  { name: 'edit_file', description: 'Replace one exact occurrence of old with new in a workspace file. The first edit of a system/ file forks it from the served copy into the workspace; from then on that copy boots. Call reload_ui to apply a system/ui edit live, reload_os for system/kernel or system/os.css.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
  { name: 'write_file', description: 'Write a whole workspace file (apps/*.js, data/*, system/kernel/*.js, system/ui/*.js, system/os.css). Prefer edit_file for changes.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'reload_ui', description: 'Re-import the ui — system/ui/*.js — under the running kernel, live: the machine, the workspace, the chat log and this turn all stay, open windows are repainted by the new ui, and the turn goes on, so say what changed after it. A ui that does not parse, fails to import or throws while painting is refused with the error and the previous ui keeps running. Refuses when no system/ui file has been edited.',
    parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'reload_os', description: 'Reload the page so edits to system/kernel/*.js or system/os.css take effect (a system/ui edit needs only reload_ui). The reload ends this turn — nothing you say after it reaches the user — so make every edit first, call it once, last, and pass a note: it is shown in the chat after boot. Refuses when nothing has been edited. If the edited OS fails to boot, the stock one runs next time and says so — you cannot lock yourself out. Through vibeos-mcp the pairing survives the reload: the tab resumes it after boot and the package reconnects on its own; a call made while the page is down fails with peer not connected — wait a few seconds and call again.',
    parameters: { type: 'object', properties: { note: { type: 'string', description: 'One line shown in the chat after the reboot, e.g. what changed' } }, required: [] } },
  { name: 'web_fetch', description: 'Read a web page as text. Goes through the vibeOS proxy, so scripts never run and the page arrives as its raw markup converted to text. Use it to check a fact or an API\'s shape before writing code against it.',
    parameters: { type: 'object', properties: { url: { type: 'string', description: 'Absolute http(s) URL to read' } }, required: ['url'] } },
  { name: 'web_search', description: 'Search the web and get back result titles and URLs. Follow up with web_fetch to read one. Use when you need current information you do not have.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to search for' } }, required: ['query'] } },
  { name: 'get_mailbox', description: 'Read messages the person typed in vibeOS chat while you drive the desktop through vibeos-mcp. Returns new lines since the last read (or since after id when consume is false). Human text is in messages[].text; optional images are {mime, base64}. Call this when a tool result includes mailbox_hint.',
    parameters: { type: 'object', properties: {
      after: { type: 'integer', minimum: 0, description: 'Only messages with id greater than this (optional; default is unread since last get_mailbox)' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max messages to return (default 50)' },
      consume: { type: 'boolean', description: 'When true (default), marks returned messages read so mailbox_hint clears' },
    }, required: [] } },
  { name: 'reply_mailbox', description: 'Post a reply into the vibeOS chat window as an assistant bubble (visible to the person at the desktop). Use after get_mailbox when you want to answer in-chat.',
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'Plain-text reply shown in chat' } }, required: ['text'] } },
];

const MCP_INSTRUCTIONS = MCP_INSTRUCTIONS_LEAD + '\n\n' + APP_API_INDEX + '\n\n' + APP_CONTRACT;

// The bridge (bridgeCall in kernel/agent.js) has always accepted js from the
// guest CLI and from vibeos-mcp, but tools/list never named it, so a remote
// agent could not know it was there. Listed to MCP only: the built-in agent
// runs in the page already and its request carries TOOL_SCHEMAS alone.
const JS_TOOL = { name: 'js', description: 'Run JavaScript in the desktop\'s own page and get the value back as JSON (a promise is awaited). code is an expression, or statements with a return. The kernel\'s globals are in scope — VM, Workspace, Windows, UI, Chat, Gen, Theme — so this reads or pokes live state no other tool reaches. It is root on the page and leaves nothing behind: a lasting change is an edit to a system/ file.',
  parameters: { type: 'object', properties: { code: { type: 'string', description: 'JavaScript to run, e.g. VM.state or Windows.list.length' } }, required: ['code'] } };
const MCP_TOOL_SCHEMAS = TOOL_SCHEMAS.concat([JS_TOOL]);

// Frozen all the way down: every consumer shares these objects, and a fork or
// an app that mutated one would change the surface for everyone in the tab.
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

return deepFreeze({
  NET_PORTS: NET_PORTS,
  SHELL_LINES: SHELL_LINES,
  APP_CONTRACT: APP_CONTRACT,
  APP_API_INDEX: APP_API_INDEX,
  CREATE_APP_LEAD: CREATE_APP_LEAD,
  CREATE_APP_DESCRIPTION: CREATE_APP_DESCRIPTION,
  SEARCH_FILE_DESCRIPTION: SEARCH_FILE_DESCRIPTION,
  LIST_FILES_DESCRIPTION: LIST_FILES_DESCRIPTION,
  READ_DESKTOP_DESCRIPTION: READ_DESKTOP_DESCRIPTION,
  PASTE_KEY_SYSTEM_PROMPT: PASTE_KEY_SYSTEM_PROMPT,
  TOOL_SCHEMAS: TOOL_SCHEMAS,
  TOOL_NAMES: TOOL_SCHEMAS.map(function (t) { return t.name; }),
  MCP_TOOL_SCHEMAS: MCP_TOOL_SCHEMAS,
  MCP_INSTRUCTIONS_LEAD: MCP_INSTRUCTIONS_LEAD,
  MCP_INSTRUCTIONS: MCP_INSTRUCTIONS,
});
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VibeOSTools;
