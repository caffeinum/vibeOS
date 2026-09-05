/* vibeOS kernel — the model, the theme store, the web tools, the guest bridge
 * and the agent loop. Loaded after kernel/workspace.js; never hot-reloads.
 */

/* ---------- the model, when a server is holding a key ------------------ */

// What the model gets to remember. Six turns — three exchanges — was the
// window on every path, so a chat restored with 28 turns reached the model as
// its last three and "do you remember?" got "only in this chat". The window
// is now bounded by size, not by a count that fit one screenshot: the last
// forty turns, trimmed from the front until they fit the budget, and always
// starting on a user turn so the pairs stay aligned. The server applies the
// same rule (app/api/openai/generate/route.ts) so it never cuts what is sent.
const HISTORY_TURNS = 40, HISTORY_CHARS = 24000;
function historyWindow(history) {
  let turns = (history || []).slice(-HISTORY_TURNS);
  let size = turns.reduce((n, h) => n + String(h.content || '').length, 0);
  while (turns.length && size > HISTORY_CHARS) size -= String(turns.shift().content || '').length;
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

const Gen = {
  available: false,
  token: (location.hash.match(/token=([^&]+)/) || [])[1] || '',
  key: '', provider: '', model: '', viaServer: false,

  // Which model aliases a ChatGPT account can reach is not knowable from here,
  // so this is settable rather than guessed. Empty means "whatever the server
  // defaults to".
  codexModel: '',
  loadCodexModel() {
    try { this.codexModel = localStorage.getItem('vibeos-codex-model') || ''; } catch {}
    return this.codexModel;
  },
  saveCodexModel(id) {
    this.codexModel = (id || '').trim();
    try {
      this.codexModel ? localStorage.setItem('vibeos-codex-model', this.codexModel)
                      : localStorage.removeItem('vibeos-codex-model');
    } catch {}
    this.setProvider();
  },
  oauth: null,

  // Both Anthropic and OpenAI send CORS headers, so a hosted page can call
  // them directly with the user's OWN key. No key ever ships with the app.
  // ChatGPT Codex OAuth is stored locally and proxied through vibeos.sh.
  loadKey() {
    try { this.key = localStorage.getItem('vibeos-key') || ''; } catch {}
    this.loadCodexModel();
    try { this.oauth = VibeOSOAuth.loadOAuthSession(); } catch { this.oauth = null; }
    this.setProvider();
    return this.key;
  },
  setProvider() {
    if (this.viaServer) {
      this.available = true;
      return;
    }
    if (this.key) {
      this.provider = this.key.startsWith('sk-ant-') ? 'anthropic' : 'openai';
      this.model = this.provider === 'anthropic' ? 'claude-sonnet-5'
                 : this.provider === 'openai' ? 'gpt-5.6' : '';   // terra is the Codex model; a plain key gets plain 5.6
      this.available = !!this.provider;
      return;
    }
    if (this.oauth?.accessToken && this.oauth?.accountId) {
      this.provider = 'openai-codex';
      this.model = this.codexModel || VibeOSOAuth.CODEX_MODEL;
      this.available = true;
      return;
    }
    this.provider = '';
    this.model = '';
    this.available = false;
  },
  saveKey(k) {
    this.key = (k || '').trim();
    try { k ? localStorage.setItem('vibeos-key', this.key) : localStorage.removeItem('vibeos-key'); } catch {}
    this.setProvider();
  },
  saveOAuth(session) {
    this.oauth = session ? VibeOSOAuth.saveOAuthSession(session) : (VibeOSOAuth.clearOAuthSession(), null);
    this.setProvider();
  },
  async ensureOAuthFresh() {
    if (!this.oauth) return null;
    this.oauth = await VibeOSOAuth.ensureFreshOAuthSession(this.oauth);
    this.setProvider();
    return this.oauth;
  },
  askForKey() {
    if (this._askModal) return this._askModal;
    this._askModal = new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'key-modal-overlay';
      overlay.innerHTML = `
        <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="keyModalTitle">
          <h2 id="keyModalTitle">vibeOS needs an agent.</h2>
          <p class="small dimmer" id="keyModalSubtitle" style="margin:0">Connect the one you already have, or sign in.</p>
          <div class="key-modal-actions col">
            <div class="col" id="keyModalStep1">
              <button type="button" class="btn p" id="keyConnectBtn">Connect your agent</button>
              <div class="col" id="keyConnectPanel" hidden>
                <p class="tiny dimmer" style="margin:0">Claude Code, Cursor or Codex drives this desktop through MCP. Paste this into your terminal, then talk to your agent in its own window:</p>
                <code class="mono" id="keyConnectCmd" style="display:block;white-space:pre-wrap;word-break:break-all;padding:8px;border:1px solid var(--line);border-radius:var(--radius-sm)"></code>
                <div class="row" style="gap:6px"><button type="button" class="btn sm" id="keyConnectCopy">Copy</button><span class="tiny dimmer" id="keyConnectState"></span></div>
              </div>
              <p class="note" id="keyConnectError" hidden style="margin:0;color:var(--no)"></p>
              <button type="button" class="btn" id="keyLoginBtn">Login with Codex</button>
              <div id="keyOAuthSlot"></div>
              <p class="note oauth-error" id="keyOAuthError" hidden style="margin:0;color:var(--no)"></p>
              <button type="button" class="btn sm skip" id="keyOtherBtn">Other options</button>
            </div>
            <div class="col" id="keyModalStep2" hidden>
              <button type="button" class="btn sm skip" id="keyBackBtn">← Back</button>
              <button type="button" class="btn" id="keyPasteBtn">Paste API key (OpenAI / Anthropic)</button>
              <div class="col" id="keyPasteForm" hidden>
                <input type="password" id="keyInput" placeholder="sk-... or sk-ant-..." autocomplete="off" spellcheck="false">
                <p class="tiny dimmer" style="margin:0">Stored only in this browser, sent straight to the provider — never to vibeos.sh.</p>
                <button type="button" class="btn p sm" id="keySaveBtn">Save</button>
              </div>
              <button type="button" class="btn" id="keyCreateBtn">Create account</button>
              <p class="note" id="keyCreateNote" hidden style="margin:0">
                Coming soon! <a href="/get-access">Subscribe to waitlist</a> to know it first.
              </p>
              <button type="button" class="btn sm skip" id="keySkipBtn">Continue without AI features</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      let offBridge = null;
      const finish = () => {
        document.removeEventListener('keydown', onKey);
        if (offBridge) offBridge();
        overlay.remove();
        this._askModal = null;
        resolve(this.available);
      };
      const decline = () => { track('key_declined'); finish(); };
      const onKey = e => { if (e.key === 'Escape') decline(); };

      document.addEventListener('keydown', onKey);
      overlay.querySelector('#keyOtherBtn').onclick = () => {
        overlay.querySelector('#keyModalStep1').hidden = true;
        overlay.querySelector('#keyModalStep2').hidden = false;
        overlay.querySelector('#keyModalSubtitle').textContent = 'Other ways in.';
      };
      overlay.querySelector('#keyBackBtn').onclick = () => {
        overlay.querySelector('#keyModalStep1').hidden = false;
        overlay.querySelector('#keyModalStep2').hidden = true;
        overlay.querySelector('#keyCreateNote').hidden = true;
        overlay.querySelector('#keyModalSubtitle').textContent = 'Connect the one you already have, or sign in.';
      };
      // The first door: an agent the person already pays for. Pairing mints a
      // token for this tab; the modal closes by itself the moment the agent
      // connects, and says so if this page cannot pair (the static mirror has
      // no relay; a host shell refuses on purpose).
      overlay.querySelector('#keyConnectBtn').onclick = async () => {
        track('connect_agent_click');
        const btn = overlay.querySelector('#keyConnectBtn'), panel = overlay.querySelector('#keyConnectPanel');
        const err = overlay.querySelector('#keyConnectError'), cmd = overlay.querySelector('#keyConnectCmd'), st = overlay.querySelector('#keyConnectState');
        err.hidden = true; btn.disabled = true;
        if (!RemoteBridge.token) {
          const ok = await RemoteBridge.pair();
          if (!ok) { err.textContent = RemoteBridge.detail || 'pairing is not available here'; err.hidden = false; btn.disabled = false; return; }
        }
        cmd.textContent = RemoteBridge.command();
        panel.hidden = false;
        const paint = (state, detail) => {
          if (RemoteBridge.token) cmd.textContent = RemoteBridge.command();
          st.textContent = state === 'connected' ? (detail || 'an agent') + ' connected'
            : state === 'waiting' ? 'waiting for your agent…'
            : state === 'pairing' ? detail || 'pairing…'
            : state === 'error' ? detail : '';
          if (state === 'connected') { track('key_added', { via: 'mcp' }); finish(); }
        };
        offBridge = RemoteBridge.on(paint); paint(RemoteBridge.state, RemoteBridge.detail);
      };
      overlay.querySelector('#keyConnectCopy').onclick = () => {
        const text = overlay.querySelector('#keyConnectCmd').textContent;
        navigator.clipboard.writeText(text).then(
          () => { overlay.querySelector('#keyConnectCopy').textContent = 'Copied ✓'; },
          () => { overlay.querySelector('#keyConnectState').textContent = 'the browser refused the clipboard — select the line and copy it'; });
      };
      overlay.querySelector('#keyPasteBtn').onclick = () => {
        overlay.querySelector('#keyPasteForm').hidden = false;
        overlay.querySelector('#keyInput').focus();
        track('paste_key_click');
      };
      overlay.querySelector('#keyInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') overlay.querySelector('#keySaveBtn').click();
      });
      overlay.querySelector('#keySaveBtn').onclick = () => {
        const k = overlay.querySelector('#keyInput').value.trim();
        this.saveKey(k);
        if (k) track('key_added');
        finish();
      };
      overlay.querySelector('#keyCreateBtn').onclick = () => {
        track('create_account_click');
        overlay.querySelector('#keyCreateNote').hidden = false;
      };
      overlay.querySelector('#keyLoginBtn').onclick = async () => {
        track('login_openai_click');
        const slot = overlay.querySelector('#keyOAuthSlot');
        const errEl = overlay.querySelector('#keyOAuthError');
        const loginBtn = overlay.querySelector('#keyLoginBtn');
        errEl.hidden = true;
        errEl.textContent = '';
        loginBtn.disabled = true;
        try {
          const flow = await VibeOSOAuth.startOAuthDeviceFlow();
          slot.innerHTML = VibeOSOAuth.renderOAuthPanelHtml({ code: flow.code, url: flow.url, status: 'waiting' });
          VibeOSOAuth.wireOAuthPanel(slot, flow);
          const tokens = await VibeOSOAuth.pollOAuthUntilComplete(flow.id, {
            sleep: ms => new Promise(r => setTimeout(r, ms)),
            intervalMs: 5000,
            fetchImpl: fetch,
            onPoll: result => {
              if (result.status === 'pending') {
                VibeOSOAuth.updateOAuthPanelStatus(slot, flow, 'polling');
              } else if (result.status === 'complete') {
                VibeOSOAuth.updateOAuthPanelStatus(slot, flow, 'complete');
              }
            },
          });
          this.saveOAuth(tokens);
          track('key_added');
          finish();
        } catch (e) {
          if (slot.querySelector('#oauthPanel')) {
            const statusEl = slot.querySelector('.oauth-status');
            if (statusEl) statusEl.textContent = (e && e.message) || 'authorization failed';
          }
          errEl.textContent = (e && e.message) || 'authorization failed';
          errEl.hidden = false;
          loginBtn.disabled = false;
        }
      };
      overlay.querySelector('#keySkipBtn').onclick = decline;
      overlay.querySelector('#keyInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') overlay.querySelector('#keySaveBtn').click();
      });
    });
    return this._askModal;
  },

  // A local demo server holding a key answers /api/health; vibeos.sh and the
  // static mirror have no such route, and the browser logs a 404 for a fetch
  // whatever the code catches. So the probe runs only when something says a
  // server is there — localStorage vibeos-server, or ?server=1 — else BYO key.
  serverWanted() {
    try { if (localStorage.getItem('vibeos-server')) return true; } catch {}
    try { return new URLSearchParams(location.search).get('server') === '1'; } catch { return false; }
  },
  async probe() {
    if (this.serverWanted()) {
      try {
        const r = await fetch('/api/health', { headers: { 'ngrok-skip-browser-warning': '1' } });
        if (r.ok) {
          const j = await r.json();
          if (j.keyed) { this.viaServer = true; this.model = j.model; this.available = true; return true; }
        }
      } catch {}
    }
    this.loadKey();
    return this.available;
  },

  async generate(prompt, history, onStatus, images) {
    if (this.viaServer) {
      // The local demo server takes a prompt string and nothing else; dropping
      // the image here would send text that talks about a screenshot it lost.
      if (images && images.length) throw new Error('the local server does not accept images');
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json', 'ngrok-skip-browser-warning': '1' },
                               this.token ? { 'x-demo-token': this.token } : {}),
        body: JSON.stringify({ prompt, history }),
      });
      const j = await jsonOf(r, 'server');
      if (!r.ok) throw new Error(j.error || ('server returned ' + r.status));
      return j.source;
    }
    if (this.key) {
      const url = this.provider === 'anthropic'
        ? 'https://api.anthropic.com/v1/messages'
        : 'https://api.openai.com/v1/chat/completions';
      const headers = this.provider === 'anthropic'
        ? { 'content-type': 'application/json', 'x-api-key': this.key,
            'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
        : { 'content-type': 'application/json', authorization: 'Bearer ' + this.key };
      const user = { role: 'user', content: Agent.userContent(this.provider, prompt, images) };
      const payload = this.provider === 'anthropic'
        ? { model: this.model, max_tokens: 2000, system: withSkills(forImage(PASTE_KEY_SYSTEM_PROMPT)),
            messages: [...historyWindow(history), user] }
        : { model: this.model, max_completion_tokens: 2000,
            messages: [{ role: 'system', content: withSkills(forImage(PASTE_KEY_SYSTEM_PROMPT)) },
                       ...historyWindow(history), user] };

      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      const j = await jsonOf(r, this.provider);
      if (!r.ok) throw new Error(`${this.provider} ${r.status}: ${(j.error && j.error.message) || 'request failed'}`);
      let src = this.provider === 'anthropic'
        ? (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
        : ((j.choices || [{}])[0].message || {}).content.trim();
      if (src.startsWith('```')) src = src.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim();
      return src;
    }
    if (this.oauth) return Agent.run(prompt, history, onStatus, images);
    throw new Error('no model configured');
  },
};

// Paste-key path only — talks to the provider directly with one-shot codegen.
// The prompts describe the BusyBox shell; swap that line for whatever is booted.
/* ---------- the desktop's own appearance ------------------------------

   Every colour in the chrome is a custom property on :root, so a theme is a
   set of values rather than a stylesheet. That is what lets the agent restyle
   the OS it is running inside: it changes state, not source. State has a reset
   button; source does not.
   -------------------------------------------------------------------- */

