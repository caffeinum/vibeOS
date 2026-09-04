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
          <h2 id="keyModalTitle">vibeOS needs AI features to work.</h2>
          <p class="small dimmer" id="keyModalSubtitle" style="margin:0">Sign in with your OpenAI account, or bring your own key.</p>
          <div class="key-modal-actions col">
            <div class="col" id="keyModalStep1">
              <button type="button" class="btn p" id="keyLoginBtn">Login with OpenAI</button>
              <div id="keyOAuthSlot"></div>
              <p class="note oauth-error" id="keyOAuthError" hidden style="margin:0;color:var(--no)"></p>
              <button type="button" class="btn" id="keyPasteBtn">Paste API key (OpenAI / Anthropic)</button>
              <div class="col" id="keyPasteForm" hidden>
                <input type="password" id="keyInput" placeholder="sk-... or sk-ant-..." autocomplete="off" spellcheck="false">
                <p class="tiny dimmer" style="margin:0">Stored only in this browser, sent straight to the provider — never to vibeos.sh.</p>
                <button type="button" class="btn p sm" id="keySaveBtn">Save</button>
              </div>
              <button type="button" class="btn" id="keyOtherBtn">Other options</button>
            </div>
            <div class="col" id="keyModalStep2" hidden>
              <button type="button" class="btn sm skip" id="keyBackBtn">← Back</button>
              <button type="button" class="btn" id="keyCreateBtn">Create account</button>
              <p class="note" id="keyCreateNote" hidden style="margin:0">
                Coming soon! <a href="/get-access">Subscribe to waitlist</a> to know it first.
              </p>
              <button type="button" class="btn sm skip" id="keySkipBtn">Continue without AI features</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const finish = () => {
        document.removeEventListener('keydown', onKey);
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
        overlay.querySelector('#keyModalSubtitle').textContent =
          'Sign in with your OpenAI account, or bring your own key.';
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

  async probe() {
    // A local server holding a key takes precedence; otherwise BYO key.
    try {
      const r = await fetch('/api/health', { headers: { 'ngrok-skip-browser-warning': '1' } });
      if (r.ok) {
        const j = await r.json();
        if (j.keyed) { this.viaServer = true; this.model = j.model; this.available = true; return true; }
      }
    } catch {}
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
          throw new Error('unknown theme token: ' + key + hint);
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

const PASTE_KEY_SYSTEM_PROMPT = `You build things for vibeOS, a small desktop OS. Reply with SOURCE ONLY - no markdown fences, no commentary.

TARGET 1, a desktop window (default). Header exactly:
// @title <Short Name>
// @target browser
// @requires <space-separated caps, or none>
Caps: files (read the workspace), shell (run commands in the VM). Use none unless needed.
Then: export default function (mount, api) { ... }
mount is a fixed-size pane (~430x320px, resizable). api.list() -> [{name,dir}] (needs files). api.onResize((w,h) => ...) when layout depends on size.
api.shell(cmd, timeoutMs = 600000) -> Promise<string> (needs shell): waits up to ten minutes by default, because what an app runs is what a person typed into it — an apk add, a git clone — and the built-in Terminal's Ctrl-C frees the line. stdout and stderr together, ANSI stripped; rejects on timeout or while the machine is not running. It is ONE shell session shared by every app and the agent, so a cd leaks into everyone else's commands: never cd, use absolute paths. No stdin and no tty: vi, top, less, an interactive zsh hang until interrupted. List a directory with ls -1p. Pass a shorter timeoutMs for a quick status line you would rather see fail than wait on; a long build can go to the background, cmd > /mnt/job.log 2>&1 &, followed with api.shell("tail -n 20 /mnt/job.log").

Layout rules (required): root width/height 100%, box-sizing:border-box, display:flex, flex-direction:column, overflow:hidden on mount. No document scroll, no min-height exceeding the window. Modest type and padding; empty states must fit. Scroll inner panes only (overflow:auto, scrollbar-width:thin), never mount.

Plain JavaScript only, no JSX, no imports, no external URLs. Under 60 lines and it must work.

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

const GUEST_TOOLS = new Set(['create_app', 'vm_exec', 'list_apps', 'set_theme', 'read_file', 'search_file', 'edit_file', 'write_file', 'reload_ui', 'reload_os', 'web_fetch', 'web_search']);

// What the agent is told about the shell's own apps. They are functions in
// os.js, so "change the Browser" is an edit to system/os.js — not a request.
// One sentence, said wherever the agent or the person looks at /mnt, so a
// directory made in the guest is not discovered missing from the folder later.
const MOUNT_MAPPING = '/mnt is the workspace, flat: /mnt/<name> is data/<name> and /mnt/<name>.js is apps/<name>.js; system/ is not in /mnt and subdirectories under /mnt are not mirrored, nor are symlinks or special files — only regular files at the root of /mnt (the rest is listed under unmirrored).';
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
const TOOL_SCHEMAS = [
  { name: 'create_app', description: 'Create a vibeOS desktop window app or install a VM script. Pass complete source with the // @title, // @target and // @requires headers.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, source: { type: 'string' } }, required: ['title', 'source'] } },
  { name: 'vm_exec', description: 'Run a shell command in the vibeOS Linux VM and return its output (stdout and stderr, ANSI stripped). Waits 20 s by default; pass timeout_s (up to 600) for an install or a build, or background it (cmd > /mnt/job.log 2>&1 &) and tail the log.',
    parameters: { type: 'object', properties: { command: { type: 'string' }, timeout_s: { type: 'integer', minimum: 1, maximum: 600, description: 'Seconds to wait before the command is interrupted with Ctrl-C and the call fails. Default 20.' } }, required: ['command'] } },
  { name: 'list_apps', description: 'List apps already saved in the vibeOS workspace. .js files without a // @title header are not apps and come back under unlisted with the reason; add the header with edit_file if the user wants one in the dock. The reply also carries the /mnt mapping: the mount is flat and subdirectories under /mnt are not mirrored, and unmirrored names the root entries the mirror skipped (directories, symlinks, special files).',
    parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'set_theme', description: 'Restyle the desktop itself: a theme id, or individual colour tokens.',
    parameters: { type: 'object', properties: { theme: { type: 'string', enum: ['vibeos-dark', 'vibeos-light', 'win95'] },
                  tokens: { type: 'object', additionalProperties: { type: 'string' } } }, required: [] } },
  { name: 'read_file', description: 'Read a file from the workspace. The operating system is system/kernel/*.js (the machine, workspace, agent loop; reload_os) and system/ui/*.js (windows, dock, chat, Browser, Settings; reload_ui), styled by system/os.css. Optional line range for big files.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, from: { type: 'integer' }, to: { type: 'integer' } }, required: ['path'] } },
  { name: 'search_file', description: 'Find lines in a workspace file matching a regex; returns line numbers and text. Use before edit_file on a system/ file.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, pattern: { type: 'string' } }, required: ['path', 'pattern'] } },
  { name: 'edit_file', description: 'Replace one exact occurrence of old with new in a workspace file. The first edit of a system/ file forks it from the served copy; from then on yours boots. Call reload_ui to apply a system/ui edit live, reload_os for system/kernel or system/os.css.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
  { name: 'write_file', description: 'Write a whole workspace file (apps/*.js, data/*, system/kernel/*.js, system/ui/*.js, system/os.css). Prefer edit_file for changes.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'reload_ui', description: 'Re-import the ui — system/ui/*.js — under the running kernel, live: the machine, the workspace, the chat log and this turn all stay, open windows are repainted by the new ui, and the turn goes on, so say what changed after it. A ui that does not parse, fails to import or throws while painting is refused with the error and the previous ui keeps running. Refuses when no system/ui file has been edited.',
    parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'reload_os', description: 'Reload the page so edits to system/kernel/*.js or system/os.css take effect (a system/ui edit needs only reload_ui). The reload ends this turn — nothing you say after it reaches the user — so make every edit first, call it once, last, and pass a note: it is shown in the chat after boot. Refuses when nothing has been edited. If the edited OS fails to boot, the stock one runs next time and says so — you cannot lock yourself out. Through vibeos-mcp the reload ends the pairing as well: the token dies with the page, the package is told it was revoked, and driving the desktop again needs a new token from Settings > Capabilities.',
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
   packages/vibeos-mcp/README.md; the relay reads none of it but the hello.

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

// The relay's one post-hello frame, byte for byte (lib/mcp-relay.ts REVOKE_FRAME).
const MCP_REVOKE_FRAME = '{"revoke":true}';
const MCP_TOKEN_RE = /^[0-9a-f]{64}$/;

// A WebSocket that redials in place, the shape of RelaySocket without the
// WISP stream bookkeeping: the relay is a serverless function that ends at
// its maxDuration (800 s), so a healthy socket closes every ~13 minutes and
// the hello has to be the first frame on every dial. Frames sent in a gap are
// held and flushed. Five failed dials, or a close the relay means (4001
// replaced, 4003 revoked), end it; the bridge says which.
class RemoteSocket {
  static delays = [500, 1000, 2000, 2000, 2000];

  constructor(url, { hello, onOpen, onFrame, onGap, onEnd }) {
    this.url = url;
    this.hello = hello;
    this.onOpen = onOpen; this.onFrame = onFrame; this.onGap = onGap; this.onEnd = onEnd;
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
    inner.addEventListener('message', e => { if (inner === this.__inner) this.onFrame(e.data); });
    inner.addEventListener('close', e => { if (inner === this.__inner) this.closed_(e); });
  }

  closed_(e) {
    if (this.ended) return;
    const meant = e.code === 4001 || e.code === 4003;
    const delay = RemoteSocket.delays[this.attempt];
    if (meant || delay === undefined) {
      this.ended = true;
      this.held = [];
      this.onEnd({ code: e.code, reason: e.reason, gaveUp: !meant });
      return;
    }
    if (this.attempt === 0) this.onGap();
    this.attempt++;
    this.timer = setTimeout(() => { this.timer = null; this.dial(); }, delay);
  }

  get open() { return !this.ended && this.__inner.readyState === 1; }

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
  KEEPALIVE_MS: 30000,
  // off | pairing | waiting | connected | error. `detail` is the agent's name
  // when connected, the message when error, the reason while pairing.
  state: 'off',
  detail: '',
  socket: null,
  agentName: '',
  calls: 0,
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
    return 'npx vibeos-mcp --token ' + remoteToken;
  },

  mint() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    if (!MCP_TOKEN_RE.test(hex)) throw new Error('minted a token that is not 64 hex');
    return hex;
  },

  relayUrl() {
    let override = null;
    try { override = localStorage.getItem(this.RELAY_KEY); } catch {}
    if (override) return override;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/mcp/relay';
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
    remoteToken = this.mint();
    this.agentName = '';
    this.set('pairing', 'dialing the relay');
    this.dial();
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
    this.socket = new RemoteSocket(this.relayUrl(), {
      hello: () => ({ hello: 'tab', token: remoteToken }),
      onOpen: () => {
        // Unsolicited, for an agent already waiting; the package also asks on
        // every connect of its own, and `want` is answered every time.
        this.socket.send(JSON.stringify({ tools: TOOL_SCHEMAS }));
        this.set('waiting');
      },
      onFrame: raw => this.handle(raw),
      onGap: () => this.set('pairing', 'the relay dropped the socket; redialing'),
      onEnd: ({ code, reason, gaveUp }) => {
        this.socket = null;
        this.stopKeepalive();
        if (code === 4003) { remoteToken = null; this.set('off'); return; }
        if (code === 4001) { this.set('error', 'another tab paired with this token and took its place; revoke here, or pair again there'); return; }
        if (!gaveUp) throw new Error('RemoteSocket ended on a code it does not mean: ' + code);
        this.set('error', `the relay closed the socket (${code}${reason ? ' ' + reason : ''}) and five redials failed — retry, or check the network`);
      },
    });
    this.startKeepalive();
  },

  // The relay only says "peer not connected" when we send something, so a
  // frame every 30 s is how the pane learns the agent left. The package
  // ignores a frame with no id, tools or error.
  startKeepalive() {
    this.stopKeepalive();
    this.keepalive = setInterval(() => { if (this.socket && this.socket.open) this.socket.send(JSON.stringify({ ping: Date.now() })); }, this.KEEPALIVE_MS);
  },
  stopKeepalive() { clearInterval(this.keepalive); this.keepalive = null; },

  handle(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { console.error('RemoteBridge: a frame that is not JSON from the relay:', raw); return; }
    if (!msg || typeof msg !== 'object') return;
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
    if (name) this.agentName = name;
    const label = this.agentName || 'an agent';
    if (this.state !== 'connected') track('mcp_paired');
    this.set('connected', label);
  },

  async call(msg) {
    this.calls++;
    this.connected();
    this.emit();
    const result = await bridgeCall({ tool: msg.tool, input: msg.input }, 'mcp_call');
    // The socket may have been cut or revoked while the tool ran: a held frame
    // goes out on the redial (the package answers or has already failed the
    // call by id); after a revoke there is nowhere to send and nothing owed.
    if (!this.socket) return;
    const frame = result && result.ok === false
      ? { id: msg.id, error: result.error + (result.available ? ' (available: ' + result.available.join(', ') + ')' : '') }
      : { id: msg.id, result };
    this.socket.send(JSON.stringify(frame));
  },

  revoke() {
    if (!remoteToken) return;
    track('mcp_revoked');
    const token = remoteToken;
    const s = this.socket;
    this.socket = null;
    this.stopKeepalive();
    remoteToken = null;
    this.agentName = '';
    if (s && s.open) { s.send(MCP_REVOKE_FRAME); s.close(1000, 'revoked'); }
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
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ hello: 'tab', token }));
      ws.send(MCP_REVOKE_FRAME);
    });
    ws.addEventListener('error', () => console.error('RemoteBridge: the relay did not take the revoke; the token is forgotten here, and the package will read peer not connected until the relay function ends'));
  },

  // The token dies with the tab, so the pairing must too: without this a
  // closed or reloaded tab (reload_os included) left the agent side attached
  // and the package answering "peer not connected" for good, with no way
  // back but a new token pasted into its config.
  unload() {
    if (!remoteToken) return;
    const s = this.socket;
    if (s && s.open) s.send(MCP_REVOKE_FRAME);
    else this.deliverRevoke(remoteToken);
    this.socket = null;
    this.stopKeepalive();
    remoteToken = null;
    this.agentName = '';
    this.set('off');
  },
};
window.addEventListener('pagehide', () => RemoteBridge.unload());

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
        return { ok: true, kind: 'vm', title, file, installed, source };
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
      paintDock();
      // Launch what was written, not what was passed: they differ when the
      // header had to be added, and the window must match the file.
      const written = saved.source || source;
      launchApp({ title, source: written, requires: parseRequires(written) });
      const { source: _written, ...report } = saved;
      return { ok: true, kind: 'window', title, saved: report,
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
        const text = await Workspace.readPath(input.path);
        const lines = text.split('\n');
        const from = Math.max(1, input.from || 1), to = Math.min(lines.length, input.to || lines.length);
        const slice = lines.slice(from - 1, to).map((l, i) => `${from + i}: ${l}`).join('\n');
        return { ok: true, path: input.path, lines: lines.length, from, to, text: slice.slice(0, 60000), truncated: slice.length > 60000 };
      } catch (e) { return { ok: false, error: e.message }; }
    }
    if (toolName === 'search_file') {
      onStatus?.('searching ' + input.path + '…');
      try {
        const re = new RegExp(input.pattern, 'i');
        const hits = [];
        (await Workspace.readPath(input.path)).split('\n').forEach((l, i) => { if (re.test(l) && hits.length < 60) hits.push({ line: i + 1, text: l.slice(0, 200) }); });
        return { ok: true, path: input.path, hits };
      } catch (e) { return { ok: false, error: e.message }; }
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
      setTimeout(() => location.reload(), 400);
      return { ok: true, note: 'reloading ' + forked.join(' and ') + ' — this turn ends here; the chat shows your note after boot', reloading: forked };
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