const Theme = {
  KEY: 'vibeos-theme',
  id: VibeOSSkills.DEFAULT_THEME,
  custom: null,

  tokens() {
    return Object.assign({}, VibeOSSkills.getTheme(this.id).tokens, this.custom || {});
  },

  // A token value is a colour, not CSS. Concatenating one into stylesheet text
  // meant a value of "x; } * { display: none } :root { y" closed the rule and
  // opened its own — a persistent white screen, reapplied at boot, hiding the
  // very Settings pane that could undo it. setProperty cannot escape into a new
  // rule, and the pattern keeps the value recognisable as a colour on the way in.
  SAFE_VALUE: /^[^;{}<>]{1,160}$/,

  safeValue(v) {
    return typeof v === 'string' && this.SAFE_VALUE.test(v);
  },

  paint() {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(this.tokens())) {
      if (this.safeValue(v)) root.style.setProperty(k, v);
      else root.style.removeProperty(k);
    }
    root.style.colorScheme = this.id === 'vibeos-light' ? 'light' : 'dark';
  },

  load(opts) {
    // ?safe=1 boots the stock theme without touching what is stored, so a bad
    // saved theme is always one URL away from being escapable. This is the
    // recovery path, so it must not depend on any UI a theme could hide.
    let safeMode = (opts && opts.stock) || false;
    try { safeMode = safeMode || new URLSearchParams(location.search).has('safe'); } catch {}
    if (safeMode) { this.paint(); return; }

    try {
      const saved = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (saved && VibeOSSkills.THEMES[saved.id]) {
        this.id = saved.id;
        // Drop anything stored that no longer passes validation rather than
        // applying it — a value saved before this check must not brick a boot.
        const custom = {};
        for (const [k, v] of Object.entries(saved.custom || {})) {
          if (this.safeValue(v)) custom[k] = v;
        }
        this.custom = Object.keys(custom).length ? custom : null;
      }
    } catch {}
    this.paint();
  },

  set(id, custom) {
    if (id) VibeOSSkills.getTheme(id);   // throws on an unknown id, loudly
    if (id) this.id = id;
    if (custom !== undefined) {
      // A token the desktop does not define would silently do nothing, so
      // reject it rather than let the agent think it worked.
      const known = VibeOSSkills.getTheme(this.id).tokens;
      for (const [key, value] of Object.entries(custom || {})) {
        if (!(key in known)) {
          // There is no wallpaper token, on purpose: an image is an edit to
          // the #desktop rule, and the error says where rather than letting
          // the model guess a fourth name for it.
          const hint = /wallpaper|bg|background/i.test(key) ? ' Wallpaper is an edit to system/os.css (#desktop rule).' : '';
          throw new Error('unknown theme token: ' + key + hint + ' Known tokens: ' + Object.keys(known).join(', ') + ' (list_themes has every theme\'s).');
        }
        if (!this.safeValue(value)) {
          throw new Error('theme token ' + key + ' must be a plain colour value, got: ' + String(value).slice(0, 40));
        }
      }
      this.custom = custom && Object.keys(custom).length ? custom : null;
    }
    this.paint();
    try { localStorage.setItem(this.KEY, JSON.stringify({ id: this.id, custom: this.custom })); } catch {}
    return { theme: this.id, custom: this.custom };
  },

  reset() {
    this.id = VibeOSSkills.DEFAULT_THEME;
    this.custom = null;
    try { localStorage.removeItem(this.KEY); } catch {}
    this.paint();
  },
};

function withSkills(prompt) {
  return VibeOSSkills.composePrompt(prompt, { theme: Theme.id });
}

function forImage(prompt) {
  const line = IMAGES[VM.bootedImage || VM.image].shellLine;
  return prompt.replace(IMAGES.busybox.shellLine, line);
}

// The contract a window app is held to: the three headers, what api offers,
// the layout rules, the size hint. The same text as lib/system-prompt.ts
// APP_CONTRACT (pinned byte-equal by tests/agent-tools.test.ts); the paste-key
// prompt embeds it and create_app's description carries it, so an agent on
// vibeos-mcp — which never sees a prompt of ours — reads the same rules.
const APP_CONTRACT = `// @title <Short Name>
// @target browser
// @requires <space-separated caps, or none>
Caps: files (read the workspace), shell (run commands in the VM), tty (a terminal on the VM: stdin, Ctrl-C, full-screen programs), net (raw TCP through the relay). Use none unless needed.
Then: export default function (mount, api) { ... }
mount is a fixed-size pane (~430x320px, resizable). api.list() -> [{name,dir}] (needs files). api.onResize((w,h) => ...) when layout depends on size. api.mountSize() -> {width,height}.
api.shell(cmd, timeoutMs = 600000) -> Promise<string> (needs shell): one-shot commands. Waits up to ten minutes by default, because what an app runs is what a person typed into it — an apk add, a git clone. stdout and stderr together, ANSI stripped; rejects on timeout or while the machine is not running. It is ONE shell session shared by every app that uses it and the agent, so a cd leaks into everyone else's commands: never cd, use absolute paths. No stdin and no tty: vi, top, less, an interactive zsh hang until interrupted — those want api.tty(). List a directory with ls -1p. Pass a shorter timeoutMs for a quick status line you would rather see fail than wait on; a long build can go to the background, cmd > /mnt/job.log 2>&1 &, followed with api.shell("tail -n 20 /mnt/job.log").
api.tty() -> { write(bytesOrString), onData(fn) -> off, resize(cols, rows), close() } (needs tty): a terminal is api.tty(): bytes both ways, ctrl-c, top, nano, passwords work; api.shell is for one-shot commands. It is its own shell on the machine's second serial line, not the one api.shell and the agent share, so a cd there stays there. The line echoes what you write: paint what onData delivers (\\r, \\n, \\b and ANSI escapes; answer \\x1b[6n with \\x1b[row;colR or vi and ash wait on it) instead of echoing keys yourself; send Enter as \\r, Ctrl-C as \\x03, arrows as \\x1b[A..D, and resize(cols, rows) when the pane changes. One tty per machine: while the built-in Terminal or another app holds it, api.tty() throws naming the holder — show that message; closing that window releases it.
api.net.connect(host, port) -> { write(bytesOrString), onData(fn) -> off, onClose(fn) -> off, close(), state, reason } (needs net): opens raw TCP through the relay for a TCP client — a redis, irc or smtp toy; http stays on the proxy and the Browser, not this. Plain TCP only (no tls option; https means fetch or curl in the machine). localhost, private and loopback addresses and ports outside the relay's list (80, 443, 21, 22, 70, 1965, 3000, 8080, 8443) throw naming the rule; the relay closes a stream it refuses and onClose says why. The relay is a serverless function that ends about every 13 minutes: every open stream then closes with "network error: the relay reconnected and the connection was lost", so a long-lived client (irc, redis) must reconnect from onClose. A write after close throws. Closing the window closes the connection.

Layout rules (required):
- Root element: width:100%; height:100%; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden. No document scroll, no min-height larger than the window, no fat browser scrollbars on mount.
- Fit the actual mount, not a desktop-sized page. Modest type (13-15px body, not huge serif headlines) and tight padding. Empty states must fit without overflowing.
- Do not imitate getslash.co / Slash-style UIs with oversized serif titles and generous vertical padding — those overflow a ~430×320px window immediately.
- If a region scrolls, use an inner child with overflow:auto and scrollbar-width:thin (or class app-scroll) — never scroll mount itself.
- Respond to resize: use flex/%/min-height:0 throughout, or api.onResize to reflow.

Plain JavaScript only, no JSX, no imports, no external URLs. Under 60 lines and it must work.`;

const CREATE_APP_LEAD = 'Create a vibeOS desktop window app (// @target browser, the contract below) or install a VM script (// @title, // @target vm, // @file <name.sh>, then a shell script for the Linux the prompt names). Pass complete source with the headers; the reply names the dock entry and the file. A window app is held to this contract:';
const CREATE_APP_DESCRIPTION = CREATE_APP_LEAD + '\n' + APP_CONTRACT;
// Word for word lib/agent-tools.ts; the test pins them.
const SEARCH_FILE_DESCRIPTION = 'Find lines matching a regex. path is one file, a directory (system/, system/ui/) or a glob (system/**/*.js, apps/*.js): a directory or glob searches every text file under it and each hit carries file and line; 60 hits at most, binaries and files over 1 MB skipped and named; system/chat.json and the snapshots are never searched or listed. Use before edit_file on a system/ file. A path that matches nothing is refused naming what exists there.';
const LIST_FILES_DESCRIPTION = 'List the workspace. path is \'\' for the top (apps/, data/, system/) or a directory: apps/, data/, system/, system/kernel, system/ui. Entries carry kind (file|dir), size and modified; under system/ every file the OS loads is listed whether or not a copy is stored, with source (stored: your fork boots next; served: stock) and booted (which one this page runs — stored but booted served means reload_os is pending). A path that does not exist is refused naming what its parent holds.';
const READ_DESKTOP_DESCRIPTION = 'What the desktop looks like, as text: every open window (app id, title, minimized, z-order — first is on top — geometry, whether it is the built-in chat/Browser/Settings or a generated app and its file), the dock entries, the machine pill (VM.state, image, net, tty) and the theme. Pass { window: <title or app id> } for that window\'s body as trimmed text, one line per block (scripts and styles dropped, 8 KB cap); add { dom: true } for its sanitised outerHTML instead (no script, style, link or on* attributes, no javascript: urls, media and form urls replaced by data:, 16 KB cap); either way the value of a password or hidden input is withheld. { screen: \'png\' } is the machine\'s VGA screen as image {mimeType, data} (a jpeg no wider than 1024, under the relay\'s 128 KB frame) with the text console\'s rows as text when it is in text mode. A bitmap of the desktop itself is not available (no html2canvas is vendored): the text and DOM views are the substitute. Everything here is read; nothing runs.';
const LIST_THEMES_DESCRIPTION = 'The themes set_theme can wear: id, title, summary and the token names each defines (--accent, --panel, --radius-win…), plus the current theme id, its custom overrides and the effective value of every token. Use before set_theme with tokens: an unknown token is refused naming the known ones.';

const PASTE_KEY_SYSTEM_PROMPT = `You build things for vibeOS, a small desktop OS. Reply with SOURCE ONLY - no markdown fences, no commentary.

TARGET 1, a desktop window (default). Header exactly:
${APP_CONTRACT}

TARGET 2, a program inside the VM. Use when the request is about files, text processing or system tasks. Header exactly:
// @title <Short Name>
// @target vm
// @file <name.sh>
Then a POSIX shell script for BusyBox ash. No bash arrays, no GNU-only flags, no package manager, no network. Available: sh ls cat grep sed awk wc sort head tail cut tr find echo test. The workspace is at /mnt. Print results to stdout.

A remote agent (someone's own Claude Code, Cursor or Codex, through vibeos-mcp) may be connected to this desktop and edits or commands can come from it in parallel: a stale anchor in edit_file is refused, so re-read before you edit rather than assume the file is as you left it.`;


const PROXY = '/api/proxy?url=';

/* localhost is the machine's, not the laptop's. A dev server started in the
   Terminal listens inside v86, where the proxy cannot reach and the host
   browser must not try: http://localhost is "potentially trustworthy", so a
   page rendered with <base href="http://localhost:3000/"> makes the HOST
   browser fetch /logo.png from whatever the developer runs on their own port
   3000. So a guest URL is fetched from inside the guest — the status line over
   serial, the body over 9p as a root-level dotfile on /mnt (listFiles hides
   dotfiles, so Sync and the Files app never see it) — and the page is rendered
   with every subresource that points back at the guest blanked to data:,.
   ---------------------------------------------------------------------- */
// *.localhost too: browsers resolve any such name to loopback without DNS.
const GUEST_HOST = /^((?:[^.]+\.)*localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)$/i;
const isGuestHost = (url) => {
  let host;
  try { host = new URL(url).hostname; } catch { return false; }
  return GUEST_HOST.test(host) || (!!VM.ip && host === VM.ip);
};
const escHtml = (s) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

let guestFetchSeq = 0;
// -> { ok, status, type, text, finalUrl, via }. Throws with a sentence when the
// machine is down, nothing listens, the fetch times out, or the guest has
// neither curl nor wget. curl where it exists (status, type and final URL come
// from -w); busybox wget otherwise (-S prints the response headers to stderr;
// it keeps no body for a non-2xx status and exits 1 with a sentence instead —
// measured on linux4.iso, BusyBox 1.28.4: "server returned error: HTTP/1.0 404
// Not Found", "can't connect to remote host (127.0.0.1): Connection refused").
async function guestFetch(url) {
  if (!VM.ready()) throw new Error('localhost is inside the machine, and the machine is not running yet');
  if (/['\r\n]/.test(url)) throw new Error("a single quote or a line break in the URL cannot be passed to the machine's shell: " + url);
  const n = ++guestFetchSeq;
  const name = `.vfetch-${n}`;
  // A script on /mnt, not a long command line: the serial line editor wraps
  // what it echoes at 80 columns, and exec's filter only drops an echo that
  // matches the command whole, so a long command line comes back inside its
  // own output.
  const script = `u='${url}'; o=/mnt/${name}; e=/tmp/${name}.err
if command -v curl >/dev/null 2>&1; then
  curl -sS -L --max-time 15 -o "$o" -w '\\n__vfetch-w status=%{http_code} type=%{content_type} url=%{url_effective}\\n' "$u" 2>"$e"; rc=$?; via=curl
elif command -v wget >/dev/null 2>&1; then
  wget -S -T 15 -O "$o" "$u" 2>"$e"; rc=$?; via=wget
else rc=127; via=none; fi
sync
echo "__vfetch rc=$rc via=$via"
cat "$e" 2>/dev/null
`;
  await VM.writeQuietly(name + '.sh', new TextEncoder().encode(script));
  const host = new URL(url).host;
  try {
    const out = await VM.exec(`sh /mnt/${name}.sh`, 25000);
    const m = out.match(/^__vfetch rc=(\d+) via=(\w+)$/m);
    if (!m) throw new Error('the machine gave no answer for ' + url + ': ' + out.slice(-200));
    const rc = +m[1], via = m[2];
    const head = out.slice(0, m.index), tail = out.slice(m.index + m[0].length).trim();
    if (via === 'none') throw new Error("the Browser's localhost needs curl or wget in the machine, and this one has neither");
    const refused = () => { throw new Error(`nothing is listening on ${host} inside the machine (localhost here is the VM's, not your laptop's)`); };
    const timedOut = () => { throw new Error(`${host} did not answer within 15 s inside the machine (${tail.split('\n').filter(l => /^(wget|curl):/.test(l)).join('; ') || via})`); };
    let status = 0, type = '', finalUrl = url;
    if (via === 'curl') {
      if (rc === 7) refused();
      if (rc === 28) timedOut();
      if (rc !== 0) throw new Error(`curl inside the machine failed (exit ${rc}): ${tail || 'no detail'}`);
      const w = head.match(/^__vfetch-w status=(\d+) type=(.*?) url=(.*)$/m);
      if (!w) throw new Error('curl inside the machine returned no status line: ' + head.slice(-200));
      status = +w[1]; type = w[2]; finalUrl = w[3] || url;
    } else {
      if (/Connection refused/.test(tail)) refused();
      if (/timed out|Resource temporarily unavailable/.test(tail)) timedOut();
      // Last status wins: -S prints every hop of a redirect. Same for the rest.
      const all = [...tail.matchAll(/^\s*HTTP\/\d\.\d (\d{3})/gm)];
      const err = tail.match(/server returned error: HTTP\/\d\.\d (\d{3})/);
      if (!all.length && !err) {
        throw new Error(`wget inside the machine failed (exit ${rc}): ${tail.split('\n').filter(l => /^wget:/.test(l)).join('; ') || tail.slice(-200) || 'no detail'}`);
      }
      status = +(err ? err[1] : all[all.length - 1][1]);
      const ct = [...tail.matchAll(/^\s*Content-Type:\s*(.*)$/gim)];
      type = ct.length ? ct[ct.length - 1][1].trim() : '';
      const loc = [...tail.matchAll(/^\s*Location:\s*(\S+)/gim)];
      if (loc.length) { try { finalUrl = new URL(loc[loc.length - 1][1], url).href; } catch {} }
      if (rc !== 0) {
        // wget saved nothing: say what the server said, and that the body is gone.
        return { ok: false, status, type, finalUrl, via, text: `${host} answered ${status} (busybox wget keeps no body for an error status; curl would)` };
      }
    }
    const bytes = await VM.readFile(name);
    if (!bytes) throw new Error(`the machine wrote no body for ${url} (${via} exit ${rc})`);
    return { ok: status >= 200 && status < 300, status, type, finalUrl, via, text: new TextDecoder().decode(bytes) };
  } finally {
    VM.exec(`rm -f /mnt/${name} /mnt/${name}.sh /tmp/${name}.err`).catch(() => {});
  }
}


/* ---------- the agent's eyes on the web -------------------------------

   Both tools go through /api/proxy, so they inherit its SSRF blocks and its
   limits: no scripts ever run, which means a site that renders entirely in
   JavaScript returns nothing useful, and some sites refuse our egress outright.

   Search is Marginalia. Measured through this proxy on 2026-09-02: DuckDuckGo
   (all three endpoints) and Ecosia hard-403; Google and Bing answer 200 but
   emit no plain result links, so nothing is parseable without running their
   JS; Brave answered well once and then served a bot-check page for every
   query after. Marginalia throttles with a "Wait For A Moment" page that
   succeeds on retry, and it welcomes crawlers rather than fighting them —
   a soft, retryable limit beats a hard block for something that runs
   unattended from one datacenter address.
   -------------------------------------------------------------------- */

const WebTools = {
  MAX_TEXT: 12000,

  hostOf(url) { try { return new URL(url).host; } catch { return url; } },

  async viaProxy(url) {
    const r = await fetch(PROXY + encodeURIComponent(url), {
      headers: { 'ngrok-skip-browser-warning': '1' },
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text, finalUrl: r.headers.get('x-final-url') || url,
             type: r.headers.get('content-type') || '' };
  },

  toText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,svg,template').forEach(n => n.remove());
    // textContent alone welds block elements together — "Example DomainThis
    // domain is for..." — which reads as one run-on sentence to the model.
    // Give every block a line break of its own first.
    doc.querySelectorAll('p,div,br,li,tr,h1,h2,h3,h4,h5,h6,section,article,header,footer,nav,td,pre,blockquote')
      .forEach(n => n.after(doc.createTextNode('\n')));
    return (doc.body ? doc.body.textContent : '').replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  },

  async fetchPage(url) {
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'web_fetch needs an absolute http(s) URL.' };
    const r = await this.viaProxy(url);
    if (!r.ok) {
      // Say who refused and why. The agent must report this, not paper over it
      // with a plausible-sounding summary of a page it never read.
      const why = (r.status === 403 || r.status === 429)
        ? `${this.hostOf(url)} refuses requests from datacenter addresses, which is what this proxy is. The page could not be read.`
        : (r.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      return { ok: false, status: r.status, error: `${this.hostOf(url)} returned ${r.status}. ${why}` };
    }
    const isHtml = r.type.includes('text/html');
    const body = isHtml ? this.toText(r.text) : r.text;
    let title = '';
    if (isHtml) {
      const m = r.text.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
      if (m) title = m[1].replace(/\s+/g, ' ').trim();
    }
    return {
      ok: true, url: r.finalUrl, title,
      text: body.slice(0, this.MAX_TEXT),
      truncated: body.length > this.MAX_TEXT,
      note: isHtml && body.length < 200
        ? 'This page returned almost no text, which usually means it renders itself with JavaScript. Scripts never run here, so its content is not available.'
        : undefined,
    };
  },

  parseResults(html, engineDomain) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const seen = new Set(), out = [];
    for (const a of doc.querySelectorAll('a[href^="http"]')) {
      let u;
      try { u = new URL(a.href); } catch { continue; }
      if (u.host === engineDomain || u.host.endsWith('.' + engineDomain)) continue;
      const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      // Results appear twice: once as a bare-URL anchor, once with the real
      // title. Skip the bare one so the title we keep is the readable one.
      if (title.length < 8 || /^https?:\/\//i.test(title)) continue;
      const key = u.host + u.pathname;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title: title.slice(0, 140), url: a.href });
      if (out.length >= 8) break;
    }
    return out;
  },

  async search(query) {
    const q = (query || '').trim();
    if (!q) return { ok: false, error: 'web_search needs a query.' };
    const host = 'old-search.marginalia.nu';
    const url = `https://${host}/search?query=` + encodeURIComponent(q);

    // The throttle clears in seconds, so back off and try again rather than
    // handing the model an empty result it might be tempted to fill in.
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await this.viaProxy(url);
      if (!r.ok) return { ok: false, error: `search is unavailable — the engine returned ${r.status}.` };
      if (/Wait For A Moment/i.test(r.text)) {
        // Soft throttle, not a refusal. One retry, then admit it.
        if (attempt < 2) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
        return { ok: false, error: 'search is rate-limited right now. Say so rather than guessing at results.' };
      }
      const results = this.parseResults(r.text, 'marginalia.nu');
      if (!results.length) return { ok: false, error: 'the search returned no readable results.' };
      return { ok: true, engine: 'marginalia', query: q, results };
    }
    return { ok: false, error: 'search is rate-limited right now.' };
  },
};

/* ---------- letting the guest drive the desktop -----------------------

   The agent runs in the page, not in the VM, and that is the right way round:
   five of its six tools are host-only — create_app ends in import(blobURL),
   set_theme mutates the host document, the web tools go out through the page's
   proxy. Moving the loop into the guest would turn five of six calls into
   round-trips back out, to gain speed on the one that is already cheapest.

   So the loop stays, and the guest gets a door instead. A process inside Linux
   writes a request file; the write hook the desktop already installs fires;
   the host runs the tool and writes the answer back. Same executeTool the
   agent uses, so bash gets exactly the agent's abilities and no others.

   This is deliberately open: anything running in the VM can use it. That was
   an explicit call — the VM is trusted here — and it is worth being clear that
   it means anything reaching the VM (curl'd, apt-installed, unpacked from an
   archive) can create an app or restyle the desktop without a click.
   -------------------------------------------------------------------- */

const GUEST_TOOLS = new Set(['create_app', 'vm_exec', 'list_apps', 'list_files', 'read_desktop', 'list_themes', 'set_theme', 'read_file', 'search_file', 'edit_file', 'write_file', 'reload_ui', 'reload_os', 'web_fetch', 'web_search']);

// What the agent is told about the shell's own apps. They are functions in
// os.js, so "change the Browser" is an edit to system/os.js — not a request.
// One sentence, said wherever the agent or the person looks at /mnt, so a
// directory made in the guest is not discovered missing from the folder later.
const MOUNT_MAPPING = '/mnt is the workspace, flat: /mnt/<name> is data/<name> and /mnt/<name>.js is apps/<name>.js; system/ is not in /mnt except as /mnt/system, a read-only copy of the OS source the loader ran (kernel/, ui/, os.css, index.html — never chat.json or snapshots) for cat, grep and diff and subdirectories under /mnt are not mirrored, nor are symlinks or special files — only regular files at the root of /mnt (the rest is listed under unmirrored).';
const BUILTIN_APPS = () => Object.entries(UI.stable().SHELL).map(([id, s]) => ({
  id, title: s.title, builtin: true,
  source: 'system/' + s.file, hint: `search_file system/${s.file} for "function ${s.render}"; reload_ui applies the edit live`,
}));

// One gate for every door into the desktop that is not the built-in agent:
// the guest CLI (a file in /mnt) and a remote agent (a frame over the relay)
// get exactly the agent's tools plus the js verb, and nothing else. `event`
// is the analytics name: guest_rpc or mcp_call. Never throws — a caller
// writes or sends whatever comes back.
async function bridgeCall(call, event) {
  if (!call || typeof call !== 'object' || !call.tool) return { ok: false, error: 'request needs a "tool" field' };
  if (call.tool === 'js') {
    // `vibeos js '<code>'` runs in the desktop's own origin and returns the
    // value (awaited) as JSON. The machine is trusted and the agent can
    // already rewrite the kernel through write_file, so this is not a new
    // power, only a shorter path to it: a script in the VM can open a window,
    // read VM.state, or call any desktop function without editing a file first.
    track(event, { tool: 'js' });
    try {
      const code = call.input && call.input.code;
      if (typeof code !== 'string' || !code.trim()) throw new Error('js needs {"code": "<javascript>"}');
      let value;
      try { value = await (0, eval)(`(async () => (${code}))()`); }
      catch { value = await (0, eval)(`(async () => { ${code} })()`); }
      return { ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  if (!GUEST_TOOLS.has(call.tool)) return { ok: false, error: 'unknown tool: ' + call.tool, available: [...GUEST_TOOLS, 'js'] };
  track(event, { tool: call.tool });
  try { return await Agent.executeTool({ toolName: call.tool, input: call.input || {} }); }
  catch (e) { return { ok: false, error: e.message }; }
}

const GuestBridge = {
  PREFIX: 'rpc-req-',
  CLI: 'vibeos',
  running: false,
  _done: new Set(),

  // One file per request, never reused. Rewriting a single shared file looked
  // simpler and was wrong: a shorter write leaves the earlier, longer content's
  // tail in place, so the host read valid JSON followed by the garbage of the
  // last call. A fresh name per call sidesteps truncation entirely and lets
  // two calls be in flight without colliding.
  cli() {
    return [
      '#!/bin/sh',
      '# vibeOS guest CLI — call the desktop from inside the VM.',
      '# usage: vibeos <tool> [json]   e.g. vibeos set_theme \'{"theme":"vibeos-light"}\'',
      'if [ -z "$1" ]; then echo "usage: vibeos <tool> [json]" >&2; exit 2; fi',
      'ID=$$$(date +%s 2>/dev/null || echo 0)',
      'REQ=/mnt/' + this.PREFIX + '$ID.json',
      'RES=/mnt/rpc-res-$ID.json',
      // NOT ${2:-{}} — the shell closes the expansion at the first brace and
      // leaves a literal } behind, so every request arrived with one extra
      // closing brace and failed to parse.
      'INPUT="$2"',
      'if [ -z "$INPUT" ]; then INPUT="{}"; fi',
      'printf \'{"id":"%s","tool":"%s","input":%s}\' "$ID" "$1" "$INPUT" > "$REQ"',
      'i=0',
      'while [ $i -lt 600 ]; do',
      '  if [ -f "$RES" ]; then cat "$RES"; echo; rm -f "$REQ" "$RES"; exit 0; fi',
      '  i=$((i+1))',
      '  sleep 0.1 2>/dev/null || sleep 1',
      'done',
      'rm -f "$REQ"',
      'echo "vibeos: no answer from the desktop" >&2; exit 1',
      '',
    ].join('\n');
  },

  async install() {
    if (!VM.ready()) return false;
    await VM.writeQuietly(this.CLI, new TextEncoder().encode(this.cli()));
    // /mnt is a 9p mount and not on PATH, so put a runnable copy where the
    // shell looks. Verify rather than assume: this runs on two different images.
    const out = await VM.exec(
      'for d in /usr/bin /bin /usr/local/bin; do [ -d "$d" ] && cp /mnt/' + this.CLI + ' "$d/' + this.CLI +
      '" 2>/dev/null && chmod +x "$d/' + this.CLI + '" 2>/dev/null && break; done; command -v ' + this.CLI + ' 2>/dev/null');
    return /bin\/vibeos/.test(out);
  },

  start() {
    if (this.running) return;
    this.running = true;
    // Undebounced: the request file is the whole point, and the 800ms sync
    // debounce would be added to every call.
    VM.onWrite(() => this.poll());
  },

  // A guest write arrives as more than one event — the file is created, then
  // the data lands — so a poll that ran on the first event alone would read an
  // empty file. A write during a poll marks the work dirty and the loop goes
  // round again rather than being dropped.
  async poll() {
    if (!VM.ready()) return;
    if (this._busy) { this._pending = true; return; }
    this._busy = true;
    try {
      do {
        this._pending = false;
        await this.sweep();
      } while (this._pending);
    } finally { this._busy = false; }
  },

  async sweep() {
    const files = VM.listFiles() || [];
    for (const f of files) {
      if (!f.name || !f.name.startsWith(this.PREFIX) || this._done.has(f.name)) continue;
      let raw;
      try { raw = await VM.readText(f.name); } catch { continue; }
      if (!raw || !/}\s*$/.test(raw)) continue;   // still being written
      this._done.add(f.name);
      const id = f.name.slice(this.PREFIX.length).replace(/\.json$/, '');

      let call;
      try { call = JSON.parse(raw); }
      catch (e) { await this.answer(id, { ok: false, error: 'request was not valid JSON: ' + e.message }); continue; }
      await this.answer(id, await bridgeCall(call, 'guest_rpc'));
    }
    // The guest deletes its own files; forget names that are gone so the set
    // cannot grow without bound in a long session.
    if (this._done.size > 200) {
      const live = new Set((VM.listFiles() || []).map(f => f.name));
      for (const n of this._done) if (!live.has(n)) this._done.delete(n);
    }
  },

  async answer(id, result) {
    const body = JSON.stringify({ id, ...result });
    // writeQuietly so the reply does not re-trigger the hook that called us.
    try { await VM.writeQuietly('rpc-res-' + id + '.json', new TextEncoder().encode(body)); } catch {}
  },
};

// Tool schemas for the paste-key path. lib/agent-tools.ts is the server's copy
// and tests/agent-tools.test.ts pins the two name lists equal, so a tool added
// on one side cannot quietly go missing on the other.
/* ---------- what the desktop looks like, as text --------------------

   An agent on vibeos-mcp has no eyes: it built a window and could not tell
   whether the window said anything. read_desktop is the substitute for a
   screenshot of the page (nothing that rasterises the DOM is vendored):
   the window records, the dock, the machine pill, and on request one
   window's body as text per block or as markup with nothing executable
   left in it, or the machine's VGA screen, which v86 can draw. Every
   string is a value in a JSON reply; nothing here runs anything.
   -------------------------------------------------------------------- */
const Desktop = {
  TEXT_MAX: 8 * 1024, DOM_MAX: 16 * 1024,
  // The relay carries 128 KB a frame and the reply is JSON around the
  // image, so the picture itself stays under 110 KB of base64.
  IMAGE_WIDE: 1024, IMAGE_B64_MAX: 110 * 1024,
  BLOCK: /^(DIV|P|LI|TR|H[1-6]|PRE|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|TABLE|TEXTAREA|BUTTON|LABEL|FORM|DETAILS|SUMMARY|BLOCKQUOTE|DT|DD|OPTION|NAV|ASIDE|MAIN|HR|BR)$/,
  DROP: /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|IFRAME|FRAME|FRAMESET|OBJECT|EMBED|APPLET|LINK|BASE|META)$/,
  // Anything that loads bytes or names a document: its url is dropped in dom().
  URL_ATTR: /^(src|srcset|href|xlink:href|poster|action|formaction|data|background|ping|cite|longdesc|codebase|manifest|usemap)$/,
  MEDIA: /^(IMG|VIDEO|AUDIO|SOURCE|TRACK|PICTURE|INPUT|IMAGE|USE|FEIMAGE)$/,
  SECRET_INPUT: /^(password|hidden)$/i,

  px(v) { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n) : null; },

  windows() {
    const shell = UI.stable().SHELL;
    return Windows.list.map(rec => {
      const el = rec.el, s = rec.spec;
      const app = s.opts && s.opts.app;
      const builtin = s.id && shell[s.id] ? shell[s.id] : null;
      const out = {
        id: rec.id, app: this.appId(rec), title: String(s.title), badge: String(s.badge || ''),
        builtin: !!builtin, kind: builtin ? 'builtin' : app ? 'app' : 'other',
        minimized: !!el && el.classList.contains('min'), zoomed: !!el && el.dataset.full === '1',
        z: el ? Number(el.style.zIndex) || 0 : 0,
        x: el ? this.px(el.style.left) : null, y: el ? this.px(el.style.top) : null,
        w: el ? this.px(el.style.width) : null, h: el ? this.px(el.style.height) : null,
      };
      if (builtin) out.file = 'system/' + builtin.file;
      else if (app && app.name) out.file = 'apps/' + app.name;
      if (app) out.requires = Array.isArray(app.requires) ? app.requires.slice() : [];
      if (s.opts && typeof s.opts.tab === 'string') out.tab = s.opts.tab;
      return out;
    }).sort((a, b) => b.z - a.z);
  },

  // What paintDock paints, from the list it paints from: the shell's two
  // icons, the first eight apps, Settings.
  async dock() {
    const shell = UI.stable().SHELL;
    const { apps } = await Apps.list();
    const entry = (id, title) => ({ id, title: String(title), builtin: true, file: 'system/' + shell[id].file });
    return [
      entry('chat', shell.chat.title), entry('browser', shell.browser.title),
      ...apps.slice(0, 8).map(a => ({ id: 'apps/' + a.name, title: String(a.title), builtin: false, file: 'apps/' + a.name, requires: a.requires })),
      entry('settings', shell.settings.title),
    ];
  },

  vm() {
    const pill = document.getElementById('lxText');
    return { state: VM.state, image: VM.bootedImage || null, net: VM.net || null, tty: VM.ttyState || null, ip: VM.ip || null, restored: !!VM.restored, pill: pill ? pill.textContent : '' };
  },

  async overview() {
    const windows = this.windows();
    return { ok: true, windows, dock: await this.dock(), vm: this.vm(), theme: Theme.id, workspace: Workspace.label,
             remote: { state: RemoteBridge.state, agent: RemoteBridge.agentName || null },
             note: windows.length ? 'windows are top first; pass { window: <title or app id> } for one window\'s text' : 'no window is open' };
  },

  // A window's app id is its shell id (chat, browser, settings) or its
  // app file (apps/<name>.js) — what the windows list and the dock print.
  appId(rec) {
    const app = rec.spec.opts && rec.spec.opts.app;
    return rec.spec.id || (app && app.name ? 'apps/' + app.name : null);
  },

  find(which) {
    const want = String(which), lower = want.toLowerCase();
    const recs = Windows.list;
    const byId = recs.find(r => r.id === want) || recs.find(r => this.appId(r) === want) || recs.find(r => (this.appId(r) || '').toLowerCase() === lower)
      || recs.find(r => String(r.spec.title) === want) || recs.find(r => String(r.spec.title).toLowerCase() === lower);
    if (!byId) throw new Error('no open window is "' + want + '"; open: ' + (recs.map(r => '"' + r.spec.title + '"' + (this.appId(r) ? ' (' + this.appId(r) + ')' : '')).join(', ') || 'none'));
    if (!byId.el) throw new Error('the window "' + byId.spec.title + '" has no chrome yet');
    return byId;
  },

  // One line per block, whitespace collapsed, form values in brackets so a
  // typed-but-unsent line is visible. Hidden nodes and script/style are not
  // text anyone sees, so they are not text here either — nor is a password
  // or a hidden field's value, which the reply would hand a remote agent.
  text(root) {
    const out = [];
    const walk = node => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { out.push(n.nodeValue); continue; }
        if (n.nodeType !== 1) continue;
        if (this.DROP.test(n.tagName) || n.hidden) continue;
        const block = this.BLOCK.test(n.tagName);
        if (block) out.push('\n');
        if (n.tagName === 'INPUT' && this.SECRET_INPUT.test(n.type)) continue;
        if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT') out.push(n.value ? '[' + n.value + ']' : '');
        else walk(n);
        if (block) out.push('\n');
      }
    };
    walk(root);
    const lines = out.join('').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const text = lines.join('\n');
    return { text: text.slice(0, this.TEXT_MAX), truncated: text.length > this.TEXT_MAX, lines: lines.length };
  },

  // The markup with nothing that could run or fetch left in it: no script,
  // style, link or handler attributes; a url whose scheme is a script
  // (javascript:, vbscript: — the scheme read the way a browser reads it,
  // whitespace and control characters dropped, so java\nscript: is caught)
  // is removed from any attribute; every url on a media element, a form
  // or an svg image is replaced by data:, (a chat card's src is a whole
  // screenshot in base64, and a guest url would be fetched by the host).
  dom(root) {
    const copy = root.cloneNode(true);
    for (const n of [...copy.querySelectorAll('*')]) {
      if (this.DROP.test(n.tagName)) { n.remove(); continue; }
      const tag = n.tagName.toUpperCase();
      const secret = tag === 'INPUT' && this.SECRET_INPUT.test(n.type);
      for (const a of [...n.attributes]) {
        const name = a.name.toLowerCase();
        const scheme = a.value.replace(/[\s\x00-\x1f\x7f]/g, '').toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc' || name === 'style' || /^(javascript|vbscript|livescript):|^data:text\/html/.test(scheme)) { n.removeAttribute(a.name); continue; }
        if (secret && name === 'value') { n.removeAttribute(a.name); continue; }
        if (this.URL_ATTR.test(name) && (this.MEDIA.test(tag) || tag === 'FORM' || tag === 'BUTTON' || name !== 'href')) n.setAttribute(a.name, 'data:,');
      }
    }
    const html = copy.outerHTML;
    return { dom: html.slice(0, this.DOM_MAX), truncated: html.length > this.DOM_MAX };
  },

  // The VGA screen: v86 draws text mode to a div of rows and graphics to a
  // canvas, and its screen adapter renders either as a PNG. The rows travel
  // as text too, so a text-mode console needs no image at all. The PNG is
  // re-encoded as a JPEG no wider than 1024 and under the relay's frame.
  async screen() {
    if (!VM.emu || !VM.screen) throw new Error('the machine is ' + VM.state + ': no screen');
    const adapter = VM.emu.screen_adapter;
    if (!adapter || typeof adapter.make_screenshot !== 'function' || typeof adapter.get_text_screen !== 'function') throw new Error('this v86 build has no screen adapter to draw from');
    const canvas = VM.screen.querySelector('canvas');
    const graphical = !!canvas && canvas.style.display !== 'none' && canvas.width > 0;
    const rows = adapter.get_text_screen().map(r => r.replace(/\s+$/, ''));
    const text = rows.join('\n').replace(/\n+$/, '');
    const png = adapter.make_screenshot().src;
    if (typeof png !== 'string' || !png.startsWith('data:image/png')) throw new Error('the screen adapter drew no PNG');
    const image = await this.jpeg(png);
    return { mode: graphical ? 'graphical' : 'text', image, text, size: graphical ? { width: canvas.width, height: canvas.height } : { cols: rows[0] ? rows[0].length : 0, rows: rows.length },
             note: graphical ? 'the machine is in graphics mode; the image is the frame' : 'text mode: the rows are the screen, the image is the same rows drawn' };
  },

  async jpeg(src) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, this.IMAGE_WIDE / (img.naturalWidth || 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4, 0.3, 0.2]) {
      const url = c.toDataURL('image/jpeg', quality);
      const data = url.slice(url.indexOf(',') + 1);
      if (data.length <= this.IMAGE_B64_MAX) return { mimeType: 'image/jpeg', data, width: c.width, height: c.height, quality };
    }
    throw new Error('the screen image is over ' + Math.round(this.IMAGE_B64_MAX / 1024) + ' KB of base64 at every quality; the relay carries 128 KB a frame');
  },

  async read(input) {
    const i = input || {};
    if (i.screen !== undefined) {
      if (i.screen !== 'image' && i.screen !== 'png') throw new Error('screen must be "image" (png is accepted as an alias), got ' + JSON.stringify(i.screen));
      return { ok: true, ...(await this.screen()) };
    }
    if (i.window === undefined) return this.overview();
    const rec = this.find(i.window);
    const body = rec.el.querySelector('.body');
    if (!body) throw new Error('the window "' + rec.spec.title + '" has no body');
    const head = { id: rec.id, app: this.appId(rec), title: String(rec.spec.title), minimized: rec.el.classList.contains('min') };
    return { ok: true, window: { ...head, ...(i.dom ? this.dom(body) : this.text(body)) } };
  },
};

/* ---------- the workspace tree, for list_files and search_file ----------

   apps/ and data/ are directories on disk; system/ is the OS: what the
   loader boots is OS_FILES whether or not a copy is stored, so the listing
   is the loader's list merged with what the folder holds, each file saying
   which copy boots next and which one this page ran. A miss is refused
   naming what the parent holds — an agent guessing at system/os.js finds
   the kernel/ and ui/ it should have looked in.
   -------------------------------------------------------------------- */
const Files = {
  TOP: ['apps', 'data', 'system'],
  // The chat log and the machine snapshots live under system/ but are not
  // the OS: the mount rule keeps them out of /mnt, and the tools keep them
  // out of every listing, walk and read — a remote agent is not the person
  // whose chat that is.
  PRIVATE: /^system\/(chat\.json|vm-[^/]+\.state)$/,
  PRIVATE_NAME: /^(chat\.json|vm-[^/]+\.state)$/,
  isPrivate(rel) { return this.PRIVATE.test(this.norm(rel)); },
  refusePrivate(rel) { if (this.isPrivate(rel)) throw new Error(this.norm(rel) + ' is not readable through the tools: the chat log and the machine snapshots are the person\'s, not the OS'); },
  SKIP: /\.(state|png|jpe?g|gif|webp|zip|gz|tgz|wasm|bin|iso|pdf|woff2?|ttf)$/i,
  SKIP_BYTES: 1024 * 1024,
  HITS_MAX: 60,

  norm(path) { return String(path == null ? '' : path).trim().replace(/^\/+/, '').replace(/\/+$/, ''); },
  parts(rel) {
    if (rel === '') return [];
    const parts = rel.split('/');
    if (parts.some(p => p === '..' || p === '.' || !p)) throw new Error('bad path: ' + rel + ' (paths are relative to the workspace: apps/, data/, system/)');
    return parts;
  },

  async dirHandle(parts) {
    let dir = Workspace.root;
    try { for (const seg of parts) dir = await dir.getDirectoryHandle(seg); }
    catch (e) { if (e.name === 'NotFoundError' || e.name === 'TypeMismatchError') return null; throw e; }
    return dir;
  },

  // The entries of one directory, or a throw naming what its parent holds.
  async entries(rel) {
    if (!Workspace.open) throw new Error('no workspace is open');
    const parts = this.parts(rel);
    if (!parts.length) return this.TOP.map(name => ({ name, kind: 'dir', source: 'stored' }));
    if (!this.TOP.includes(parts[0])) throw new Error('not found: ' + rel + ' — the workspace has: ' + this.TOP.map(t => t + '/').join(', '));
    if (parts.length > 1 && (Workspace.systemFile(rel) || await this.isFile(rel))) throw new Error(rel + ' is a file, not a directory: read_file or search_file it');
    const dir = await this.dirHandle(parts);
    const out = [];
    if (dir) for await (const [name, h] of dir.entries()) {
      if (parts[0] === 'system' && parts.length === 1 && this.PRIVATE_NAME.test(name)) continue;
      if (h.kind === 'directory') out.push({ name, kind: 'dir', source: 'stored' });
      else { const f = await h.getFile(); out.push({ name, kind: 'file', source: 'stored', size: f.size, modified: f.lastModified }); }
    }
    if (parts[0] === 'system') await this.systemEntries(parts.slice(1).join('/'), out, !!dir || parts.length === 1);
    else if (!dir) throw new Error(await this.missing(rel));
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  // OS_FILES under system/: a loaded file is listed with or without a copy.
  async systemEntries(sub, out, exists) {
    const prefix = sub ? sub + '/' : '';
    const loaded = OS_FILES.filter(f => f.startsWith(prefix));
    if (!loaded.length && !exists) throw new Error(await this.missing('system/' + sub));
    for (const f of loaded) {
      const rest = f.slice(prefix.length);
      if (rest.includes('/')) {
        const name = rest.split('/')[0];
        if (!out.some(e => e.name === name)) out.push({ name, kind: 'dir', source: 'served' });
        continue;
      }
      const stored = await Workspace.readStoredSystem(f);
      const entry = out.find(e => e.name === rest) || (out.push({ name: rest, kind: 'file', source: 'served' }), out[out.length - 1]);
      entry.loads = true;
      entry.source = stored !== null && stored.trim() ? 'stored' : 'served';
      entry.booted = window.__vibeosBoot.files[f];
      if (stored !== null && !stored.trim()) entry.note = 'blank copy: retired, the served file boots';
    }
  },

  // "not found: X — <parent> has: a, b/" walking up to the nearest directory that exists.
  async missing(rel) {
    const parts = this.parts(rel);
    for (let n = parts.length - 1; n >= 0; n--) {
      const parent = parts.slice(0, n).join('/');
      let names;
      try { names = (await this.entries(parent)).map(e => e.name + (e.kind === 'dir' ? '/' : '')); } catch { continue; }
      return 'not found: ' + rel + ' — ' + (parent ? parent + '/' : 'the workspace') + ' has: ' + (names.join(', ') || 'nothing');
    }
    return 'not found: ' + rel;
  },

  async walk(rel, out = []) {
    for (const e of await this.entries(rel)) {
      const path = rel ? rel + '/' + e.name : e.name;
      if (e.kind === 'dir') await this.walk(path, out);
      else out.push({ path, size: e.size, source: e.source });
    }
    return out;
  },

  globRe(glob) {
    const re = glob.split('/').map(seg => seg === '**' ? '(?:.*)' : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('/').replace(/\(\?:\.\*\)\//g, '(?:.*/)?');
    return new RegExp('^' + re + '$');
  },

  // One file, every file under a directory, or a glob's matches — as paths.
  async resolve(spec) {
    const rel = this.norm(spec);
    if (/[*?]/.test(rel)) {
      const segs = rel.split('/');
      const fixed = []; for (const s of segs) { if (/[*?]/.test(s)) break; fixed.push(s); }
      const files = await this.walk(fixed.join('/'));
      const re = this.globRe(rel);
      const hit = files.filter(f => re.test(f.path));
      if (!hit.length) throw new Error('no file matches ' + rel + ' — ' + (fixed.length ? fixed.join('/') + '/' : 'the workspace') + ' has: ' + (await this.entries(fixed.join('/'))).map(e => e.name + (e.kind === 'dir' ? '/' : '')).join(', '));
      return { kind: 'glob', files: hit };
    }
    this.refusePrivate(rel);
    if (rel && Workspace.systemFile(rel)) return { kind: 'file', files: [{ path: rel, size: (await Workspace.readPath(rel)).length }] };
    const st = rel ? await this.stat(rel) : null;
    if (st) return { kind: 'file', files: [{ path: rel, size: st.size }] };
    const dir = await this.entries(rel).catch(() => null);
    if (dir) return { kind: 'dir', files: await this.walk(rel) };
    throw new Error(await this.missing(rel));
  },

  async isFile(rel) { return !!(await this.stat(rel)); },
  async stat(rel) {
    try { return await Workspace.statPath(rel); }
    catch (e) { if (e.name === 'TypeMismatchError') return null; throw e; }
  },

  // The matching runs in a worker with a deadline: a pattern with nested
  // quantifiers (^(\w+\s?)+$ on a long line that does not match) is
  // exponential, and on the main thread it froze the desktop for 50 s —
  // measured by vibeos-mcp with one search_file call from a remote agent. A
  // worker can be terminated; the main thread cannot interrupt itself.
  SEARCH_MS: 3000,
  matchInWorker(files, pattern, cap) {
    const src = `onmessage = e => { const { files, pattern, cap } = e.data; let re; try { re = new RegExp(pattern, 'i'); } catch (err) { postMessage({ error: 'bad regex: ' + err.message }); return; }
      const hits = []; let truncated = false;
      for (const f of files) { const lines = f.text.split('\\n'); for (let i = 0; i < lines.length; i++) { if (!re.test(lines[i])) continue; if (hits.length >= cap) { truncated = true; break; } hits.push({ path: f.path, line: i + 1, text: lines[i].slice(0, 200) }); } if (truncated) break; }
      postMessage({ hits, truncated }); };`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { w.terminate(); URL.revokeObjectURL(url); reject(new Error(`the pattern took longer than ${this.SEARCH_MS / 1000} s over ${files.length} file${files.length === 1 ? '' : 's'} and was stopped — a regex with nested quantifiers such as (\\w+\\s?)+ can run forever on a line that does not match; simplify it or narrow the path`)); }, this.SEARCH_MS);
      w.onmessage = e => { clearTimeout(timer); w.terminate(); URL.revokeObjectURL(url); if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data); };
      w.onerror = e => { clearTimeout(timer); w.terminate(); URL.revokeObjectURL(url); reject(new Error('search worker failed: ' + (e.message || 'unknown'))); };
      w.postMessage({ files, pattern, cap });
    });
  },
  async search(spec, pattern) {
    if (typeof pattern !== 'string' || !pattern) throw new Error('pattern must be a non-empty regex string' + (pattern === '' ? ' (an empty pattern matches every line: read_file instead)' : ', got ' + JSON.stringify(pattern)));
    new RegExp(pattern, 'i');   // a bad regex is named here, before any file is read
    const { kind, files } = await this.resolve(spec);
    const texts = [], skipped = [];
    let searched = 0;
    for (const f of files) {
      if (this.SKIP.test(f.path)) { skipped.push({ path: f.path, why: 'not text' }); continue; }
      if (f.size > this.SKIP_BYTES) { skipped.push({ path: f.path, why: Math.round(f.size / 1024) + ' KB, over the 1 MB cap' }); continue; }
      searched++;
      texts.push({ path: f.path, text: await Workspace.readPath(f.path) });
    }
    const { hits, truncated } = await this.matchInWorker(texts, pattern, this.HITS_MAX);
    const out = { ok: true, path: String(spec), hits };
    if (kind !== 'file') out.files = searched;
    if (skipped.length) out.skipped = skipped;
    if (truncated) { out.truncated = true; out.note = 'stopped at ' + this.HITS_MAX + ' hits; narrow the pattern or the path'; }
    return out;
  },
};

const TOOL_SCHEMAS = [
  { name: 'create_app', description: CREATE_APP_DESCRIPTION,
    parameters: { type: 'object', properties: { title: { type: 'string' }, source: { type: 'string' } }, required: ['title', 'source'] } },
  { name: 'vm_exec', description: 'Run a shell command in the vibeOS Linux VM and return its output (stdout and stderr, ANSI stripped). Waits 20 s by default; pass timeout_s (up to 600) for an install or a build, or background it (cmd > /mnt/job.log 2>&1 &) and tail the log.',
    parameters: { type: 'object', properties: { command: { type: 'string' }, timeout_s: { type: 'integer', minimum: 1, maximum: 600, description: 'Seconds to wait before the command is interrupted with Ctrl-C and the call fails. Default 20.' } }, required: ['command'] } },
  { name: 'list_apps', description: 'List apps already saved in the vibeOS workspace. .js files without a // @title header are not apps and come back under unlisted with the reason; add the header with edit_file if the user wants one in the dock. The reply also carries the /mnt mapping: the mount is flat and subdirectories under /mnt are not mirrored, and unmirrored names the root entries the mirror skipped (directories, symlinks, special files).',
    parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'read_desktop', description: READ_DESKTOP_DESCRIPTION,
    parameters: { type: 'object', properties: { window: { type: 'string', description: 'A window\'s title or app id: its body as text, one line per block' }, dom: { type: 'boolean', description: 'With window: the sanitised outerHTML instead of text' }, screen: { type: 'string', enum: ['image', 'png'], description: 'The machine\'s VGA screen as an image, with the text console\'s rows' } }, required: [] } },
  { name: 'list_files', description: LIST_FILES_DESCRIPTION,
    parameters: { type: 'object', properties: { path: { type: 'string', description: "'' for the top, or a directory: apps/, data/, system/, system/kernel, system/ui" } }, required: [] } },
  { name: 'list_themes', description: LIST_THEMES_DESCRIPTION,
    parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'set_theme', description: 'Restyle the desktop itself: a theme id, or individual colour tokens (list_themes names them).',
    parameters: { type: 'object', properties: { theme: { type: 'string', enum: ['vibeos-dark', 'vibeos-light', 'win95'] },
                  tokens: { type: 'object', additionalProperties: { type: 'string' } } }, required: [] } },
  { name: 'read_file', description: 'Read a file from the workspace. The operating system is system/kernel/*.js (the machine, workspace, agent loop; reload_os) and system/ui/*.js (windows, dock, chat, Browser, Settings; reload_ui), styled by system/os.css. Optional line range for big files.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, from: { type: 'integer' }, to: { type: 'integer' } }, required: ['path'] } },
  { name: 'search_file', description: SEARCH_FILE_DESCRIPTION,
    parameters: { type: 'object', properties: { path: { type: 'string' }, pattern: { type: 'string' } }, required: ['path', 'pattern'] } },
  { name: 'edit_file', description: 'Replace one exact occurrence of old with new in a workspace file. The first edit of a system/ file forks it from the served copy; from then on yours boots. Call reload_ui to apply a system/ui edit live, reload_os for system/kernel or system/os.css.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
  { name: 'write_file', description: 'Write a whole workspace file (apps/*.js, data/*, system/kernel/*.js, system/ui/*.js, system/os.css). Prefer edit_file for changes.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'reload_ui', description: 'Re-import the ui — system/ui/*.js — under the running kernel, live: the machine, the workspace, the chat log and this turn all stay, open windows are repainted by the new ui, and the turn goes on, so say what changed after it. A ui that does not parse, fails to import or throws while painting is refused with the error and the previous ui keeps running. Refuses when no system/ui file has been edited.',
    parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'reload_os', description: 'Reload the page so edits to system/kernel/*.js or system/os.css take effect (a system/ui edit needs only reload_ui). The reload ends this turn — nothing you say after it reaches the user — so make every edit first, call it once, last, and pass a note: it is shown in the chat after boot. Refuses when nothing has been edited. If the edited OS fails to boot, the stock one runs next time and says so — you cannot lock yourself out. Through vibeos-mcp the pairing survives the reload: the tab resumes it after boot and the package reconnects on its own; a call made while the page is down fails with peer not connected — wait a few seconds and call again.',
    parameters: { type: 'object', properties: { note: { type: 'string', description: 'One line shown in the chat after the reboot, e.g. what changed' } }, required: [] } },
  { name: 'web_fetch', description: 'Read a web page as text.',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'web_search', description: 'Search the web and get back result titles and URLs.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
];

// reload_os kills the page mid-turn, so whatever the model says after it never
// arrives. The note it passed is parked here and the next boot's chat reads it.
const RELOAD_NOTE = 'vibeos-reload-note';

// os.js is a classic script and the loader boots the stored copy as one; a
// function body parses the same text, so this catches a syntax error before it
// costs a failed boot and a recovery. Nothing runs: new Function only compiles.
function parseError(js) {
  try { new Function(js); return null; }
  catch (e) { return e.name + ': ' + e.message; }
}

// An app is an ES module, which new Function rejects on its `export`. The
// export keywords are dropped for the check only — the file that is saved is
// untouched — so a truncated or unbalanced module is caught before launch.
// apt and wget redraw a progress line with bare carriage returns; painted as
// text, every redraw survived and "Reading package lists... 0%Reading package
// lists... 60%..." filled the Terminal. A \r starts the line over, as on a tty.
function crCollapse(text) {
  return String(text).split('\n').map(l => l.slice(l.lastIndexOf('\r') + 1)).join('\n');
}

function moduleParseError(js) {
  const asScript = String(js)
    .replace(/\bexport\s+default\s+/g, 'const __vibeos_default = ')
    .replace(/\bexport\s+(?=(const|let|var|function|class|async)\b)/g, '')
    .replace(/\bexport\s*\{[^}]*\}\s*(?:from\s*['"][^'"\n]*['"])?\s*;?/g, '')
    .replace(/\bexport\s*\*\s*(?:as\s+\w+\s+)?from\s*['"][^'"\n]*['"]\s*;?/g, '')
    .replace(/^\s*import\s+(?:[^'";]*?from\s*)?['"][^'"\n]*['"]\s*;?/gm, '');
  return parseError(asScript);
}

// A kernel file is a classic script, a ui file an ES module; each is checked
// the way the loader will read it. Any other path is not checked.
function systemSyntaxError(path, text) {
  const file = Workspace.systemFile(path);
  if (!file || !file.endsWith('.js')) return null;
  return file.startsWith('ui/') ? moduleParseError(text) : parseError(text);
}
function applyNote(path) {
  const file = Workspace.systemFile(path);
  if (!file) return 'saved';
  return file.startsWith('ui/') ? 'saved — call reload_ui to apply it live' : 'saved — call reload_os to apply';
}

const CUT_OFF = "the model's reply was cut off at the token limit (16000) before it finished; ask for something smaller, or for the app in parts";

/* Read a JSON reply, or say what came back instead. Vercel answers a request
   body over 4.5 MB with a 413 as text/plain before the route ever runs, so
   `await r.json()` on it surfaced "Unexpected token 'R'" — a parse error for a
   size limit. The status and the first line of the body name the real cause. */
async function jsonOf(r, who) {
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`${who} returned ${r.status}: ${text.trim().slice(0, 200) || '(empty body)'}`); }
}

/* ---------- bring your own agent ---------------------------------------

   The alternative login. Claude Code, Cursor or Codex runs `npx vibeos-mcp
   --token <token>` and drives this desktop with its own model and its own
   subscription; vibeOS supplies the tools and the machine. A tab cannot
   listen, so both ends dial the relay (app/api/mcp/[token]) and it pairs them
   by token and copies frames. The contract between the two ends is in
   the README of github.com/caffeinum/vibeos-mcp; the relay reads none of it but the hello.

   The token is root on this desktop — edit_file on system/kernel/*.js and
   vm_exec are in the tool set — so it lives in a module variable, never in
   storage or a URL, is minted here with getRandomValues, and dies with the
   tab. Revoke closes the socket, forgets it, and tells the relay so the
   package holding it gets 4003 and then 4002 on every call.

   Transport-agnostic on purpose: RemoteBridge speaks frames to whatever
   RemoteSocket dials. Today that is the vibeos.sh relay (or the URL under
   `vibeos-mcp-relay` in localStorage — the e2e's local relay); a local helper
   on 127.0.0.1 is one more URL, not a second bridge.
   -------------------------------------------------------------------- */

let remoteToken = null;
// The token's home for the life of the TAB: sessionStorage is per tab and
// gone when it closes, the same lifetime a module variable had — but it
// survives reload_os, which a module variable did not, so an agent that
// edited the kernel and reloaded read "revoked" for its own reload. The
// keep flag is set by reload_os alone: pagehide without it (a close, a
// hand reload) still revokes, and a boot without it does not resume — a
// duplicated tab (Chrome's Duplicate, window.open(location.href)) gets a
// copy of sessionStorage, token included, and used to dial with it, kick
// the original to 4001 and revoke the token when it closed.
const MCP_TOKEN_KEY = 'vibeos-mcp-token', MCP_AGENT_KEY = 'vibeos-mcp-agent', MCP_KEEP_KEY = 'vibeos-mcp-keep';
function setRemoteToken(token) {
  remoteToken = token;
  try { if (token) sessionStorage.setItem(MCP_TOKEN_KEY, token); else { sessionStorage.removeItem(MCP_TOKEN_KEY); sessionStorage.removeItem(MCP_AGENT_KEY); } }
  catch (e) { console.warn('RemoteBridge: sessionStorage refused the token; the pairing will not survive reload_os: ' + e.message); }
}

// The revoke is a hello with the token and `revoke: true` (lib/mcp-relay.ts
// revokeFrame, the same bytes): it carries the token, so it does not depend
// on the relay still holding this socket's row — the byte-exact revoke frame
// did, and on the durable relay a socket that closed right behind it raced
// its own $disconnect and lost the revoke half the time (measured 6 in 12).
const mcpRevokeFrame = token => JSON.stringify({ hello: 'tab', token, revoke: true });
// API Gateway's message limit: a larger reply closes the SENDER 1009 and the
// agent reads "peer not connected" for a result that was merely big.
const MCP_FRAME_MAX = 128 * 1024;
const MCP_TOKEN_RE = /^[0-9a-f]{64}$/;
// The durable relay (infra/mcp-relay: API Gateway WebSockets, pairing rows in
// DynamoDB). The page is static, so the url is a constant like NET_DEFAULT in
// machine.js; the same-origin /api/mcp/relay is the fallback when this one
// cannot be dialed, and `vibeos-mcp-relay` in localStorage overrides both.
const MCP_RELAY_URL = 'wss://2yetm9bvy2.execute-api.us-east-1.amazonaws.com/prod';

// A WebSocket that redials in place, the shape of RelaySocket without the
// WISP stream bookkeeping: the relay is a serverless function that ends at
// its maxDuration (800 s), so a healthy socket closes every ~13 minutes and
// the hello has to be the first frame on every dial. Frames sent in a gap are
// held and flushed. Five failed dials, or a close the relay means (4001
// replaced, 4003 revoked), end it; the bridge says which.
class RemoteSocket {
  // Never gives up on its own: the relay is a serverless function, and a
  // deploy cuts every socket for longer than five quick redials (~7.5 s) —
  // a tab that gave up sat in the error state with "retry" while its agent
  // dialed a relay that had the token and no tab. Backoff climbs to a
  // 30 s cap and stays there for as long as the tab holds a token; only a
  // close code that means it (4001 replaced, 4003 revoked) or close() ends it.
  static delays = [500, 1000, 2000, 5000, 10000, 30000];
  static CAP_MS = 30000;

  constructor(url, { hello, onOpen, onFrame, onGap, onEnd, onFirstFail = null }) {
    this.url = url;
    this.hello = hello;
    this.onOpen = onOpen; this.onFrame = onFrame; this.onGap = onGap; this.onEnd = onEnd;
    // When set, a first dial that never opens ends this socket and reports
    // there instead of redialing: the bridge uses it to fall back to another
    // relay. A drop after an open is a gap, never a fallback.
    this.onFirstFail = onFirstFail;
    this.__inner = null;            // the native socket of the moment; a test hook, and named so
    this.opened = false;
    this.ended = false;
    this.attempt = 0;
    this.redials = 0;
    this.timer = null;
    this.held = [];
    this.dial();
  }

  dial() {
    const inner = new WebSocket(this.url);
    this.__inner = inner;
    inner.addEventListener('open', () => {
      if (inner !== this.__inner) return;
      this.attempt = 0;
      if (this.opened) this.redials++;
      this.opened = true;
      inner.send(JSON.stringify(this.hello()));
      for (const frame of this.held.splice(0)) inner.send(frame);
      this.onOpen();
    });
    inner.addEventListener('message', e => {
      if (inner !== this.__inner) return;
      const bye = RemoteSocket.byeOf(e.data);
      if (bye) this.bye(bye.code, bye.reason); else this.onFrame(e.data);
    });
    inner.addEventListener('close', e => { if (inner === this.__inner) this.closed_(e); });
  }

  // {bye, reason} from the relay (API Gateway cannot close with a custom
  // code). Read here, not in the bridge: a released socket must take its own
  // bye, and the bridge may already be dialing the next one.
  static byeOf(raw) {
    if (typeof raw !== 'string' || raw.length > 300 || !raw.startsWith('{')) return null;
    let m;
    try { m = JSON.parse(raw); } catch { return null; }
    if (!m || typeof m.bye !== 'number') return null;
    return { code: m.bye, reason: typeof m.reason === 'string' ? m.reason.slice(0, 200) : '' };
  }

  // The relay is about to end this socket (a revoke was sent on it): stop
  // reporting, never redial, and close it ourselves only if the relay's bye
  // has not arrived in `ms`. Closing right after the send raced the frame
  // against this socket's own $disconnect on the durable relay.
  release(ms) {
    if (this.ended) return;
    this.released = true;
    this.held = [];
    this.onOpen = () => {}; this.onFrame = () => {}; this.onGap = () => {}; this.onEnd = () => {}; this.onFirstFail = null;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.close(1000, 'revoked'), ms);
  }

  closed_(e) {
    if (this.ended) return;
    if (this.released) { this.ended = true; clearTimeout(this.timer); return; }
    const meant = e.code === 4001 || e.code === 4003;
    if (meant) {
      this.ended = true;
      this.held = [];
      this.onEnd({ code: e.code, reason: e.reason, gaveUp: false });
      return;
    }
    if (!this.opened && this.onFirstFail) {
      this.ended = true;
      this.held = [];
      this.onFirstFail();
      return;
    }
    const delay = RemoteSocket.delays[Math.min(this.attempt, RemoteSocket.delays.length - 1)];
    if (this.attempt === 0) this.onGap();
    else this.onGap(this.attempt, delay);
    this.attempt++;
    this.timer = setTimeout(() => { this.timer = null; this.dial(); }, delay);
  }

  get open() { return !this.ended && this.__inner.readyState === 1; }

  // The relay meant to end this socket but cannot say so in the close code
  // (API Gateway closes every socket 1000): a {bye, reason} frame arrives
  // first and is final exactly as that close code would be.
  bye(code, reason) {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    this.held = [];
    if (this.__inner.readyState < 2) this.__inner.close(1000, 'bye');
    this.onEnd({ code, reason, gaveUp: false });
  }

  send(frame) {
    if (this.ended) throw new Error('RemoteSocket: send after close');
    if (this.open) this.__inner.send(frame); else this.held.push(frame);
  }

  close(code, reason) {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    this.held = [];
    if (this.__inner.readyState < 2) this.__inner.close(code, reason);
  }
}

const RemoteBridge = {
  RELAY_KEY: 'vibeos-mcp-relay',
  awsUrl: MCP_RELAY_URL,
  // Set when the durable relay's first dial never opened; every later dial
  // goes to this origin's /api/mcp/relay until the page reloads.
  fellBack: false,
  KEEPALIVE_MS: 30000,
  // A pong must come back within this, or the socket is dead without a
  // close event (a laptop that slept, a network that changed) and the pane
  // would say 'waiting' over a relay that dropped the tab long ago.
  PONG_MS: 10000,
  instance: null,
  // off | pairing | waiting | connected | error. `detail` is the agent's name
  // when connected, the message when error, the reason while pairing.
  state: 'off',
  detail: '',
  socket: null,
  agentName: '',
  calls: 0,
  relayErrors: 0,
  keepalive: null,
  listeners: new Set(),

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.listeners.forEach(fn => { try { fn(this.state, this.detail); } catch (e) { console.error('RemoteBridge listener failed:', e); } }); },
  set(state, detail = '') {
    if (state === this.state && detail === this.detail) return;
    this.state = state; this.detail = detail;
    this.emit();
  },

  get token() { return remoteToken; },
  command() {
    if (!remoteToken) throw new Error('RemoteBridge.command: no token — pair first');
    // The whole `claude mcp add` line, not the bare npx command: a stdio mcp
    // server run by hand in a terminal just waits for a client and looks hung
    // (aleks tried exactly that). Cursor and codex take the same npx part.
    // `--relay` names the relay THIS tab is on: the package's default is the
    // origin relay, and a tab on the durable relay would never meet it.
    // vibeos-mcp 0.1.8+ defaults to the durable relay, so the line carries
    // --relay only when this tab is somewhere else (the origin fallback, or
    // the e2e's local relay); a shorter line is one fewer thing to get wrong.
    const relay = this.relayUrl();
    return 'claude mcp add vibeos -- npx vibeos-mcp --token ' + remoteToken + (relay === this.awsUrl ? '' : ' --relay ' + relay);
  },

  mint() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    if (!MCP_TOKEN_RE.test(hex)) throw new Error('minted a token that is not 64 hex');
    return hex;
  },

  override() {
    try { return localStorage.getItem(this.RELAY_KEY) || null; } catch { return null; }
  },
  originUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/mcp/relay'; },
  // override | aws | origin — which relay the next dial goes to.
  get relay() { return this.override() ? 'override' : this.fellBack ? 'origin' : 'aws'; },
  relayUrl() {
    const override = this.override();
    if (override) return override;
    return this.fellBack ? this.originUrl() : this.awsUrl;
  },
  // For the pane: which relay this tab is on, in words, plus the instance.
  relayLabel() {
    const where = this.relay === 'aws' ? 'the durable relay (aws)'
      : this.relay === 'origin' ? 'this origin (the durable relay could not be reached)'
      : 'the relay at ' + this.relayUrl();
    return where + (this.instance ? ', instance ' + this.instance : '');
  },

  // Pairing inside a host shell is refused: a remote agent with root on the
  // page would have root on the machine the shell runs on, not on a VM.
  refusal() {
    if (typeof window.__TAURI__ !== 'undefined') return 'not inside a host shell: this page is running with native powers, and an agent with this token would have them too — pair from a browser tab instead.';
    return null;
  },

  // The static mirror has no /api. Ask, the way runWithKey asks for the
  // prompt endpoint: a 404 on the relay's URL is "no relay here", said in
  // the pane instead of five failed dials behind a spinner.
  async available() {
    if (this.probe) return this.probe;
    // A WebSocket API answers a HEAD with 403 whatever its state: the first
    // dial is the probe, and one that never opens falls back to this origin.
    if (this.relay === 'aws') return { ok: true };
    const url = this.relayUrl().replace(/^ws/, 'http');
    let r;
    try { r = await fetch(url, { method: 'HEAD' }); }
    catch (e) { return { ok: false, reason: 'the relay at ' + url + ' did not answer: ' + e.message }; }
    if (r.status === 404) this.probe = { ok: false, reason: 'this copy of vibeOS is served without /api, so there is no relay to pair through — open vibeos.sh/app to bring your own agent.' };
    else this.probe = { ok: true };
    return this.probe;
  },

  async pair() {
    const refusal = this.refusal();
    if (refusal) { this.set('error', refusal); return false; }
    if (remoteToken) return true;
    const probe = await this.available();
    if (!probe.ok) { this.set('error', probe.reason); return false; }
    setRemoteToken(this.mint());
    this.agentName = '';
    this.set('pairing', 'dialing the relay');
    this.dial();
    return true;
  },

  // After reload_os: the token the page before left in sessionStorage is
  // this tab's, so dial with it. The durable relay kept the agent side; the
  // package redials and asks for the tools on its own, and a call it made
  // while the page was down failed with peer not connected — its retry lands.
  // The keep flag is the proof this boot is that reload: it is consumed
  // here, so a copied tab (no flag) drops the copied token instead.
  resume() {
    let stored = null, name = '', keep = false;
    try {
      stored = sessionStorage.getItem(MCP_TOKEN_KEY); name = sessionStorage.getItem(MCP_AGENT_KEY) || '';
      keep = sessionStorage.getItem(MCP_KEEP_KEY) === '1'; sessionStorage.removeItem(MCP_KEEP_KEY);
    } catch { return false; }
    if (!stored) return false;
    if (!keep) { setRemoteToken(null); console.warn('RemoteBridge: a pairing token without the reload flag (a duplicated tab?); dropped it — the tab it belongs to keeps the pairing'); return false; }
    if (!MCP_TOKEN_RE.test(stored)) { setRemoteToken(null); throw new Error('the pairing token in sessionStorage is not 64 hex; dropped it'); }
    if (this.refusal()) { setRemoteToken(null); return false; }
    remoteToken = stored;
    this.agentName = name.slice(0, 80);
    this.resumed = true;
    track('mcp_resumed');
    this.set('pairing', 'resuming the pairing after a reload');
    this.dial();
    return true;
  },

  // reload_os is about to replace the page: keep the token so the next boot
  // resumes instead of revoking. Only with a token — a stale flag would
  // spare the next pairing's real close — and not one another tab took.
  keepAcrossReload() {
    if (!remoteToken || this.displaced) return false;
    try { sessionStorage.setItem(MCP_KEEP_KEY, '1'); } catch (e) { console.warn('RemoteBridge: could not flag the reload; the pairing will be revoked: ' + e.message); return false; }
    return true;
  },

  // The same token, a fresh dialer: after the relay gave up on us, without
  // making the person paste a new command into their agent.
  retry() {
    if (!remoteToken) return this.pair();
    if (this.socket) return true;
    this.set('pairing', 'dialing the relay');
    this.dial();
    return true;
  },

  dial() {
    this.displaced = false;
    this.socket = new RemoteSocket(this.relayUrl(), {
      hello: () => ({ hello: 'tab', token: remoteToken }),
      onOpen: () => {
        // Unsolicited, for an agent already waiting; the package also asks on
        // every connect of its own, and `want` is answered every time.
        this.socket.send(JSON.stringify({ tools: TOOL_SCHEMAS }));
        this.set('waiting');
      },
      onFrame: raw => this.handle(raw),
      onGap: (attempt, delay) => this.set('pairing', attempt ? `the relay is unreachable (${attempt} redials); trying again in ${Math.round(delay / 1000)} s` : 'the relay dropped the socket; redialing'),
      onEnd: ({ code, reason, gaveUp }) => {
        this.socket = null;
        this.stopKeepalive();
        if (code === 4003) { setRemoteToken(null); this.set('off'); return; }
        if (code === 4001) { this.displaced = true; this.set('error', 'another tab paired with this token and took its place; revoke here, or pair again there'); return; }
        const what = 'the relay ended the socket on a code it does not mean: ' + code + (gaveUp ? ' (gave up)' : '');
        this.set('error', what);
        throw new Error('RemoteSocket: ' + what);
      },
      onFirstFail: this.relay === 'aws' ? () => this.fallBack() : null,
    });
    this.startKeepalive();
  },

  // The durable relay's first dial never opened (a network that blocks
  // execute-api, a stack that is gone): the same token, this origin's relay.
  // Only a failed FIRST dial, never a timeout on a call — a drop after an
  // open is the 2 h cut or an outage, and RemoteSocket redials in place.
  async fallBack() {
    this.socket = null;
    this.stopKeepalive();
    this.fellBack = true;
    track('mcp_relay_fallback');
    this.set('pairing', 'the durable relay could not be reached; trying this origin');
    const probe = await this.available();
    if (!probe.ok) { this.set('error', 'the durable relay could not be reached, and ' + probe.reason); return; }
    if (!remoteToken) return;
    this.dial();
  },

  // The relay only says "peer not connected" when we send something, so a
  // frame every 30 s is how the pane learns the agent left. The package
  // ignores a frame with no id, tools or error.
  startKeepalive() {
    this.stopKeepalive();
    this.keepalive = setInterval(() => {
      if (!this.socket || !this.socket.open) return;
      this.socket.send(JSON.stringify({ ping: Date.now() }));
      // The deadline runs from the FIRST unanswered ping; a later ping must
      // not push it out, or a dead socket is never declared dead.
      if (this.pongTimer) return;
      this.pongTimer = setTimeout(() => {
        if (!this.socket || !this.socket.open) return;
        console.warn('RemoteBridge: no pong in ' + this.PONG_MS + ' ms — the socket is dead without saying so; redialing');
        track('mcp_silent');
        this.set('pairing', 'the relay went silent; redialing');
        this.socket.__inner.close();   // RemoteSocket redials on close
      }, this.PONG_MS);
    }, this.KEEPALIVE_MS);
  },
  stopKeepalive() { clearInterval(this.keepalive); this.keepalive = null; clearTimeout(this.pongTimer); this.pongTimer = null; },

  handle(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { console.error('RemoteBridge: a frame that is not JSON from the relay:', raw); return; }
    if (!msg || typeof msg !== 'object') return;
    // The pane names the instance: repaint when it arrives, since the hello
    // reply lands after 'waiting' was set and `set` dedups an unchanged state.
    if (typeof msg.instance === 'string' && msg.instance.slice(0, 16) !== this.instance) { this.instance = msg.instance.slice(0, 16); this.emit(); }
    if ('pong' in msg) { clearTimeout(this.pongTimer); this.pongTimer = null; return; }
    // API Gateway's own reply when the Lambda behind a frame failed or was
    // throttled: that frame is gone, and a call the agent sent with it will
    // hang on its side. Loud, never a no-op.
    if (typeof msg.message === 'string' && typeof msg.connectionId === 'string' && typeof msg.requestId === 'string') {
      this.relayErrors++;
      console.error('RemoteBridge: the relay dropped a frame: ' + msg.message.slice(0, 200) + ' (request ' + msg.requestId.slice(0, 64) + ')');
      track('mcp_relay_error');
      this.emit();
      return;
    }
    if ('paired' in msg) { if (msg.paired) this.connected(); else this.set('waiting'); return; }
    if (msg.want === 'tools') {
      this.connected(typeof msg.agent === 'string' ? msg.agent.slice(0, 80) : '');
      this.socket.send(JSON.stringify({ tools: TOOL_SCHEMAS }));
      return;
    }
    if (msg.error && msg.code === 4002) { this.set('waiting'); return; }
    if (msg.id != null && typeof msg.tool === 'string') { this.call(msg); return; }
  },

  connected(name = '') {
    if (name) { this.agentName = name; try { sessionStorage.setItem(MCP_AGENT_KEY, name); } catch {} }
    const label = this.agentName || 'an agent';
    if (this.state !== 'connected') track('mcp_paired');
    this.set('connected', label);
  },

  // What the connected agent did, newest last, capped; the chat paints it as
  // the activity view when no model of its own is connected. Input is
  // summarised to one short line (a title, a command, a path) — never the
  // whole source — and every field is text on the way to the DOM.
  activity: [],
  ACTIVITY_MAX: 200,
  activityListeners: new Set(),
  onActivity(fn) { this.activityListeners.add(fn); return () => this.activityListeners.delete(fn); },
  summarise(tool, input) {
    const i = input || {};
    const pick = i.title || i.command || i.path || i.query || i.url || i.theme || (typeof i.code === 'string' ? i.code : '') || i.note || '';
    return String(pick).replace(/\s+/g, ' ').slice(0, 120);
  },
  async call(msg) {
    this.calls++;
    this.connected();
    this.emit();
    const t0 = Date.now();
    const entry = { at: t0, tool: String(msg.tool), what: this.summarise(msg.tool, msg.input), ok: null, ms: 0, error: '' };
    this.activity.push(entry); if (this.activity.length > this.ACTIVITY_MAX) this.activity.splice(0, this.activity.length - this.ACTIVITY_MAX);
    const result = await bridgeCall({ tool: msg.tool, input: msg.input }, 'mcp_call');
    entry.ok = !(result && result.ok === false); entry.ms = Date.now() - t0; entry.error = entry.ok ? '' : String(result.error || '').slice(0, 200);
    this.activityListeners.forEach(fn => { try { fn(entry); } catch (e) { console.error('RemoteBridge activity listener failed:', e); } });
    // The socket may have been cut or revoked while the tool ran: a held frame
    // goes out on the redial (the package answers or has already failed the
    // call by id); after a revoke there is nowhere to send and nothing owed.
    if (!this.socket) return;
    const frame = result && result.ok === false
      ? { id: msg.id, error: result.error + (result.available ? ' (available: ' + result.available.join(', ') + ')' : '') }
      : { id: msg.id, result };
    let wire = JSON.stringify(frame);
    const bytes = new TextEncoder().encode(wire).length;
    if (bytes > MCP_FRAME_MAX) {
      entry.ok = false; entry.error = 'result too big for the relay';
      wire = JSON.stringify({ id: msg.id, error: 'result is ' + Math.round(bytes / 1024) + ' KB, the relay carries ' + (MCP_FRAME_MAX / 1024) + ' KB: read a smaller range, or pipe through head' });
    }
    this.socket.send(wire);
  },

  revoke() {
    if (!remoteToken) return;
    track('mcp_revoked');
    const token = remoteToken;
    const s = this.socket;
    this.socket = null;
    this.stopKeepalive();
    setRemoteToken(null);
    this.agentName = '';
    // On an open socket the relay ends it (bye 4003, then the close); the
    // socket is released to take that on its own, 5 s at most.
    if (s && s.open) { s.send(mcpRevokeFrame(token)); s.release(5000); }
    else { if (s) s.close(1000, 'revoked'); this.deliverRevoke(token); }
    this.set('off');
  },

  // A revoke clicked in a gap (the 800 s cut, any drop) used to forget the
  // token here and nowhere else: the relay kept the agent side attached, the
  // package read every later call as "peer not connected" — an outage, not a
  // decision — and the token stayed resolvable for anyone holding it. One
  // fresh dial carries the frame; the relay answers 4003 to both ends.
  deliverRevoke(token) {
    const ws = new WebSocket(this.relayUrl());
    ws.addEventListener('open', () => ws.send(mcpRevokeFrame(token)));
    ws.addEventListener('error', () => console.error('RemoteBridge: the relay did not take the revoke; the token is forgotten here, and the package will read peer not connected until the relay function ends'));
  },

  // The token dies with the tab, so the pairing must too: without this a
  // closed or reloaded tab (reload_os included) left the agent side attached
  // and the package answering "peer not connected" for good, with no way
  // back but a new token pasted into its config.
  unload() {
    let keep = false;
    try { keep = sessionStorage.getItem(MCP_KEEP_KEY) === '1'; } catch {}
    if (!remoteToken) return;
    // reload_os: the token and the flag stay in sessionStorage for the boot
    // after this one (resume consumes the flag); the socket dies with the
    // page and the relay tells the agent "peer not connected" until the tab
    // is back.
    if (keep) return;
    const s = this.socket;
    if (s && s.open) s.send(mcpRevokeFrame(remoteToken));
    else this.deliverRevoke(remoteToken);
    this.socket = null;
    this.stopKeepalive();
    setRemoteToken(null);
    this.agentName = '';
    this.set('off');
  },
};
window.addEventListener('pagehide', () => RemoteBridge.unload());
// Loud, never fatal: a bad stored token must not take the kernel down with it.
try { RemoteBridge.resume(); } catch (e) { console.error('RemoteBridge.resume failed: ' + e.message); }

const Agent = {
  // 5 was one read, one search, one edit, one reload and nothing left over for
  // a refusal; every guard below hands the model an error it should act on.
  MAX_STEPS: 8,

  /* One user turn, in the dialect of whichever transport carries it. Three
     transports, three shapes for the same picture: chat completions wants
     image_url with a data URL, Anthropic wants a base64 block, and the AI SDK
     wants {type:'image', image} — which the server passes through verbatim, so
     a screenshot reaches Codex without the route learning what one is.
     A text-only turn stays a plain string, so a chat with no image sends
     exactly the bytes it sent before. */
  userContent(shape, text, images) {
    if (!images || !images.length) return text;
    const textPart = text ? [{ type: 'text', text }] : [];
    if (shape === 'openai')    return [...textPart, ...images.map(i => ({ type: 'image_url', image_url: { url: i.dataUrl } }))];
    if (shape === 'anthropic') return [...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } })), ...textPart];
    if (shape === 'sdk')       return [...textPart, ...images.map(i => ({ type: 'image', image: i.dataUrl }))];
    throw new Error('unknown message shape: ' + shape);
  },

  async callServer(body) {
    await Gen.ensureOAuthFresh();
    const auth = VibeOSOAuth.oauthAuthHeaders(Gen.oauth);
    if (!auth) throw new Error('no oauth session');
    const r = await fetch('/api/openai/generate', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, auth),
      body: JSON.stringify(body),
    });
    const j = await jsonOf(r, 'server');
    if (!r.ok) throw new Error(j.error || ('server returned ' + r.status));
    return j;
  },

  // The composed prompt, from the server, so the browser holds no fourth copy.
  async systemPrompt() {
    const key = (VM.bootedImage || VM.image) + '|' + Theme.id;
    if (this._promptKey === key && this._prompt) return this._prompt;
    const r = await fetch(`/api/agent/prompt?image=${encodeURIComponent(VM.bootedImage || VM.image)}&theme=${encodeURIComponent(Theme.id)}`);
    const j = await r.json();
    if (!r.ok || !j.prompt) throw new Error(j.error || 'could not load the agent prompt');
    this._prompt = j.prompt; this._promptKey = key;
    return this._prompt;
  },

  /* The same agent, against the user's own key, from the page.
     A pasted key used to get one-shot codegen and no tools at all: it could
     write a window, but could not look at the workspace, run anything in the
     VM, or restyle the desktop — which made "bring your own key" a visibly
     lesser product than signing in, for no reason anyone chose. */
  async runWithKey(prompt, history, onStatus, images) {
    let system;
    try { system = await this.systemPrompt(); }
    catch (e) {
      // Static hosting (the open-source mirror) has no /api. That used to mean
      // one-shot codegen with the local prompt, and it still does — the tools
      // need the endpoint, the window does not. Say which mode this is.
      onStatus?.('no agent endpoint here — one-shot mode');
      const source = await Gen.generate(prompt, history, onStatus, images);
      const title = parseTitle(source) || 'app';
      const out = await this.executeTool({ toolName: 'create_app', input: { title, source } }, onStatus);
      return { text: '', created: [out], steps: 1, oneShot: true };
    }
    const anthropic = Gen.provider === 'anthropic';
    const created = [];
    let msgs = [
      ...historyWindow(history).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: this.userContent(anthropic ? 'anthropic' : 'openai', prompt, images) },
    ];
    let lastText = '';

    for (let step = 0; step < this.MAX_STEPS; step++) {
      const res = anthropic ? await this.stepAnthropic(system, msgs) : await this.stepOpenAI(system, msgs);
      lastText = res.text || lastText;
      if (!res.calls.length) return { text: lastText, created, steps: step + 1 };

      const results = [];
      for (const call of res.calls) {
        const output = await this.executeTool(call, onStatus);
        if (call.toolName === 'create_app') created.push(output);
        results.push({ id: call.id, output });
      }
      msgs = anthropic
        ? [...msgs, { role: 'assistant', content: res.raw },
           { role: 'user', content: results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.output).slice(0, 4000) })) }]
        : [...msgs, res.raw,
           ...results.map(r => ({ role: 'tool', tool_call_id: r.id, content: JSON.stringify(r.output).slice(0, 4000) }))];
    }
    return { text: lastText, created, steps: this.MAX_STEPS };
  },

  async stepOpenAI(system, msgs) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + Gen.key },
      body: JSON.stringify({
        model: Gen.model, max_completion_tokens: 16000,
        messages: [{ role: 'system', content: system }, ...msgs],
        tools: TOOL_SCHEMAS.map(t => ({ type: 'function', function: t })),
        // Required, not optional: gpt-5.6 refuses function tools on
        // /v1/chat/completions unless reasoning is off — "use /v1/responses or
        // set reasoning_effort to 'none'". The Codex path goes through the
        // Responses API and keeps its reasoning; this one trades it for tools,
        // which is the better half of that trade for an agent that mostly acts.
        reasoning_effort: 'none',
      }),
    });
    const j = await jsonOf(r, 'openai');
    if (!r.ok) throw new Error(j.error?.message || ('openai returned ' + r.status));
    const choice = j.choices?.[0] || {};
    const m = choice.message || {};
    // A reply cut at the token limit used to arrive here as a tool call whose
    // arguments were half a JSON object; the parse failed silently to {} and
    // create_app then wrote an empty module that failed at import with
    // "Unexpected end of input" — a window with an error in it and nothing
    // to say why. The cause has a name; say it.
    if (choice.finish_reason === 'length') throw new Error(CUT_OFF);
    return {
      text: m.content || '',
      raw: m,
      calls: (m.tool_calls || []).map(c => {
        let input;
        try { input = JSON.parse(c.function.arguments || '{}'); }
        catch (e) { throw new Error(`the model's ${c.function.name} call carried arguments that are not JSON (${e.message})`); }
        return { id: c.id, toolName: c.function.name, input };
      }),
    };
  },

  async stepAnthropic(system, msgs) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': Gen.key,
                 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: Gen.model, max_tokens: 16000, system, messages: msgs,
        tools: TOOL_SCHEMAS.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      }),
    });
    const j = await jsonOf(r, 'anthropic');
    if (!r.ok) throw new Error(j.error?.message || ('anthropic returned ' + r.status));
    if (j.stop_reason === 'max_tokens') throw new Error(CUT_OFF);
    const blocks = j.content || [];
    return {
      text: blocks.filter(b => b.type === 'text').map(b => b.text).join('').trim(),
      raw: blocks,
      calls: blocks.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, toolName: b.name, input: b.input || {} })),
    };
  },

  async executeTool(call, onStatus) {
    const { toolName, input } = call;
    if (toolName === 'create_app') {
      const title = input.title || 'app';
      const source = input.source || '';
      onStatus?.(`creating “${title}”`);
      const target = parseTarget(source);
      if (target === 'vm') {
        const file = parseFile(source) || 'script.sh';
        let installed = false;
        if (VM.state === 'ready') {
          try { await VM.writeText(file, source); installed = true; } catch {}
        }
        return { ok: true, kind: 'vm', title, file: '/mnt/' + file, installed, source };
      }
      const requires = parseRequires(source);
      const lint = lintApp(`${title} ${parseTitle(source) || ''}`, requires, source);
      if (lint) {
        track('lint_reject', { rule: lint.rule });
        return { ok: false, kind: 'window', title, error: lint.error };
      }
      // A module that does not parse would be saved to the dock, launched, and
      // die at import inside its own window. Refuse it here with the parser's
      // message so the model fixes the source instead of the person reading
      // "Unexpected end of input" in a Terminal that never existed.
      const syntax = moduleParseError(source);
      if (syntax) {
        track('lint_reject', { rule: 'syntax' });
        return { ok: false, kind: 'window', title, error: 'the module does not parse: ' + syntax };
      }
      const saved = await Apps.save(title, source).catch(e => ({ error: e.message }));
      if (saved.error) return { ok: false, kind: 'window', title, error: 'the app was not saved: ' + saved.error };
      paintDock();
      // Launch what was written, not what was passed: they differ when the
      // header had to be added, and the window must match the file.
      const written = saved.source || source;
      launchApp({ title, name: saved.file, source: written, requires: parseRequires(written) });
      const { source: _written, ...report } = saved;
      // The dock shows the header's title, not input.title: they differ
      // when the source carried its own // @title line.
      return { ok: true, kind: 'window', title, dockTitle: parseTitle(written), file: 'apps/' + saved.file, saved: report,
               ...(saved.headerAdded?.length ? { note: `the source had no ${saved.headerAdded.map(t => '// @' + t).join(', ')} line; it was prepended so the file is a dock app and not unlisted` } : {}) };
    }
    if (toolName === 'vm_exec') {
      onStatus?.('running in vm…');
      if (VM.state !== 'ready') {
        // The model's other move when the machine is booting is to call
        // vm_exec in a loop until it answers. Say how long it has been and
        // that a shell app opens itself when the machine is up.
        const since = VM.bootStarted ? ` (${Math.round((Date.now() - VM.bootStarted) / 1000)}s)` : '';
        return { ok: false, error: `the machine is ${VM.state}${since}. Do not poll it: build the app with // @requires shell and it opens itself when ready.` };
      }
      const s = input.timeout_s;
      if (s !== undefined && !(Number.isInteger(s) && s >= 1 && s <= 600)) {
        return { ok: false, error: `timeout_s must be an integer from 1 to 600, got ${JSON.stringify(s)}` };
      }
      // A timeout is the model's to act on, not the loop's to die of: it comes
      // back as a tool error that names the fix.
      try {
        const output = await VM.exec(input.command, s && s * 1000);
        return { ok: true, output: output || '' };
      } catch (e) {
        return { ok: false, error: e.message + (/timed out/.test(e.message)
          ? '. For an install or a build pass timeout_s (up to 600), or background it: cmd > /mnt/job.log 2>&1 & then tail the log.' : '') };
      }
    }
    if (toolName === 'set_theme') {
      onStatus?.('restyling the desktop…');
      try {
        const applied = Theme.set(input.theme, input.tokens);
        track('set_theme', { to: applied.theme });
        return { ok: true, ...applied, note: 'The desktop is restyled. Open apps using var(--token) followed automatically.' };
      } catch (e) {
        return { ok: false, error: e.message, available: Object.keys(VibeOSSkills.THEMES) };
      }
    }
    if (toolName === 'web_fetch') {
      const url = String(input.url || '');
      onStatus?.('reading ' + WebTools.hostOf(url) + '…');
      track('web_fetch');
      return WebTools.fetchPage(url);
    }
    if (toolName === 'web_search') {
      onStatus?.('searching the web…');
      track('web_search');
      return WebTools.search(String(input.query || ''));
    }
    if (toolName === 'list_themes') {
      const themes = Object.values(VibeOSSkills.THEMES).map(t => ({ id: t.id, title: t.title, summary: t.summary, tokens: Object.keys(t.tokens) }));
      return { ok: true, themes, current: { theme: Theme.id, custom: Theme.custom, effective: Theme.tokens() },
               note: 'set_theme takes a theme id, tokens (any name listed, a plain colour or length value), or both' };
    }
    if (toolName === 'read_desktop') {
      onStatus?.('reading the desktop…');
      try { return await Desktop.read(input); }
      catch (e) { return { ok: false, error: e.message }; }
    }
    if (toolName === 'list_files') {
      onStatus?.('listing ' + (input.path || 'the workspace') + '…');
      try {
        const rel = Files.norm(input.path);
        const entries = await Files.entries(rel);
        return { ok: true, path: rel, entries, ...(rel === '' ? { note: 'apps/ holds the dock apps (a .js with a // @title header), data/ what the machine sees at /mnt, system/ the OS; list system/kernel or system/ui for the files that boot' } : {}) };
      } catch (e) { return { ok: false, error: e.message }; }
    }
    if (toolName === 'list_apps') {
      onStatus?.('listing apps…');
      const { apps, unlisted } = await Apps.list();
      // Built-ins listed too, marked. Without this the agent had no way to
      // know the Browser existed, and answered "add a Back button to the
      // browser" by editing the nearest app it could see. Unlisted files are
      // reported with their reason so "why is X not in the dock" has an
      // answer, and edit_file can add the header if the user wants it there.
      return { ok: true, apps: apps.map(a => ({ title: a.title, name: a.name, builtin: false })), unlisted, builtin: BUILTIN_APPS(), mount: MOUNT_MAPPING, unmirrored: Sync.unmirrored() };
    }
    if (toolName === 'read_file') {
      onStatus?.('reading ' + input.path + '…');
      try {
        Files.refusePrivate(input.path);
        let text;
        try { text = await Workspace.readPath(input.path); }
        catch (e) {
          // A miss names what exists, like list_files and search_file do: the
          // feedback that asked for this named read_file first.
          if (/^not found:/.test(e.message)) throw new Error(await Files.missing(input.path));
          throw e;
        }
        const lines = text.split('\n');
        const from = Math.max(1, input.from || 1), to = Math.min(lines.length, input.to || lines.length);
        const slice = lines.slice(from - 1, to).map((l, i) => `${from + i}: ${l}`).join('\n');
        return { ok: true, path: input.path, lines: lines.length, from, to, text: slice.slice(0, 60000), truncated: slice.length > 60000 };
      } catch (e) { return { ok: false, error: e.message }; }
    }
    if (toolName === 'search_file') {
      onStatus?.('searching ' + input.path + '…');
      try { return await Files.search(input.path, input.pattern); }
      catch (e) { return { ok: false, error: e.message }; }
    }
    if (toolName === 'edit_file') {
      onStatus?.('editing ' + input.path + '…');
      // Two edits of one file at once (the chat and a remote agent) are read →
      // replace → write each; unserialized, both matched their anchor on the
      // same text and the second write erased the first with ok:true.
      return Workspace.exclusive(input.path, async () => {
      try {
        const text = await Workspace.readPath(input.path);
        const old = String(input.old ?? '');
        const n = text.split(old).length - 1;
        if (n === 0) {
          // read_file numbers every line as "12: "; pasted back verbatim, the
          // anchor can never match. Two numbered lines is the read_file shape;
          // one could be data. Only checked when the text is not found, so a
          // file that really contains "1: a" stays editable.
          if ((old.match(/^\d+: /gm) || []).length >= 2) {
            return { ok: false, error: 'old contains read_file line-number prefixes ("12: ") — strip them, they are not in the file' };
          }
          return { ok: false, error: 'old text not found in ' + input.path + ' — read or search the file and copy it exactly' };
        }
        if (n > 1) return { ok: false, error: `old text occurs ${n} times in ${input.path}; include more context so it is unique` };
        const next = text.replace(old, () => input.new);
        const err = systemSyntaxError(input.path, next);
        if (err) return { ok: false, error: 'not saved: that edit makes ' + input.path + ' unparsable — ' + err + ' (a parse-clean edit can still fail at load; recovery covers that)' };
        await Workspace.writePath(input.path, next);
        track('edit_file', { os: /^system\//.test(input.path) });
        return { ok: true, path: input.path, note: applyNote(input.path) };
      } catch (e) { return { ok: false, error: e.message }; }
      });
    }
    if (toolName === 'write_file') {
      onStatus?.('writing ' + input.path + '…');
      try { await Workspace.writePath(input.path, String(input.content ?? '')); return { ok: true, path: input.path }; }
      catch (e) { return { ok: false, error: e.message }; }
    }
    if (toolName === 'reload_ui') {
      if (!Workspace.open) return { ok: false, error: 'no workspace is open' };
      const forked = await Workspace.forkedSystem('ui/');
      if (!forked.length) return { ok: false, error: 'nothing to reload: no system/ui/*.js has been edited (a system/kernel or os.css edit needs reload_os)' };
      onStatus?.('reloading the ui…');
      const r = await UI.reload();
      // Said in the chat by the kernel, not only in the tool result: the
      // model's next words may not repeat an error, and the person should
      // see that the ui they are looking at is still the old one.
      if (!r.ok) { track('reload_ui_refused'); Chat.line('reload_ui refused: ' + r.error, true); return r; }
      track('reload_ui', { ms: r.ms, repainted: r.repainted });
      Chat.line(`ui reloaded in ${r.ms} ms: ${forked.join(', ')} · ${r.repainted} window${r.repainted === 1 ? '' : 's'} repainted`);
      return { ok: true, ...r, files: forked, note: 'the ui was replaced in place: the machine, the workspace, the chat and this turn are untouched; no reload_os needed' };
    }
    if (toolName === 'reload_os') {
      if (!Workspace.open) return { ok: false, error: 'no workspace is open' };
      const forked = await Workspace.forkedSystem();
      if (!forked.length) return { ok: false, error: 'nothing to reload: no system/kernel/*.js, system/ui/*.js or system/os.css has been edited' };
      const note = String(input.note ?? '').trim();
      try { localStorage.setItem(RELOAD_NOTE, JSON.stringify({ note, files: forked, at: Date.now() })); } catch {}
      onStatus?.('reloading the desktop…');
      window.__vibeosIntentionalUnload = true;   // our own reload must not trip the leave-page guard
      const pairing = RemoteBridge.keepAcrossReload();
      setTimeout(() => location.reload(), 400);
      return { ok: true, note: 'reloading ' + forked.join(' and ') + ' — this turn ends here; the chat shows your note after boot' + (pairing ? '; the vibeos-mcp pairing resumes after boot, so call again once the page is back' : ''), reloading: forked, pairing: pairing ? 'kept' : 'none' };
    }
    throw new Error('unknown tool: ' + toolName);
  },

  async run(prompt, history, onStatus, images) {
    // Sent as messages from the first step, not {prompt, history}: the server
    // builds the same array from those two, but only a string prompt fits
    // through them, and an image needs the SDK's content-part shape.
    // The picture lives in this turn only — history carries a marker — but it
    // does ride along on every tool step of this run: the API is stateless, and
    // a model that called list_files first still has to see the screenshot to
    // build what it shows. Attachments caps what one turn can carry, so five
    // steps of it stay under the body limit.
    let messages = [
      ...historyWindow(history).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: this.userContent('sdk', prompt, images) },
    ];
    const created = [];
    let lastText = '';

    for (let step = 0; step < this.MAX_STEPS; step++) {
      const body = Object.assign({ image: VM.bootedImage || VM.image, theme: Theme.id, messages },
        Gen.codexModel ? { model: Gen.codexModel } : {});
      const j = await this.callServer(body);
      lastText = j.text || '';

      if (!j.toolCalls || !j.toolCalls.length) {
        return { text: lastText, created, steps: step + 1 };
      }

      const toolResults = [];
      for (const call of j.toolCalls) {
        const output = await this.executeTool(call, onStatus);
        if (call.toolName === 'create_app') created.push(output);
        toolResults.push({
          type: 'tool-result',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { type: 'json', value: output },
        });
      }

      if (j.finishReason !== 'tool-calls') {
        return { text: lastText, created, steps: step + 1 };
      }

      messages = [...messages, ...(j.responseMessages || []), { role: 'tool', content: toolResults }];
    }

    return { text: lastText, created, steps: this.MAX_STEPS };
  },
};

/* Stock modules. In native mode the binary holds the key and writes these
   with a model; a published page can reach no model, so these stand in and
   say so. The execution and save path is identical either way. */
const CANNED = {
  clock: `// @title Clock
// @requires none
export default function (mount) {
  mount.innerHTML = '<div style="width:100%;height:100%;box-sizing:border-box;display:grid;place-items:center;font:600 36px ui-monospace,monospace"></div>';
  const el = mount.firstChild;
  const t = () => el.textContent = new Date().toLocaleTimeString();
  t(); setInterval(t, 1000);
}`,
  notes: `// @title Notes
// @requires none
export default function (mount) {
  mount.innerHTML = '<textarea style="width:100%;height:100%;box-sizing:border-box;background:var(--panel2);color:var(--titletext);border:0;border-radius:0;padding:10px;font:13px ui-monospace,monospace;resize:none" placeholder="type; saved in this browser"></textarea>';
  const ta = mount.firstChild;
  ta.value = localStorage.getItem('vibeos-note') || '';
  ta.oninput = () => localStorage.setItem('vibeos-note', ta.value);
}`,
  counter: `// @title Counter
// @requires none
export default function (mount) {
  let n = 0;
  mount.innerHTML = '<div style="width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px"><b style="font-size:40px">0</b><button style="padding:8px 18px;border-radius:var(--radius-ctl);border:1px solid var(--line2);background:var(--btn);color:var(--btntext);cursor:pointer">increment</button></div>';
  const b = mount.querySelector('b');
  mount.querySelector('button').onclick = () => b.textContent = ++n;
}`,
  files: `// @title Folder listing
// @requires files
export default async function (mount, api) {
  mount.innerHTML = '<div style="width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;padding:8px"><p style="color:var(--dim);font-size:13px;margin:0 0 6px">Reading your workspace…</p><div class="app-scroll" style="flex:1"></div></div>';
  const list = mount.querySelector('.app-scroll');
  try {
    const items = await api.list();
    mount.firstChild.firstChild.textContent = items.length + ' items';
    list.innerHTML = '';
    items.slice(0,200).forEach(i => {
      const d = document.createElement('div');
      d.style.cssText = 'padding:3px 0;font-size:13px';
      d.textContent = (i.dir ? '📁 ' : '📄 ') + i.name;
      list.appendChild(d);
    });
  } catch (e) { mount.textContent = ''; const m = document.createElement('p'); m.style.cssText = 'color:var(--no);font-size:13px;padding:8px'; m.textContent = e.message; mount.appendChild(m); }
}`,
  shell: `// @title Terminal
// @requires shell
export default async function (mount, api) {
  mount.innerHTML = '<pre style="width:100%;height:100%;box-sizing:border-box;margin:0;padding:8px;font-size:12px;white-space:pre-wrap;overflow:auto;scrollbar-width:thin"></pre>';
  mount.firstChild.textContent = await api.shell('uname -a && ls ~');
}`,
};

function pickCanned(p) {
  p = p.toLowerCase();
  if (/shell|terminal|command|bash/.test(p))       return 'shell';
  if (/file|folder|browse|directory|disk/.test(p)) return 'files';
  if (/note|text|write|scratch|memo/.test(p))      return 'notes';
  if (/count|click|tally|increment/.test(p))       return 'counter';
  return 'clock';
}

/* ---------- the conversation, held by the kernel -----------------------

   The chat window paints; this owns the turns. A turn used to live in
   ChatApp's closure — its bubbles, its history, the loop it was waiting on —
   so replacing the chat window meant losing the turn in flight. Now a turn
   is Chat.send(): it appends to the log, runs the agent, records the cards
   and the reply, and announces each step to whoever is listening. A chat
   window subscribes with Chat.on and paints from Chat.turns; a reload_ui
   in the middle of a turn retires the old window, the new one paints the
   same turns with the same 'thinking…' at the end, and the reply lands in
   it when the loop returns. The log on disk (ChatLog) is unchanged: a card's
   `source` and a user turn's `shots` are in-memory only (`src`, `shots`), dropped on save.
   -------------------------------------------------------------------- */

const Chat = {
  turns: [],        // the log, as system/chat.json holds it, plus in-memory extras
  history: [],      // what the model is sent: the text of each turn
  pending: [],      // pictures attached and not yet sent
  running: null,    // { me, reply, status } while a turn is in flight
  restored: 0,      // how many turns the load restored; the chat says so after them
  loadError: '',    // why the log could not be read
  note: null,       // a reload note with no turn to land in
  notes: [],        // { at, text, error }: transient lines, kept so a repaint shows them
  offer: null,      // { text, reply }: the "Add a key" offer after a stock module
  ready: false,     // the log has been read (or failed to be)
  loaded: null,
  listeners: new Set(),

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  // A listener that throws is a broken window, not a broken turn: the turn
  // goes on and the error is on the console.
  emit(type, data) { this.listeners.forEach(fn => { try { fn(type, data); } catch (e) { console.error('chat listener failed on ' + type + ':', e); } }); },

  // A line that lands while a turn runs belongs to that turn: it is painted
  // before the reply, where it happened, not after it.
  line(text, error = false) {
    this.notes.push({ at: this.running ? this.turns.length - 1 : this.turns.length, text, error });
    this.emit('line', { text, error });
  },

  load() {
    if (!this.loaded) this.loaded = this.read();
    return this.loaded;
  },
  // The confirmation for a reload_os. Cleared on read so reopening the chat
  // does not repeat it; what booted comes from the loader, not the note.
  // It is the model's reply to the turn that called reload_os — that turn's
  // entry is still open in the log, so the note lands there and is history
  // the next request carries, not a line that vanishes on the boot after.
  reloadNote() {
    try {
      const raw = localStorage.getItem(RELOAD_NOTE);
      if (!raw) return null;
      localStorage.removeItem(RELOAD_NOTE);
      const { note, files } = JSON.parse(raw);
      return { note, files, source: window.__vibeosBoot && window.__vibeosBoot.source };
    } catch { return null; }
  },
  async read() {
    let restored = null;
    try { restored = await ChatLog.load(); }
    catch (e) { this.loadError = 'could not restore ' + ChatLog.PATH + ': ' + e.message; }
    const note = this.reloadNote();
    if (restored) this.turns = restored;
    if (restored && restored.length) {
      const last = restored[restored.length - 1];
      if (note && last && last.role === 'assistant' && !last.text) {
        last.text = 'reloaded ' + (note.files || []).join(', ') + (note.note ? ' — ' + note.note : '');
        last.reload = note;
      }
      for (const t of this.turns) {
        const content = ChatLog.content(t);
        if (t.role === 'user') { if (content) this.history.push({ role: 'user', content }); }
        else if (this.history.length && this.history[this.history.length - 1].role === 'user') this.history.push({ role: 'assistant', content: content || '(the page was closed before this turn finished)' });
      }
      this.restored = this.turns.length;
      this.ready = true;
      if (note && last && last.reload === note) { await this.persist(); this.emit('loaded'); return; }
    }
    this.ready = true;
    if (note) this.note = note;
    this.emit('loaded');
  },

  saidUnsaved: false,
  persist() {
    return ChatLog.save(this.turns).then(saved => {
      if (saved || this.saidUnsaved) return;
      this.saidUnsaved = true;
      this.line('chat is not being saved: no workspace mounted');
    }, e => this.line('could not save ' + ChatLog.PATH + ': ' + e.message, true));
  },

  card(data) {
    if (!this.running) throw new Error('a card with no turn running: ' + JSON.stringify(data).slice(0, 80));
    this.running.reply.cards.push(data);
    this.persist();
    this.emit('card', { reply: this.running.reply, card: data });
  },

  async attach(files) {
    for (const f of files) {
      try {
        const img = await Attachments.prepare(f);
        Attachments.check([...this.pending, img]);
        this.pending.push(img);
      } catch (e) { this.line(e.message, true); }
    }
    this.emit('chips');
  },
  detach(i) { this.pending.splice(i, 1); this.emit('chips'); },

  async send(text) {
    text = String(text || '').trim();
    if (!text && !this.pending.length) return;
    // Pictures put back after a failure can stack past the cap; refuse here
    // rather than let the body grow past what the server will take.
    try { Attachments.check(this.pending); }
    catch (e) { this.line(e.message, true); return; }
    if (this.running) { this.line('a turn is still running; wait for its reply before sending another', true); return; }
    const images = this.pending.splice(0);
    this.emit('chips');
    // A send before the log is read used to write this pair over the whole
    // history, then paint the history under it. The read is awaited before
    // anything is painted or written; a log that could not be read was
    // already reported, and is overwritten.
    await this.load();
    let live = false, failure = '';
    // What came before this turn. The turn itself used to be pushed first and
    // then sent again as the prompt, so every request carried the user's text
    // twice — harmless for text, but with an image it would put a
    // marker right before the actual image.
    const prior = this.history.slice();
    // The turn is recorded once its fate is known. History stays text: the
    // picture is sent once, and a marker keeps the turn small enough for six
    // of them to ride along with every request — but only a picture the model
    // actually saw gets one. A turn that never reached a model is remembered
    // as its text alone, and an image-only one leaves nothing to remember.
    // The pair goes to the log now, reply still blank: a turn that ends in
    // reload_os never reaches `remember`, and the boot after fills the blank
    // with the reload note.
    const me = { role: 'user', text, images: images.length, shots: images.map(i => i.dataUrl) };
    const reply = { role: 'assistant', text: '', cards: [] };
    this.turns.push(me, reply);
    this.running = { me, reply, status: 'thinking…' };
    this.offer = null;
    this.persist();
    this.emit('turn', { me, reply });
    const onStatus = status => {
      if (!this.running || this.running.reply !== reply) return;
      this.running.status = String(status);
      this.emit('status', { text: this.running.status });
    };
    const remember = (sent, said) => {
      me.images = sent ? images.length : 0;
      reply.text = said.slice(0, 1200);
      if (failure) reply.failure = failure;
      this.persist();
      // An image-only turn has no text to lead with; do not remember a bare newline.
      const turn = ChatLog.content(me);
      if (!turn) return;
      this.history.push({ role: 'user', content: turn }, { role: 'assistant', content: reply.text });
    };
    // A picture that did not go through returns to the chip row, so the next
    // try — "Add a key", or just pressing Send again — carries it. Before this
    // the chips were cleared before the request, and the retry sent text that
    // talked about a screenshot it no longer had.
    const giveBack = () => { this.pending.unshift(...images); this.emit('chips'); };
    const finish = () => { this.running = null; this.emit('done', { reply, failure }); };

    // Both paths are the agent now. Signing in with ChatGPT proxies through
    // vibeos.sh; a pasted key talks to the provider from this page. Same
    // tools, same prompt, same loop.
    if (Gen.available && (Gen.oauth || Gen.key)) {
      try {
        const result = Gen.oauth
          ? await Gen.generate(text, prior, onStatus, images)
          : await Agent.runWithKey(text, prior, onStatus, images);
        live = true;
        // What history remembers of the turn: the reply, else what was
        // built. A refused create_app built nothing, so a turn that only
        // refused is remembered as the refusal, never as the title alone.
        const built = result.created.filter(c => c.ok !== false).map(c => c.title).join(', ');
        const refused = result.created.filter(c => c.ok === false).map(c => `refused: ${c.title}: ${c.error}`).join('; ');
        const summary = result.text || built || refused || 'done';
        if (result.text) reply.said = result.text;
        remember(true, summary);
        for (const item of result.created) {
          if (item.ok === false) {
            this.card({ kind: 'refused', title: String(item.title), error: String(item.error) });
          } else if (item.kind === 'vm') {
            track('app_generated', { target: 'vm' });
            this.card({ kind: 'vm', title: item.title, file: item.file, installed: item.installed, src: item.source,
                        where: item.installed ? 'installed at /mnt/' + item.file : 'not installed — the VM was not running' });
          } else {
            track('app_generated', { target: 'browser' });
            const where = [item.saved && item.saved.vm && 'the VM', item.saved && item.saved.folder && Workspace.label].filter(Boolean).join(' and ');
            const headed = item.saved && item.saved.headerAdded && item.saved.headerAdded.length ? ' (header added)' : '';
            this.card({ kind: 'window', title: item.title, where: where ? 'saved to ' + where + headed : 'opened on the desktop' });
          }
        }
        finish();
      } catch (e) {
        failure = e.message;
        giveBack();
        const source = CANNED[pickCanned(text)];
        remember(false, source);
        await this.openFromSource(source, text, false, failure);
        finish();
      }
      return;
    }

    let source;
    try {
      if (!Gen.available) throw new Error('no model configured');
      source = await Gen.generate(text, prior, undefined, images); live = true;
    } catch (e) {
      failure = e.message;
      giveBack();
      source = CANNED[pickCanned(text)];
    }
    remember(live, source);
    await this.openFromSource(source, text, live, failure);
    // Offer the key HERE rather than only at boot. Asking on load happens
    // before anyone knows what a key is for; this is the moment someone has
    // just demonstrated they want the thing it unlocks. Measured: 45 people
    // asked the agent with no key on the same day only 12 added one, and
    // the two groups barely overlapped.
    if (!live && failure === 'no model configured') this.offer = { text, reply };
    finish();
  },

  // Retry the same request, now for real. The pictures are already back in
  // the chip row (giveBack), so they go with it this time.
  async retryWithKey() {
    const offer = this.offer;
    if (!offer) throw new Error('nothing to retry');
    track('key_offer_click');
    await Gen.askForKey();
    if (!Gen.available) return;
    track('key_offer_added');
    this.offer = null;
    this.emit('offer');
    await this.send(offer.text);
  },

  async openFromSource(source, text, live, failure) {
    const target = parseTarget(source);
    const title = parseTitle(source) || text.slice(0, 30);
    if (live) track('app_generated', { target });
    else if (failure === 'no model configured') track('app_stock', { target });
    else {
      track('gen_failed', { target, error: String(failure).slice(0, 80) });
      // Vercel's analytics API exposes event counts but not event properties,
      // so the error above is unreadable from outside the dashboard. A coarse
      // bucket as its own event name is countable: 9 failures in a day could
      // be one expired key or a broken deploy, and those need different fixes.
      const msg = String(failure).toLowerCase();
      const bucket = /api key|unauthorized|401|invalid_api_key|authentication/.test(msg) ? 'auth'
        : /timed out|timeout|failed to fetch|network|econn/.test(msg) ? 'network'
        : /not supported|model|400|bad request/.test(msg) ? 'model'
        : /429|rate limit|quota|insufficient/.test(msg) ? 'quota'
        : 'other';
      track('gen_failed_' + bucket, { target });
    }

    if (target === 'vm') {
      const file = parseFile(source) || 'script.sh';
      let installed = false;
      if (VM.state === 'ready') {
        try { await VM.writeText(file, source); installed = true; } catch {}
      }
      this.card({ kind: 'vm', title, file, installed, src: source, where: installed ? 'installed at /mnt/' + file : 'not installed — the VM was not running' });
    } else {
      const saved = await Apps.save(title, source).catch(() => ({}));
      paintDock();
      const written = saved.source || source;
      const where = [saved.vm && 'the VM', saved.folder && Workspace.label].filter(Boolean).join(' and ');
      const headed = saved.headerAdded && saved.headerAdded.length ? ' (header added)' : '';
      launchApp({ title, source: written, requires: parseRequires(written) });
      this.card({ kind: 'window', title, src: written, where: where ? 'saved to ' + where + headed : 'not saved — no VM and no workspace' });
    }
  },
};
