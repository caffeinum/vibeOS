/* vibeOS — the desktop. This file IS the operating system.
 *
 * It is served from vibeos.sh/app/os.js, and the loader in index.html boots it
 * from there — unless a copy exists at system/os.js in your workspace, in
 * which case yours wins. The agent has read_file / search_file / edit_file /
 * write_file over the workspace and reload_os to apply, so "add a button to the
 * Browser" is an edit to this file, not a request for a feature. A copy that
 * fails to boot is skipped on the next load and the served one runs instead.
 * A copy also pins the OS to the served version it was forked from — recorded
 * in system/os.version.json — and the loader says so when vibeos.sh moves on.
 */
/* =========================================================================
   vibeOS Web — capability-provider prototype

   Two claims under test:

   1. ONE UI, TWO BACKENDS. Everything goes through a capability provider.
      The UI never asks "am I in a browser" — it asks what the provider
      supports, and says so plainly when the answer is no.

   2. THE WORKSPACE IS A REAL FOLDER, NOT BROWSER STORAGE. Generated apps
      are written to ~/vibeos/apps as plain files on disk. That is what
      makes "download the binary and keep your apps" need no export, no
      sync and no account — the native build opens the same folder.
   ========================================================================= */

// Product events, so "46 people opened /app" can become "and this is what
// happened next". Deliberately coarse: no prompt text, no URLs, no key state.
function track(name, data) {
  try {
    const evt = { name };
    if (data) evt.data = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
    window.va && window.va('event', evt);
  } catch {}
}

/* ---------- capability providers ------------------------------------- */

// Chrome forbids file pickers inside a cross-origin iframe, which is exactly
// where a published artifact runs. So "can I store a workspace" and "can I
// reach the user's actual disk" are different questions, and the second one
// depends on how the page is embedded, not on the browser.
const inCrossOriginFrame = (() => {
  try { return window.self !== window.top && !window.top.location.origin; }
  catch { return true; }
})();
const canPickDirectory = ('showDirectoryPicker' in window) && !inCrossOriginFrame;
const canStoreWorkspace = canPickDirectory || !!(navigator.storage && navigator.storage.getDirectory);

// null, a string, NaN and 0 all used to run with whatever setTimeout made of
// them; a timeout that is not a number is a bug in the caller, so say so.
const checkTimeout = (timeoutMs) => {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive integer');
};

const BrowserProvider = {
  name: 'browser', label: 'Browser',
  supports: {
    files:    canStoreWorkspace,     // a workspace exists (disk or private store)
    disk:     canPickDirectory,      // it is genuinely THEIR folder
    write:    canStoreWorkspace,
    get shell() { return VM.state === 'ready'; },   // the VM's shell, not yours
    process:  false,     // host processes; workers are a different thing
    net:      false,
    usb:      'usb' in navigator,
    serial:   'serial' in navigator,
    hid:      'hid' in navigator,
    midi:     'requestMIDIAccess' in navigator,
    camera:   !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    clipboard:!!(navigator.clipboard && navigator.clipboard.readText),
    codegen:  true,
  },
  async list(dir) {
    const h = dir || Workspace.root;
    if (!h) throw new Error('No folder open.');
    const out = [];
    for await (const [name, handle] of h.entries()) out.push({ name, handle, dir: handle.kind === 'directory' });
    out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
    return out;
  },
  async read(handle) { return (await handle.getFile()).text(); },
  // Real, once the background Linux is up — but it is the VM's shell, on the
  // VM's disk. Never the user's machine. The capability table says so.
  async shell(cmd, timeoutMs = 20000) { checkTimeout(timeoutMs); return VM.exec(cmd, timeoutMs); },
};

const NativeProvider = {
  name: 'native', label: 'Native binary',
  supports: { files:true, disk:true, write:true, shell:true, process:true, net:true, usb:true,
              serial:true, hid:true, midi:true, camera:true, clipboard:true, codegen:true },
  base: 'http://127.0.0.1:4571',
  async probe() {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 400);
    try { return (await fetch(this.base + '/health', { signal: c.signal })).ok; }
    catch { return false; } finally { clearTimeout(t); }
  },
  async list(path='~') { return (await (await fetch(`${this.base}/fs?path=${encodeURIComponent(path)}`)).json()); },
  async shell(cmd, timeoutMs = 20000) {
    checkTimeout(timeoutMs);
    const r = await fetch(this.base + '/exec', { method:'POST',
      headers: {'content-type':'application/json'}, body: JSON.stringify({ cmd, timeoutMs }) });
    return (await r.json()).stdout;
  },
};

let CAP = BrowserProvider;

/* ---------- tiny IndexedDB, only to remember the folder handle -------- */

const idb = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('vibeos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', mode), s = t.objectStore('kv');
      const rq = fn(s);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  },
  get(k) { return this.tx('readonly', s => s.get(k)); },
  set(k, v) { return this.tx('readwrite', s => s.put(v, k)); },
};

/* ---------- the workspace: a real directory on the user's disk -------

   Everything the desktop creates lives here as ordinary files:

     ~/vibeos/apps/<name>.js     one generated app per file
     ~/vibeos/data/              whatever those apps save

   Not OPFS, not localStorage. That choice is the whole handoff story:
   the native build opens this same folder and finds the same apps, so
   "download the binary and carry on" needs no export and no sync.
   -------------------------------------------------------------------- */

const Workspace = {
  root: null, apps: null, dataDir: null,

  get open() { return !!this.root; },

  async mount(handle) {
    this.root = handle;
    this.apps = await handle.getDirectoryHandle('apps', { create: true });
    this.dataDir = await handle.getDirectoryHandle('data', { create: true });
    await idb.set('workspace', handle);
    paintWorkspace();
  },

  // On reload the handle survives in IndexedDB, but permission may need
  // re-granting — and that requires a user gesture, so it cannot happen
  // at boot. Report which of the three states we are in.
  private: false,

  // Fallback when a real folder cannot be opened: OPFS. Same interface, same
  // code path, but it lives in this browser rather than on their disk — so it
  // is labelled differently everywhere it appears.
  async mountPrivate() {
    if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('This browser has no private storage.');
    let dir;
    try {
      dir = await navigator.storage.getDirectory();
    } catch (e) {
      // Opened over file:// the origin is opaque and OPFS throws SecurityError.
      // Say that, rather than surfacing the raw error.
      throw new Error(window.origin === 'null'
        ? 'Private storage is unavailable on file:// pages, because the origin is opaque. Use "Choose folder…" here, or serve the file over http://localhost.'
        : 'Private storage was refused: ' + e.name);
    }
    this.private = true;
    await this.mount(dir);
  },

  // 'no workspace' is a state, not a name: the Workspace pane and the app
  // save report read this while a folder is still waiting to be re-granted,
  // and `this.root.name` threw there.
  get label() {
    if (!this.open) return 'no workspace';
    return this.private ? 'private browser storage' : (this.root.name || 'workspace');
  },

  async restore() {
    if (!canPickDirectory) return 'no-picker';
    if (!CAP.supports.files) return 'unsupported';
    let handle;
    try { handle = await idb.get('workspace'); } catch { return 'none'; }
    if (!handle) return 'none';
    // mountPrivate() stores the OPFS root under the same key, so a reload of a
    // private workspace comes back through here. Its name is '', and without
    // this it mounted as a folder called 'workspace' — the one label that
    // says nothing about where the files are.
    const isPrivate = await this.isPrivateRoot(handle);
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') { this.private = isPrivate; await this.mount(handle); return isPrivate ? 'private' : 'restored'; }
    this.pending = handle;
    return 'needs-permission';
  },

  async isPrivateRoot(handle) {
    if (!navigator.storage || !navigator.storage.getDirectory) return false;
    let opfs;
    try { opfs = await navigator.storage.getDirectory(); } catch { return false; }   // opaque origin: no OPFS, so not it
    return handle.isSameEntry(opfs);
  },

  async regrant() {
    if (!this.pending) return false;
    const perm = await this.pending.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return false;
    await this.mount(this.pending); this.pending = null; return true;
  },

  async pick() {
    if (!canPickDirectory) throw new Error(
      inCrossOriginFrame
        ? 'This page is embedded in a cross-origin frame, and browsers forbid file pickers there. Open it top-level to use a real folder.'
        : 'This browser has no File System Access API.');
    this.private = false;
    await this.mount(await window.showDirectoryPicker({ mode: 'readwrite', id: 'vibeos', startIn: 'documents' }));
  },

  async saveApp(name, source) {
    if (!this.open) return false;
    const file = name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase().slice(0, 40) || 'app';
    const fh = await this.apps.getFileHandle(file + '.js', { create: true });
    const w = await fh.createWritable(); await w.write(source); await w.close();
    return file + '.js';
  },

  // Path-addressed access for the agent's file tools. Reads of the OS source
  // fall back to the served copy, so the very first edit_file has the real
  // file to edit and writing it is what forks the OS into this workspace.
  async dirFromPath(path, create, root = this.root) {
    const parts = String(path).replace(/^\/+/, '').split('/').filter(Boolean);
    if (!parts.length || parts.some(x => x === '..')) throw new Error('bad path: ' + path);
    let dir = root;
    for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create });
    return { dir, name: parts[parts.length - 1] };
  },
  // Bytes, for the VM snapshot. `root` may be a directory other than the
  // workspace (private storage when none is open); the text helpers above
  // always mean the workspace and take no such argument.
  async readBytesPath(path, root = this.root) {
    if (!root) throw new Error('no workspace is open');
    const { dir, name } = await this.dirFromPath(path, false, root);
    return new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer());
  },

  async writeBytesPath(path, bytes, root = this.root) {
    if (!root) throw new Error('no workspace is open');
    const { dir, name } = await this.dirFromPath(path, true, root);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(bytes); await w.close();
  },

  // null when the file does not exist; any other failure is thrown.
  async statPath(path, root = this.root) {
    if (!root) throw new Error('no workspace is open');
    let dir, name;
    try { ({ dir, name } = await this.dirFromPath(path, false, root)); }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
    let file;
    try { file = await (await dir.getFileHandle(name)).getFile(); }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
    return { size: file.size, modified: file.lastModified, file };
  },

  async removePath(path, root = this.root) {
    if (!root) throw new Error('no workspace is open');
    const { dir, name } = await this.dirFromPath(path, false, root);
    await dir.removeEntry(name);
  },

  osFile(path) {
    const m = /^system\/(os\.js|os\.css)$/.exec(String(path).replace(/^\/+/, ''));
    return m ? m[1] : null;
  },
  async readPath(path) {
    if (!this.open) throw new Error('no workspace is open');
    try {
      const { dir, name } = await this.dirFromPath(path, false);
      return (await (await dir.getFileHandle(name)).getFile()).text();
    } catch (e) {
      const file = this.osFile(path);
      if (!file) throw new Error('not found: ' + path);
      return (await this.fetchServed(file)).text;
    }
  },
  // The served text is in hand here, so this is where its version is taken:
  // the loader hashes the same bytes with the same function (versionId lives
  // in index.html), and a fork records the value so a later boot can tell
  // whether vibeos.sh has moved on since.
  async fetchServed(file) {
    // Same policy as the loader's probe: a conditional GET, or a host with no
    // Cache-Control hands back a heuristically cached os.js and the fork is
    // pinned to a version the server stopped serving minutes ago.
    const r = await fetch(BASE + file, { cache: 'no-cache' });
    if (!r.ok) throw new Error('could not fetch the served ' + file + ' (' + r.status + ')');
    const text = await r.text();
    if (typeof versionId !== 'function') throw new Error('versionId is missing: os.js must boot from the vibeOS loader');
    return { text, version: versionId(text) };
  },
  async writePath(path, text) {
    if (!this.open) throw new Error('no workspace is open');
    const { dir, name } = await this.dirFromPath(path, true);
    const file = this.osFile(path);
    let forking = false;
    if (file) { try { await dir.getFileHandle(name); } catch { forking = true; } }
    if (forking) await this.recordFork(file);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(text); await w.close();
  },
  // First write of system/os.js or os.css: pin the version it came from in
  // system/os.version.json, one entry per file since the two fork on
  // different days. Written before the fork itself, so a fork with no record
  // cannot come out of this path — the loader reports one as an error, and
  // the only honest way to get there is a copy made by hand.
  async recordFork(file) {
    const { version } = await this.fetchServed(file);
    const sys = await this.systemDir();
    let rec = {};
    let existing = null;
    try { existing = await (await (await sys.getFileHandle('os.version.json')).getFile()).text(); } catch {}
    if (existing !== null) {
      try { rec = JSON.parse(existing); } catch (e) { throw new Error('system/os.version.json is not JSON (' + e.message + '); write it back as valid JSON before forking ' + file); }
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) throw new Error('system/os.version.json is not an object; write it back as {} before forking ' + file);
    }
    rec[file] = { base: version, at: new Date().toISOString() };
    await this.writeSystem('os.version.json', JSON.stringify(rec, null, 2) + '\n');
  },

  // system/ holds the shell's own overrides. It is deliberately outside the
  // apps/data mapping below: overlay.js is a patch to the desktop, and
  // routing it by extension would have listed it in the dock as an app.
  async systemDir() { return this.root.getDirectoryHandle('system', { create: true }); },
  async readSystem(name) {
    const fh = await (await this.systemDir()).getFileHandle(name);
    return (await fh.getFile()).text();
  },
  async writeSystem(name, text) {
    const fh = await (await this.systemDir()).getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(text); await w.close();
  },

  // Which OS files the loader would boot from. A blank os.js counts as none:
  // the loader reads it as "stock" (that is how write_file('') un-forks), so a
  // reload after one would come back the same and say nothing.
  async forkedSystem() {
    const out = [];
    for (const name of ['os.js', 'os.css']) {
      try { if ((await this.readSystem(name)).trim()) out.push('system/' + name); } catch {}
    }
    return out;
  },

  // Generated code lives in apps/, everything else in data/. The VM's 9p mount
  // is flat, so map by extension rather than inventing a second tree inside it.
  dirFor(name) { return name.endsWith('.js') ? this.apps : this.dataDir; },

  async readAny(name) {
    const fh = await this.dirFor(name).getFileHandle(name);
    return new Uint8Array(await (await fh.getFile()).arrayBuffer());
  },

  async writeAny(name, bytes) {
    const fh = await this.dirFor(name).getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(bytes); await w.close();
  },

  async listAll() {
    if (!this.open) return [];
    const out = [];
    for (const dir of [this.apps, this.dataDir]) {
      for await (const [name, h] of dir.entries()) {
        if (h.kind !== 'file') continue;
        const file = await h.getFile();
        out.push({ name, size: file.size, modified: file.lastModified });
      }
    }
    return out;
  },

  // Raw sources only; Apps.list decides which of them are apps, so both
  // stores are judged by the one rule. A file that cannot be read is
  // returned with its error rather than dropped, for the same reason.
  async listApps() {
    if (!this.open) return [];
    const out = [];
    for await (const [name, h] of this.apps.entries()) {
      if (h.kind !== 'file' || !name.endsWith('.js')) continue;
      try {
        const file = await h.getFile();
        out.push({ name, source: await file.text(), modified: file.lastModified });
      } catch (e) { out.push({ name, error: e.message }); }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
};

// Generated apps declare what they need in a header comment, so the shell
// can grey out an app this mode cannot run instead of letting it fail on
// open. Same idea as the provider table, per app.
function parseRequires(src) {
  const m = /^\s*\/\/\s*@requires\s+(.+)$/m.exec(src);
  if (!m) return [];
  return m[1].trim().split(/[,\s]+/).filter(x => x && x !== 'none');
}
function parseTitle(src) {
  const m = /^\s*\/\/\s*@title\s+(.+)$/m.exec(src);
  return m ? m[1].trim() : null;
}

// A .js file is a dock app only if it carries the header the agent always
// writes. Before this gate, any .js that reached /mnt or apps/ by any route —
// curl, apt, an unpacked archive — was listed in the dock under its filename
// and blob-imported in-origin next to the user's API key, authored by nobody.
// A refused file is not hidden: it comes back with the reason, so Settings
// can show it and the agent can add the header when asked. That includes a
// file that could not be read at all — v86 rejects an empty file with "File
// not found", which used to vanish into a catch {}. A .js in a /mnt
// subdirectory is not here at all: the mirror is flat (Sync.vmFiles), so it
// stays in the machine and the Sync pane names the directory as not mirrored.
//
// This is trust by convention, not a security boundary: any curl'd file with
// a "// @title" line on any line is a dock app under whatever title that line
// says. The gate stops a file from becoming an app by accident, not on
// purpose. What it must guarantee instead is that nothing about such a file —
// name, title, requires, reason — is ever interpreted as HTML by the desktop.
const NOT_AN_APP = {
  header: 'not an app (no // @title header)',
  vm:     'not an app (// @target vm — a VM script, not a window)',
  read:   'could not be read: ',
};
function classifyApp(name, { source, error }) {
  if (error !== undefined) return { name, reason: NOT_AN_APP.read + error };
  const title = parseTitle(source);
  if (!title) return { name, reason: NOT_AN_APP.header };
  if (parseTarget(source) === 'vm') return { name, reason: NOT_AN_APP.vm };
  return { name, source, title, requires: parseRequires(source) };
}

// What the gate above checks for, guaranteed on every save. create_app used
// to write a headerless source verbatim and report it saved: the window opened
// once, and the file then sat in unlisted forever while the chat said "saved".
// Returns the source actually written and which header lines were added.
function ensureHeader(title, source) {
  const added = [];
  const line = (tag, value, present) => {
    if (present) return;
    source = `// @${tag} ${value}\n` + source;
    added.unshift(tag);
  };
  line('requires', 'none', /^\s*\/\/\s*@requires\s/m.test(source));
  line('target', 'browser', /^\s*\/\/\s*@target\s/m.test(source));
  line('title', String(title || 'app').replace(/\s+/g, ' ').trim() || 'app', !!parseTitle(source));
  return { source, added };
}
const missingCaps = reqs => reqs.filter(r => !CAP.supports[r]);

// A "terminal" that is a JavaScript switch on "ls" / "echo" / "help" opens,
// prints a prompt and runs nothing — it passed every check the desktop had
// because it is a valid window app. Both rules below are provable from the
// source alone, so they can refuse before Apps.save; the fix is in the
// message because the model reads it as the tool result and tries again.
// A "Console log viewer" with @requires none is the accepted false positive:
// it is refused too, and the message says what to change.
function lintApp(title, requires, source) {
  if (/api\.shell\s*\(/.test(source)) return null;
  const machine = `The machine is ${VM.state}.`;
  if (/\b(terminal|term|shell|console)\b/i.test(title)) {
    return { rule: 'fake_terminal', error: `a terminal must drive the Linux VM: declare // @requires shell and run each line with api.shell(line). ${machine}` };
  }
  if (requires.includes('shell')) {
    return { rule: 'unused_shell', error: `declares // @requires shell but never calls api.shell(). Run commands through api.shell(cmd) or drop the requirement. ${machine}` };
  }
  return null;
}


/* ---------- the model, when a server is holding a key ------------------ */

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
            messages: [...(history || []).slice(-6), user] }
        : { model: this.model, max_completion_tokens: 2000,
            messages: [{ role: 'system', content: withSkills(forImage(PASTE_KEY_SYSTEM_PROMPT)) },
                       ...(history || []).slice(-6), user] };

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
api.shell(cmd, timeoutMs = 20000) -> Promise<string> (needs shell): stdout and stderr together, ANSI stripped; rejects on timeout or while the machine is not running. It is ONE shell session shared by every app and the agent, so a cd leaks into everyone else's commands: never cd, use absolute paths. No stdin and no tty: vi, top, less, an interactive zsh hang until interrupted. List a directory with ls -1p. Anything that can run past ~15 s (apk add, apt-get, git clone, a build) needs a bigger timeout — api.shell(cmd, 600000) — or goes to the background, cmd > /mnt/job.log 2>&1 &, followed with api.shell("tail -n 20 /mnt/job.log").

Layout rules (required): root width/height 100%, box-sizing:border-box, display:flex, flex-direction:column, overflow:hidden on mount. No document scroll, no min-height exceeding the window. Modest type and padding; empty states must fit. Scroll inner panes only (overflow:auto, scrollbar-width:thin), never mount.

Plain JavaScript only, no JSX, no imports, no external URLs. Under 60 lines and it must work.

TARGET 2, a program inside the VM. Use when the request is about files, text processing or system tasks. Header exactly:
// @title <Short Name>
// @target vm
// @file <name.sh>
Then a POSIX shell script for BusyBox ash. No bash arrays, no GNU-only flags, no package manager, no network. Available: sh ls cat grep sed awk wc sort head tail cut tr find echo test. The workspace is at /mnt. Print results to stdout.`;

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

const GUEST_TOOLS = new Set(['create_app', 'vm_exec', 'list_apps', 'set_theme', 'read_file', 'search_file', 'edit_file', 'write_file', 'reload_os', 'web_fetch', 'web_search']);

// What the agent is told about the shell's own apps. They are functions in
// os.js, so "change the Browser" is an edit to system/os.js — not a request.
// One sentence, said wherever the agent or the person looks at /mnt, so a
// directory made in the guest is not discovered missing from the folder later.
const MOUNT_MAPPING = '/mnt is the workspace, flat: /mnt/<name> is data/<name> and /mnt/<name>.js is apps/<name>.js; system/ is not in /mnt and subdirectories under /mnt are not mirrored, nor are symlinks or special files — only regular files at the root of /mnt (the rest is listed under unmirrored).';

// S_IFMT classes of a 9p inode mode, named so a filter reads as what it keeps.
const INODE_TYPES = { 0x8000: 'file', 0x4000: 'dir', 0xA000: 'symlink', 0x1000: 'fifo', 0xC000: 'socket', 0x2000: 'chardev', 0x6000: 'blockdev' };
function inodeType(mode) {
  const t = INODE_TYPES[mode & 0xF000];
  if (!t) throw new Error(`unknown 9p inode mode ${mode.toString(8)}`);
  return t;
}

const BUILTIN_APPS = () => Object.entries(SHELL).map(([id, s]) => ({
  id, title: s.title, builtin: true,
  source: 'system/os.js', hint: `search_file system/os.js for "function ${s.render.name}"`,
}));

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
      if (!call || !call.tool) { await this.answer(id, { ok: false, error: 'request needs a "tool" field' }); continue; }
      if (call.tool === 'js') {
        // `vibeos js '<code>'` runs in the desktop's own origin and returns the
        // value (awaited) as JSON. The machine is trusted and the agent can
        // already rewrite os.js through write_file, so this is not a new power,
        // only a shorter path to it: a script in the VM can open a window, read
        // VM.state, or call any desktop function without editing a file first.
        track('guest_rpc', { tool: 'js' });
        let result;
        try {
          const code = call.input && call.input.code;
          if (typeof code !== 'string' || !code.trim()) throw new Error('js needs {"code": "<javascript>"}');
          const value = await (0, eval)(`(async () => (${code}))()`).catch(async () => (0, eval)(`(async () => { ${code} })()`));
          result = { ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) };
        } catch (e) { result = { ok: false, error: e.message }; }
        await this.answer(id, result);
        continue;
      }
      if (!GUEST_TOOLS.has(call.tool)) {
        await this.answer(id, { ok: false, error: 'unknown tool: ' + call.tool, available: [...GUEST_TOOLS, 'js'] });
        continue;
      }

      track('guest_rpc', { tool: call.tool });
      let result;
      try { result = await Agent.executeTool({ toolName: call.tool, input: call.input || {} }); }
      catch (e) { result = { ok: false, error: e.message }; }
      await this.answer(id, result);
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
  { name: 'read_file', description: 'Read a file from the workspace. system/os.js IS the operating system (the desktop, windows, dock, built-in apps, the agent loop). Optional line range for big files.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, from: { type: 'integer' }, to: { type: 'integer' } }, required: ['path'] } },
  { name: 'search_file', description: 'Find lines in a workspace file matching a regex; returns line numbers and text. Use before edit_file on system/os.js.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, pattern: { type: 'string' } }, required: ['path', 'pattern'] } },
  { name: 'edit_file', description: 'Replace one exact occurrence of old with new in a workspace file. The first edit of system/os.js or system/os.css forks it from the served copy; from then on yours boots. Call reload_os to apply OS edits.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
  { name: 'write_file', description: 'Write a whole workspace file (apps/*.js, data/*, system/os.js, system/os.css). Prefer edit_file for changes.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'reload_os', description: 'Reload the desktop so edits to system/os.js or system/os.css take effect. The reload ends this turn — nothing you say after it reaches the user — so make every edit first, call it once, last, and pass a note: it is shown in the chat after boot. Refuses when nothing has been edited. If the edited OS fails to boot, the stock one runs next time and says so — you cannot lock yourself out.',
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
    .replace(/^\s*export\s+default\s+/m, 'const __vibeos_default = ')
    .replace(/^\s*export\s+(?=(const|let|var|function|class|async)\b)/gm, '')
    .replace(/^\s*import\s[^\n]*$/gm, '');
  return parseError(asScript);
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
      ...(history || []).slice(-6).map(h => ({ role: h.role, content: h.content })),
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
        if (input.path.replace(/^\/+/, '') === 'system/os.js') {
          const err = parseError(next);
          if (err) return { ok: false, error: 'not saved: that edit makes system/os.js unparsable — ' + err + ' (a parse-clean edit can still fail at boot; recovery covers that)' };
        }
        await Workspace.writePath(input.path, next);
        track('edit_file', { os: /^system\//.test(input.path) });
        return { ok: true, path: input.path, note: /^system\//.test(input.path) ? 'saved — call reload_os to apply' : 'saved' };
      } catch (e) { return { ok: false, error: e.message }; }
    }
    if (toolName === 'write_file') {
      onStatus?.('writing ' + input.path + '…');
      try { await Workspace.writePath(input.path, String(input.content ?? '')); return { ok: true, path: input.path }; }
      catch (e) { return { ok: false, error: e.message }; }
    }
    if (toolName === 'reload_os') {
      if (!Workspace.open) return { ok: false, error: 'no workspace is open' };
      const forked = await Workspace.forkedSystem();
      if (!forked.length) return { ok: false, error: 'nothing to reload: no system/os.js or system/os.css has been edited' };
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
      ...(history || []).slice(-6).map(h => ({ role: h.role, content: h.content })),
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

let z = 10, offset = 0;
function openWindow({ id = '', title, badge = '', w = 560, h = 380, render }) {
  const el = document.createElement('div');
  el.className = 'win';
  if (id) el.dataset.app = id;
  Object.assign(el.style, {
    left: (60 + (offset % 5) * 34) + 'px', top: (60 + (offset % 5) * 28) + 'px',
    width: w + 'px', height: h + 'px', zIndex: ++z,
  });
  offset++;
  el.innerHTML = `
    <div class="titlebar">
      <button class="tl r" title="Close"></button>
      <button class="tl y" title="Minimise"></button>
      <button class="tl g" title="Zoom"></button>
      <span class="title"></span>
      ${badge ? `<span class="badge">${badge}</span>` : ''}
    </div>
    <div class="body"></div><div class="resize"></div>`;
  el.querySelector('.title').textContent = title;
  document.getElementById('desktop').appendChild(el);

  el.addEventListener('mousedown', () => (el.style.zIndex = ++z), true);
  el.querySelector('.tl.r').onclick = () => el.remove();
  el.querySelector('.tl.y').onclick = () => el.classList.add('min');
  el.querySelector('.tl.g').onclick = () => {
    if (el.dataset.full === '1') { Object.assign(el.style, JSON.parse(el.dataset.prev)); el.dataset.full = '0'; }
    else {
      el.dataset.prev = JSON.stringify({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height });
      Object.assign(el.style, { left: '8px', top: '38px', width: 'calc(100% - 16px)', height: 'calc(100% - 110px)' });
      el.dataset.full = '1';
    }
  };
  drag(el.querySelector('.titlebar'),
    (dx, dy, s) => { el.style.left = Math.max(0, s.l + dx) + 'px'; el.style.top = Math.max(30, s.t + dy) + 'px'; },
    () => ({ l: parseFloat(el.style.left), t: parseFloat(el.style.top) }));
  drag(el.querySelector('.resize'),
    (dx, dy, s) => { el.style.width = Math.max(300, s.w + dx) + 'px'; el.style.height = Math.max(180, s.h + dy) + 'px'; },
    () => ({ w: el.offsetWidth, h: el.offsetHeight }));

  render(el.querySelector('.body'), el);
  return el;
}

// Two chat windows were two copies of one log, and the last writer won. The
// dock raises the one that is open instead of opening another.
// The agent answers in light markdown — code spans, fences, bullets, bold —
// and it was painted as raw text with the backticks showing. This builds DOM
// nodes for that subset and nothing else: no innerHTML, so a reply that
// quotes a fetched page cannot carry markup into the desktop's origin.
function renderMd(el, text) {
  el.textContent = '';
  const inline = (parent, line) => {
    const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)/g; let last = 0, m;
    while ((m = re.exec(line))) {
      if (m.index > last) parent.appendChild(document.createTextNode(line.slice(last, m.index)));
      const node = document.createElement(m[1] ? 'code' : 'b');
      node.textContent = m[1] ? m[1].slice(1, -1) : m[2].slice(2, -2);
      parent.appendChild(node); last = m.index + m[0].length;
    }
    if (last < line.length) parent.appendChild(document.createTextNode(line.slice(last)));
  };
  const lines = String(text).split('\n');
  let i = 0, list = null, para = null;
  const closeAll = () => { list = null; para = null; };
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      closeAll(); const pre = document.createElement('pre'); const buf = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) buf.push(lines[i]);
      pre.textContent = buf.join('\n'); el.appendChild(pre); i++; continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      para = null;
      if (!list) { list = document.createElement('ul'); el.appendChild(list); }
      const item = document.createElement('li'); inline(item, li[1]); list.appendChild(item); i++; continue;
    }
    if (!line.trim()) { closeAll(); i++; continue; }
    list = null;
    if (!para) { para = document.createElement('p'); el.appendChild(para); }
    else para.appendChild(document.createElement('br'));
    inline(para, line); i++;
  }
}

function focusOrOpen(spec) {
  const open = document.querySelector(`.win[data-app="${spec.id}"]`);
  if (!open) return openWindow(spec);
  open.classList.remove('min');
  open.style.zIndex = ++z;
  return open;
}

function drag(handle, move, start) {
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const s = start(), x0 = e.clientX, y0 = e.clientY;
    const mv = ev => move(ev.clientX - x0, ev.clientY - y0, s);
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
}

/* ---------- running agent-written code, with no build step ------------

   An ES module written at runtime becomes a blob URL and is imported
   natively. No bundler, no server round-trip — the constraint that buys
   this is that the agent emits plain JS rather than JSX.
   -------------------------------------------------------------------- */

function createAppMount(body) {
  body.classList.add('app-shell');
  const mount = document.createElement('div');
  mount.className = 'app-mount';
  body.appendChild(mount);
  return mount;
}

function createAppApi(provider, mount) {
  let resizeCb = null;
  const ro = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    mount.style.setProperty('--mount-w', Math.round(width) + 'px');
    mount.style.setProperty('--mount-h', Math.round(height) + 'px');
    if (resizeCb) resizeCb(width, height);
  });
  ro.observe(mount);
  const win = mount.closest('.win');
  if (win) win.querySelector('.tl.r')?.addEventListener('click', () => ro.disconnect(), { once: true });
  return {
    async list(...args) { return provider.list(...args); },
    async shell(...args) { return provider.shell(...args); },
    onResize(fn) {
      resizeCb = fn;
      fn(mount.clientWidth, mount.clientHeight);
    },
    mountSize() {
      return { width: mount.clientWidth, height: mount.clientHeight };
    },
  };
}

async function runModule(source, mount, provider) {
  const api = createAppApi(provider, mount);
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    const mod = await import(url);
    if (typeof mod.default !== 'function') throw new Error('module must `export default function(mount, api)`');
    await mod.default(mount, api);
  } finally { URL.revokeObjectURL(url); }
}

function launchApp(app) {
  const missing = missingCaps(app.requires);
  openWindow({
    title: app.title, badge: missing.length ? 'blocked' : 'app', w: 430, h: 320,
    render: async (body) => {
      const mount = createAppMount(body);
      const start = async () => {
        try { await runModule(app.source, mount, CAP); }
        catch (e) { mount.textContent = ''; const m = document.createElement('p'); m.className = 'no small'; m.textContent = e.message; mount.appendChild(m); }
      };
      if (!missing.length) return start();
      renderUpsell(mount, missing);
      // Blocked only on the shell while the machine boots: open the app the
      // moment it is ready instead of leaving a "blocked" window behind.
      if (missing.every(c => c === 'shell') && VM.state !== 'failed' && VM.state !== 'unavailable') {
        const off = VM.on(st => { if (st === 'ready' && mount.isConnected) { off(); start(); } });
      }
    },
  });
}

// The limitation is the conversion moment, not a dead end.
function renderUpsell(mount, missing) {
  // "shell" is not a native-only capability: the VM provides it the moment it
  // is ready. Saying "a browser tab cannot provide" it while the machine was
  // still booting sent people (and the agent) away from kernel-backed apps —
  // the exact apps this OS exists to run. Say what is actually true.
  const vmCaps = missing.filter(c => c === 'shell');
  const nativeOnly = missing.filter(c => c !== 'shell');
  if (vmCaps.length && !nativeOnly.length) {
    const why = VM.state === 'ready' ? 'ready'
      : VM.state === 'failed' || VM.state === 'unavailable' ? `the machine is ${VM.state}${VM.detail ? ': ' + VM.detail : ''}`
      : `the machine is still ${VM.state || 'starting'} — this window opens by itself when it is ready`;
    mount.innerHTML = `
      <div class="upsell">
        <h3 style="margin:0 0 6px">Waiting for Linux</h3>
        <p class="small muted" style="margin:0 0 10px">This app uses the <b>shell</b>, which the VM provides. Right now ${why}.</p>
        ${VM.state === 'failed' || VM.state === 'unavailable'
          ? '<button class="btn sm" id="upsellRestart">Restart the machine</button>'
          : '<p class="tiny dimmer" style="margin:0">Settings &rsaquo; Machine shows the boot console.</p>'}
      </div>`;
    const rb = mount.querySelector('#upsellRestart');
    if (rb) rb.onclick = () => VM.restart();
    return;
  }
  mount.innerHTML = `
    <div class="upsell">
      <h3 style="margin:0 0 6px">Needs the native build</h3>
      <p class="small muted" style="margin:0 0 10px">
        This app requires <b></b>, which a browser tab cannot provide.
      </p>
      <p class="small muted" style="margin:0">
        ${Workspace.open && !Workspace.private
          ? `Your apps are already files in <code>${Workspace.label}/apps</code> — download the
             binary, point it at that folder, and this one runs unchanged.`
          : Workspace.open
          ? `Your apps are saved, but in private browser storage — export them, or reopen this page
             top-level to write to a real folder the native build can read directly.`
          : `Open a workspace first, and your apps become ordinary files the native build can open.`}
      </p>
    </div>`;
  // @requires is a header line in a file the guest can write: text, not html.
  mount.querySelector('b').textContent = nativeOnly.join(', ');
}

/* ---------- apps ------------------------------------------------------ */

function WorkspaceApp(body) {
  const paint = async () => {
    if (!Workspace.open) {
      body.innerHTML = `
        <h3>Pick a workspace folder</h3>
        <p class="small muted">Everything the agent builds gets written here as ordinary
          <code>.js</code> files — not browser storage. That is what makes the handoff to the
          native binary free: it opens the same folder.</p>
        <pre class="out">vibeos/
  apps/     one file per generated app
  data/     whatever those apps save</pre>
        ${!canPickDirectory ? `<div class="upsell" style="margin:10px 0">
            <b class="small">A real folder isn't available here</b>
            <p class="small muted" style="margin:6px 0 0">${inCrossOriginFrame
              ? `This page is running <b>inside a cross-origin frame</b>, and every browser forbids
                 file pickers there — nothing to do with vibeOS. Open the same page top-level
                 (or run it locally) and the picker works.`
              : `This browser has no File System Access API — Firefox and Safari still don't ship it.`}
              <br><br>You can still use everything below with <b>private browser storage</b>: same
              code path, same files, but they live in this browser instead of on your disk — which
              is exactly the case that needs an explicit export to reach the native build.</p>
          </div>` : ''}
        <div class="row" style="margin-top:10px">
          <button class="btn ${canPickDirectory ? 'p' : ''}" id="pick" ${canPickDirectory ? '' : 'disabled'}>Choose folder…</button>
          <button class="btn ${canPickDirectory ? '' : 'p'}" id="priv">Use private storage</button>
          ${Workspace.pending ? '<button class="btn" id="regrant">Reopen last folder</button>' : ''}
        </div>`;
      body.querySelector('#pick').onclick = async () => {
        try { await Workspace.pick(); paint(); } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
      };
      body.querySelector('#priv').onclick = async () => {
        try { await Workspace.mountPrivate(); paint(); } catch (e) { alert(e.message); }
      };
      const rg = body.querySelector('#regrant');
      if (rg) rg.onclick = async () => { if (await Workspace.regrant()) paint(); };
      return;
    }

    const { apps, unlisted } = await Apps.list();
    body.innerHTML = `
      <div class="row" style="margin-bottom:10px">
        <h3 style="margin:0;flex:1">apps <span class="tiny dimmer">· from ${Apps.source === 'vm' ? 'the VM' : Workspace.label}</span></h3>
        <button class="btn sm" id="change">Change…</button>
      </div>
      <div class="col" id="list"></div>
      <div class="upsell" style="margin-top:14px">
        <b class="small">Take it with you</b>
        <p class="small muted" style="margin:6px 0 0">${Workspace.private
          ? `These ${apps.length} ${apps.length === 1 ? 'file lives' : 'files live'} in <b>private browser
             storage</b>, not on your disk — so this is the case that <i>does</i> need an export to reach
             the native build. Open the page top-level to write to a real folder instead.`
          : `These are ${apps.length} plain ${apps.length === 1 ? 'file' : 'files'} on your disk. The native
             build opens this same folder — no export, no account, no sync. Zip it, git it, move it.`}
        </p>
      </div>`;
    const list = body.querySelector('#list');
    if (!apps.length && !unlisted.length) list.innerHTML = '<p class="small dimmer">No apps yet — build one in the Agent window.</p>';
    // Every string on these cards — name, title, requires, reason — comes from
    // a file the guest can write, so none of it goes through innerHTML. A
    // filename of `<img src=x onerror=…>` in /mnt ran in-origin, next to the
    // key, the moment Settings opened.
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const label = (top, topCls, bottom, bottomCls) => {
      const s = el('span'); s.style.flex = '1';
      s.append(el('span', topCls, top), el('br'), el('span', bottomCls, bottom));
      return s;
    };
    apps.forEach(a => {
      const missing = missingCaps(a.requires);
      const card = el('div', 'card' + (missing.length ? ' blocked' : ''));
      card.append(el('span', '', missing.length ? '🔒' : '📦'), label(a.title, '', a.name, 'tiny dimmer mono'));
      a.requires.forEach(r => card.append(el('span', 'req' + (CAP.supports[r] ? '' : ' miss'), r)));
      const open = el('button', 'btn sm', missing.length ? 'Why?' : 'Open');
      open.onclick = () => launchApp(a);
      card.append(open);
      list.appendChild(card);
    });
    // Shown, not hidden: a file that silently never appears looks like a lost
    // file. There is no Open button because opening is exactly what the gate
    // refuses.
    unlisted.forEach(u => {
      const card = el('div', 'card blocked');
      card.append(el('span', '', '📄'), label(u.name, 'mono', u.reason, 'tiny dimmer'));
      list.appendChild(card);
    });
    body.querySelector('#change').onclick = async () => {
      try { await Workspace.pick(); paint(); } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
    };
  };
  paint();
}

function FilesApp(body) {
  body.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <button class="btn p" id="pick">Open a folder…</button>
      <span class="small muted" id="where">nothing opened</span>
    </div>
    <p class="tiny dimmer" style="margin:0 0 10px">data/ and apps/ are the machine's /mnt, flat — subdirectories under /mnt are not mirrored.</p>
    <div id="list"></div><div id="view"></div>`;
  const list = body.querySelector('#list'), view = body.querySelector('#view');

  if (!CAP.supports.files) {
    list.innerHTML = `<p class="note">No File System Access API in this browser. The same build
      works in Chromium, or in the native binary where the filesystem is reached directly.</p>`;
    body.querySelector('#pick').disabled = true;
    return;
  }

  async function show(handle, label) {
    body.querySelector('#where').textContent = label;
    const items = await CAP.list(handle);
    list.innerHTML = '';
    items.slice(0, 300).forEach(it => {
      const row = document.createElement('div');
      row.className = 'file';
      // Names are the guest's to choose once Sync has pulled its files here.
      row.innerHTML = `<span>${it.dir ? '📁' : '📄'}</span><span></span>`;
      row.lastChild.textContent = it.name;
      row.onclick = async () => {
        if (it.dir) return show(it.handle, label + '/' + it.name);
        try {
          const text = await CAP.read(it.handle);
          view.innerHTML = '<h3 style="margin-top:12px"></h3>';
          view.firstChild.textContent = it.name;
          const pre = document.createElement('pre');
          pre.className = 'out'; pre.textContent = text.slice(0, 4000) || '(empty)';
          view.appendChild(pre);
        } catch (e) { view.textContent = ''; const m = document.createElement('p'); m.className = 'no small'; m.textContent = e.message; view.appendChild(m); }
      };
      list.appendChild(row);
    });
    if (!items.length) list.innerHTML = '<p class="muted small">empty folder</p>';
  }

  if (Workspace.open) show(Workspace.root, Workspace.root.name);
  body.querySelector('#pick').onclick = async () => {
    try {
      const h = await window.showDirectoryPicker({ mode: 'read' });
      await show(h, h.name);
    } catch (e) { if (e.name !== 'AbortError') { view.textContent = ''; const m = document.createElement('p'); m.className = 'no small'; m.textContent = e.message; view.appendChild(m); } }
  };
}

function CapsApp(body) {
  const rows = [
    ['Workspace storage',     'files',    'A real folder, or private browser storage as a fallback.'],
    ['Your actual disk',      'disk',     'Needs a picker: Chromium, and never inside a cross-origin frame.'],
    ['Run YOUR shell',        'shell',    'Never. The Terminal runs a real Linux, but on a virtual disk.'],
    ['Your processes',        'process',  'Workers give real concurrency; host processes are out of reach.'],
    ['Arbitrary REST APIs',   'net',      'Blocked without CORS headers. WebSockets are not CORS-bound.'],
    ['USB devices',           'usb',      'WebUSB, user gesture, Chromium only.'],
    ['Serial devices',        'serial',   'WebSerial, Chromium only.'],
    ['HID devices',           'hid',      'WebHID, Chromium only.'],
    ['MIDI',                  'midi',     'Web MIDI.'],
    ['Camera / mic',          'camera',   'getUserMedia, permission prompt.'],
    ['Clipboard read',        'clipboard','Needs permission and a gesture.'],
    ['Run agent-written code','codegen',  'Blob URL + dynamic import. No build step.'],
  ];
  body.innerHTML = `
    <p class="small muted" style="margin-top:0">
      Live probe of the current provider: <b>${CAP.label}</b>. The desktop asks this table what it
      can do — it never branches on "is this a browser".
    </p>
    <table><thead><tr><th>Capability</th><th>Now</th><th>Notes</th></tr></thead><tbody>
    ${rows.map(([label, key, note]) => `<tr><td>${label}</td>
      <td class="${CAP.supports[key] ? 'yes' : 'no'}"><b>${CAP.supports[key] ? 'yes' : 'no'}</b></td>
      <td class="dimmer tiny">${note}</td></tr>`).join('')}
    </tbody></table>
    <p class="note" style="margin-top:12px">
      Everything marked <span class="no"><b>no</b></span> flips to yes when this same page is served
      by the local vibeOS binary. The UI code does not change — only the provider behind it.
    </p>`;
}

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

function parseTarget(src) {
  const m = /^\s*\/\/\s*@target\s+(\w+)/m.exec(src);
  return m ? m[1] : 'browser';
}
function parseFile(src) {
  const m = /^\s*\/\/\s*@file\s+(.+)$/m.exec(src);
  return m ? m[1].trim() : null;
}

/* ---------- images in the chat ------------------------------------------

   A screenshot is the shortest bug report there is, so the chat takes one:
   paste or drop, a chip appears above the input, and it goes with the next
   message. It is shrunk here first. A Retina screenshot of this desktop is
   2560×1600 and ~1.5 MB as PNG; every transport carries it base64 inside a
   JSON body, and Anthropic refuses images over 5 MB outright. At ≤1600px on
   the long side and JPEG 0.85 the same screenshot is ~200 KB and every pixel
   of 13px UI text is still legible. */
const Attachments = {
  MAX_SIDE: 1600, QUALITY: 0.85,
  /* Every image rides base64 inside the JSON body, and on the agent paths the
     whole message array is resent on each tool step. Vercel refuses a body over
     4.5 MB with a 413 before the route runs. Measured at 1600px / JPEG 0.85: a
     2560×1600 Retina capture of this desktop is 80 KB as a data URL, the same
     size of pure noise is 1.16 MB, so four of the worst kind (4.6 MB) already
     pass the limit — hence a count and a byte cap, with 1.5 MB left for six
     history turns and the tool results of a run. */
  MAX_COUNT: 4, MAX_BYTES: 3 * 1024 * 1024,

  filesOf(e) {
    const dt = e.clipboardData || e.dataTransfer;
    return dt ? [...dt.files] : [];
  },

  // A file dragged out of some apps arrives with an empty MIME type and a
  // .png name; the first bytes say what it is when the type field does not.
  async kindOf(file) {
    if (/^image\//.test(file.type)) return file.type;
    const b = [...new Uint8Array(await file.slice(0, 12).arrayBuffer())];
    const at = (i, ...want) => want.every((w, k) => b[i + k] === w);
    if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
    if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
    if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
    if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
    return '';
  },

  bytesOf(list) { return list.reduce((n, i) => n + i.dataUrl.length, 0); },

  // Throws when `list` would not fit in one request body.
  check(list) {
    if (list.length > this.MAX_COUNT) throw new Error(`too many images: ${list.length} attached, ${this.MAX_COUNT} is the limit`);
    const bytes = this.bytesOf(list);
    if (bytes > this.MAX_BYTES) throw new Error(`images too large: ${(bytes / 1048576).toFixed(1)} MB attached, ${this.MAX_BYTES / 1048576} MB is the limit`);
  },

  // What history says in place of a picture the model saw once. Every transport
  // resends the last six turns, so the marker has to say the picture is gone —
  // "[image attached]" told the model a picture was in context it could not see.
  marker(n) {
    return n === 1
      ? '[a screenshot was attached to this message; it is not resent, so it is no longer visible]'
      : `[${n} screenshots were attached to this message; they are not resent, so they are no longer visible]`;
  },

  async prepare(file) {
    if (!file) throw new Error('not an image: empty file');
    const type = await this.kindOf(file);
    if (!type) throw new Error('not an image: ' + (file.name || 'unnamed') + (file.type ? ` (${file.type})` : ''));
    let bitmap;
    try { bitmap = await createImageBitmap(file.type ? file : new Blob([file], { type })); }
    catch (e) { throw new Error(`could not decode ${file.name || 'image'} (${type || file.type || 'unknown type'}): ${e.message}`); }
    const scale = Math.min(1, this.MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bitmap.width * scale));
    c.height = Math.max(1, Math.round(bitmap.height * scale));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);   // JPEG has no alpha; transparent PNG would come out black
    g.drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close();
    const dataUrl = c.toDataURL('image/jpeg', this.QUALITY);
    return { dataUrl, mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1),
             width: c.width, height: c.height, name: file.name || 'image' };
  },
};

/* ---------- the chat survives a reload ----------------------------------

   The chat lived in ChatApp's closure and nowhere else, so reload_os — which
   replaces the page 400 ms after the tool returns — took every turn with it,
   and the boot that followed had a model with no memory of what it had just
   edited. The log is a file now, system/chat.json. Not data/: Sync mirrors
   data/ flat into /mnt, so a log there was a permanent "changed on both
   sides" conflict and readable by any script the guest ran; system/ is never
   synced and never mounted. Written as each turn lands, read back by the
   chat that boots next, which says so in one line. A file that is not a log
   is reported in the chat, never skipped: a silently empty chat after a
   reload is the very bug this exists to fix. Entries come in user/assistant
   pairs, so the cap cuts on an even count. The log is read once per page
   (ChatLog.ready) and every chat window shares that array, so a send that
   lands before the read finishes waits for it rather than writing a
   two-turn file over the whole history. */
const ChatLog = {
  PATH: 'system/chat.json', OLD_PATH: 'data/chat.json', MAX_TURNS: 200,
  ready: null,

  // Resolves to the turns array (empty when there is no file yet), or null
  // when there is no workspace; rejects when the file exists but is not a
  // log, or could not be read for any reason other than not existing.
  load() {
    if (!this.ready) this.ready = this.read();
    return this.ready;
  },
  async read() {
    if (!Workspace.open) return null;
    let raw = await this.readSystemFile('chat.json');
    if (raw === null) raw = await this.migrate();
    if (raw === null) return [];
    return this.parse(raw);
  },
  async readSystemFile(name) {
    try { return await Workspace.readSystem(name); }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  },
  // A log written by the build that kept it in data/: moved on the first
  // boot that finds it, and only when system/ has none, so a newer log is
  // never overwritten by an older one.
  async migrate() {
    let old;
    try { old = await Workspace.readPath(this.OLD_PATH); }
    catch (e) { if (/^not found: /.test(e.message)) return null; throw e; }
    await Workspace.writeSystem('chat.json', old);
    const { dir, name } = await Workspace.dirFromPath(this.OLD_PATH, false);
    await dir.removeEntry(name);
    return old;
  },
  parse(raw) {
    let doc;
    try { doc = JSON.parse(raw); }
    catch (e) { throw new Error(`${this.PATH} is not JSON (${raw.length} bytes): ${e.message}`); }
    if (!doc || doc.v !== 1 || !Array.isArray(doc.turns)) throw new Error(`${this.PATH} is not a chat log: expected {"v":1,"turns":[…]}`);
    const bad = doc.turns.findIndex(t => !t || (t.role !== 'user' && t.role !== 'assistant') || typeof t.text !== 'string');
    if (bad >= 0) throw new Error(`${this.PATH} turn ${bad} is not {role:"user"|"assistant", text}`);
    return doc.turns;
  },

  // One turn saves three times within a tick (the pair, the reply, each
  // card). Two writables open on one OPFS file close in either order and the
  // later close wins, so the writes queue, each with the text of its moment.
  async save(turns) {
    if (!Workspace.open) return false;
    if (turns.length > this.MAX_TURNS) turns.splice(0, turns.length - this.MAX_TURNS);
    const text = JSON.stringify({ v: 1, turns }, null, 1);
    const mine = (this.writing || Promise.resolve()).catch(() => {}).then(() => Workspace.writeSystem('chat.json', text));
    this.writing = mine;
    await mine;
    return true;
  },

  // What the model is told a turn said: the shape `remember` in ChatApp
  // pushes live, so a restored history reads like one that never reloaded.
  content(t) {
    if (t.role !== 'user' || !t.images) return t.text;
    return (t.text ? t.text + '\n' : '') + Attachments.marker(t.images);
  },
};

function ChatApp(body) {
  body.style.padding = '0';
  body.innerHTML = `
    <div id="log" style="padding:12px;display:flex;flex-direction:column;gap:10px"></div>
    <div style="position:sticky;bottom:0;border-top:1px solid var(--barline);background:var(--panel)">
      <div id="chips" class="row" hidden style="flex-wrap:wrap;gap:6px;padding:8px 10px 0"></div>
      <div class="row" style="gap:6px;padding:8px 10px">
        <input type="text" id="msg" placeholder="ask for a window, or a script for the VM — paste a screenshot too"
               style="flex:1;border:1px solid var(--line);border-radius:var(--radius-ctl);background:var(--panel2);padding:7px 10px;font-size:13px" />
        <button class="btn p sm" id="send">Send</button>
      </div>
    </div>`;
  const log = body.querySelector('#log'), input = body.querySelector('#msg'), chips = body.querySelector('#chips');
  const history = [];
  const pending = [];
  // The persisted log (see ChatLog): history's text plus what the screen
  // showed — image counts, the cards — so a boot can paint it back.
  let turns = [];
  let saidUnsaved = false;
  const persist = () => ChatLog.save(turns).then(saved => {
    if (saved || saidUnsaved) return;
    saidUnsaved = true;
    line('chat is not being saved: no workspace mounted');
  }, e => {
    const b = bubble('vibeos', '<span class="no"></span>'); b.querySelector('.no').textContent = 'could not save ' + ChatLog.PATH + ': ' + e.message;
  });
  // The assistant entry the cards of the running turn belong to.
  let reply = null;
  const card = data => { if (!reply) return; reply.cards.push(data); persist(); };

  const bubble = (who, html) => {
    const d = document.createElement('div');
    d.style.cssText = who === 'you'
      ? 'align-self:flex-end;max-width:85%;background:var(--sel);color:var(--seltext);border:1px solid var(--line2);border-radius:var(--radius-win) 10px 2px 10px;padding:8px 11px;font-size:13px'
      : 'align-self:flex-start;max-width:92%;background:var(--panel2);border:1px solid var(--line);border-radius:var(--radius-win) 10px 10px 2px;padding:8px 11px;font-size:13px';
    d.innerHTML = html;
    log.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  };

  const line = text => { const d = bubble('vibeos', '<span class="tiny dimmer"></span>'); d.querySelector('.dimmer').textContent = text; return d; };

  // The old copy here told you to run server.py, which is the local python demo
  // and does not exist on vibeos.sh — it read as an error on the hosted build.
  // Offer the two things that actually work, as a button rather than a chore.
  const readyLine = () =>
    `Ask for anything. I build a <b>window</b> for the desktop, or a <b>script</b> that runs inside the VM — whichever fits.<br><span class="tiny dimmer">${Gen.model}</span>`;
  const intro = bubble('vibeos', Gen.available ? readyLine()
    : `<b class="part">No model connected yet.</b> Prompts fall back to stock modules until one is.<br>
       <span class="row" style="margin-top:8px"><button class="btn p sm" id="chatConnect">Connect a model</button></span>`);
  const connectBtn = intro.querySelector('#chatConnect');
  if (connectBtn) connectBtn.onclick = async () => {
    await Gen.askForKey();
    if (Gen.available) intro.innerHTML = readyLine();
  };

  const paintReload = ({ note, files, source }) => {
    const b = bubble('vibeos', `<b>reloaded</b> <span class="tiny dimmer">${source === 'stored' ? 'running your copy' : 'running the stock desktop'}</span><span class="tiny dimmer" id="files"></span><div id="note"></div>`);
    b.querySelector('#files').textContent = ' · ' + (files || []).join(', ');
    if (note) b.querySelector('#note').textContent = note; else b.querySelector('#note').remove();
  };
  // A card painted back from the log. The source is not in the file, so a
  // window opens from what the workspace holds under that title, and says
  // so when nothing does.
  const paintCard = c => {
    if (c.kind === 'refused') {
      const b = bubble('vibeos', '<b></b> <span class="no">refused</span><br><span class="tiny dimmer"></span>');
      b.querySelector('b').textContent = c.title; b.querySelector('.dimmer').textContent = c.error;
      return;
    }
    const b = bubble('vibeos', `<b></b> <span class="req">${c.kind === 'vm' ? 'vm script' : 'window'}</span><br>
      <span class="tiny dimmer"></span>
      <div class="row" style="margin-top:8px"><button class="btn sm" id="act"></button></div>
      <pre class="out" id="res" style="display:none;margin-top:8px"></pre>`);
    b.querySelector('b').textContent = c.title;
    b.querySelector('.dimmer').textContent = c.where;
    const act = b.querySelector('#act'), res = b.querySelector('#res');
    const show = t => { res.style.display = 'block'; res.textContent = t; };
    if (c.kind === 'vm') {
      act.textContent = 'Run it';
      act.onclick = async () => {
        if (VM.state !== 'ready') return show('the VM is not running');
        show('running…');
        try { show((await VM.exec('sh /mnt/' + c.file)) || '(no output)'); } catch (e) { show(e.message); }
      };
    } else {
      act.textContent = 'Open';
      act.onclick = async () => {
        const app = (await Apps.list()).apps.find(a => a.title === c.title);
        if (!app) return show('no app titled "' + c.title + '" in the workspace or the VM now');
        launchApp(app);
      };
    }
  };
  const paintTurn = t => {
    if (t.role === 'user') {
      const b = bubble('you', '<span id="t"></span>' + (t.images ? '<span class="tiny dimmer" id="i"></span>' : ''));
      b.querySelector('#t').textContent = t.text;
      if (t.images) b.querySelector('#i').textContent = (t.text ? ' · ' : '') + t.images + (t.images === 1 ? ' screenshot' : ' screenshots') + ', not kept';
      return;
    }
    if (t.reload) return paintReload(t.reload);
    (t.cards || []).forEach(paintCard);
    if (t.said) renderMd(bubble('vibeos', '<span></span>').querySelector('span'), t.said);
    if (t.failure === 'no model configured') line('that was a stock module — no model was configured');
    else if (t.failure) { const b = bubble('vibeos', '<span class="no"></span> — fell back to a stock module.'); b.querySelector('.no').textContent = t.failure; }
    else if (!t.text) line('the page was closed before this turn finished');
  };

  // The confirmation for a reload_os. Cleared on read so reopening the chat
  // does not repeat it; what booted comes from the loader, not the note.
  // It is the model's reply to the turn that called reload_os — that turn's
  // entry is still open in the log, so the note lands there and is history
  // the next request carries, not a line that vanishes on the boot after.
  const reloadNote = () => {
    try {
      const raw = localStorage.getItem(RELOAD_NOTE);
      if (!raw) return null;
      localStorage.removeItem(RELOAD_NOTE);
      const { note, files } = JSON.parse(raw);
      return { note, files, source: window.__vibeosBoot && window.__vibeosBoot.source };
    } catch { return null; }
  };
  const placeholder = input.placeholder;
  input.disabled = true; input.placeholder = 'loading chat…';
  const loaded = (async () => {
    let restored = null;
    try { restored = await ChatLog.load(); }
    catch (e) { const b = bubble('vibeos', '<span class="no"></span>'); b.querySelector('.no').textContent = 'could not restore ' + ChatLog.PATH + ': ' + e.message; }
    input.disabled = false; input.placeholder = placeholder;
    const note = reloadNote();
    if (restored) turns = restored;
    if (restored && restored.length) {
      const last = restored[restored.length - 1];
      if (note && last && last.role === 'assistant' && !last.text) {
        last.text = 'reloaded ' + (note.files || []).join(', ') + (note.note ? ' — ' + note.note : '');
        last.reload = note;
      }
      for (const t of turns) {
        paintTurn(t);
        const content = ChatLog.content(t);
        if (t.role === 'user') { if (content) history.push({ role: 'user', content }); }
        else if (history.length && history[history.length - 1].role === 'user') history.push({ role: 'assistant', content: content || '(the page was closed before this turn finished)' });
      }
      line(`restored from ${ChatLog.PATH} · ${turns.length} turns`);
      if (note && last && last.reload === note) { await persist(); return; }
    }
    if (note) paintReload(note);
  })();

  const paintChips = () => {
    chips.innerHTML = '';
    chips.hidden = !pending.length;
    pending.forEach((img, i) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.title = `${img.name} ${img.width}×${img.height}`;
      c.innerHTML = '<img alt=""><button class="x" title="Remove">&times;</button>';
      c.querySelector('img').src = img.dataUrl;
      c.querySelector('.x').onclick = () => { pending.splice(i, 1); paintChips(); };
      chips.appendChild(c);
    });
  };
  async function attach(files) {
    for (const f of files) {
      try {
        const img = await Attachments.prepare(f);
        Attachments.check([...pending, img]);
        pending.push(img);
      }
      catch (e) { bubble('vibeos', '<span class="no"></span>').querySelector('.no').textContent = e.message; }
    }
    paintChips();
    input.focus();
  }
  // A paste with no file falls through, so text still lands in the input.
  body.addEventListener('paste', e => {
    const files = Attachments.filesOf(e);
    if (!files.length) return;
    e.preventDefault();
    attach(files);
  });
  body.addEventListener('dragover', e => e.preventDefault());
  body.addEventListener('drop', e => { e.preventDefault(); attach(Attachments.filesOf(e)); });

  async function send() {
    const text = input.value.trim();
    if (!text && !pending.length) return;
    // Pictures put back after a failure can stack past the cap; refuse here
    // rather than let the body grow past what the server will take.
    try { Attachments.check(pending); }
    catch (e) { bubble('vibeos', '<span class="no"></span>').querySelector('.no').textContent = e.message; return; }
    const images = pending.splice(0);
    paintChips();
    input.value = '';
    // A send before the log is read used to write this pair over the whole
    // history, then paint the history under it. The read is awaited before
    // anything is painted or written; a log that could not be read was
    // already reported, and is overwritten.
    await loaded;
    {
      const b = bubble('you', '<span></span>');
      b.firstChild.textContent = text;
      for (const i of images) { const img = document.createElement('img'); img.className = 'shot'; img.alt = ''; img.src = i.dataUrl; b.appendChild(img); }
    }
    const thinking = bubble('vibeos', '<span class="dimmer">thinking…</span>');
    const onStatus = status => { thinking.innerHTML = '<span class="dimmer"></span>'; thinking.querySelector('.dimmer').textContent = String(status); };

    let live = false, failure = '';
    // What came before this turn. The turn itself used to be pushed first and
    // then sent again as the prompt, so every request carried the user's text
    // twice — harmless for text, but with an image it would put a
    // marker right before the actual image.
    const prior = history.slice();
    // The turn is recorded once its fate is known. History stays text: the
    // picture is sent once, and a marker keeps the turn small enough for six
    // of them to ride along with every request — but only a picture the model
    // actually saw gets one. A turn that never reached a model is remembered
    // as its text alone, and an image-only one leaves nothing to remember.
    // The pair goes to the log now, reply still blank: a turn that ends in
    // reload_os never reaches `remember`, and the boot after fills the blank
    // with the reload note.
    const me = { role: 'user', text, images: images.length };
    reply = { role: 'assistant', text: '', cards: [] };
    turns.push(me, reply);
    persist();
    const remember = (sent, said) => {
      me.images = sent ? images.length : 0;
      reply.text = said.slice(0, 1200);
      if (failure) reply.failure = failure;
      persist();
      // An image-only turn has no text to lead with; do not remember a bare newline.
      const turn = ChatLog.content(me);
      if (!turn) return;
      history.push({ role: 'user', content: turn }, { role: 'assistant', content: reply.text });
    };
    // A picture that did not go through returns to the chip row, so the next
    // try — "Add a key", or just pressing Send again — carries it. Before this
    // the chips were cleared before the request, and the retry sent text that
    // talked about a screenshot it no longer had.
    const giveBack = () => { pending.unshift(...images); paintChips(); };

    // Both paths are the agent now. Signing in with ChatGPT proxies through
    // vibeos.sh; a pasted key talks to the provider from this page. Same
    // tools, same prompt, same loop.
    if (Gen.available && (Gen.oauth || Gen.key)) {
      try {
        const result = Gen.oauth
          ? await Gen.generate(text, prior, onStatus, images)
          : await Agent.runWithKey(text, prior, onStatus, images);
        live = true;
        thinking.remove();
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
            const b = bubble('vibeos', '<b></b> <span class="no">refused</span><br><span class="tiny dimmer"></span>');
            b.querySelector('b').textContent = String(item.title); b.querySelector('.dimmer').textContent = String(item.error);
            card({ kind: 'refused', title: item.title, error: String(item.error) });
          } else if (item.kind === 'vm') {
            track('app_generated', { target: 'vm' });
            card({ kind: 'vm', title: item.title, file: item.file, where: item.installed ? 'installed at /mnt/' + item.file : 'not installed — the VM was not running' });
            const b = bubble('vibeos', `<b></b> <span class="req">vm script</span><br>
              <span class="tiny dimmer">${item.installed ? 'installed at <b></b>' : 'not installed — the VM is not running'}</span>
              <div class="row" style="margin-top:8px">
                <button class="btn sm" id="run" ${item.installed ? '' : 'disabled'}>Run it</button>
                <button class="btn sm" id="src">Source</button>
              </div>
              <pre class="out" id="res" style="display:none;margin-top:8px"></pre>`);
            b.querySelector('b').textContent = item.title;
            if (item.installed) b.querySelector('.dimmer b').textContent = '/mnt/' + item.file;
            const res = b.querySelector('#res');
            b.querySelector('#src').onclick = () => { res.style.display = 'block'; res.textContent = item.source; };
            if (item.installed) b.querySelector('#run').onclick = async () => {
              res.style.display = 'block'; res.textContent = 'running…';
              try { res.textContent = (await VM.exec('sh /mnt/' + item.file)) || '(no output)'; }
              catch (e) { res.textContent = e.message; }
            };
          } else {
            track('app_generated', { target: 'browser' });
            const where = [item.saved && item.saved.vm && 'the VM', item.saved && item.saved.folder && Workspace.label].filter(Boolean).join(' and ');
            const headed = item.saved && item.saved.headerAdded && item.saved.headerAdded.length ? ' (header added)' : '';
            bubble('vibeos', `<b></b> <span class="req">window</span><br>
              <span class="tiny dimmer">${where ? 'saved to ' + where + headed : 'opened on the desktop'}</span>`)
              .querySelector('b').textContent = item.title;
            card({ kind: 'window', title: item.title, where: where ? 'saved to ' + where + headed : 'opened on the desktop' });
          }
        }

        if (result.text) {
          renderMd(bubble('vibeos', result.created.length ? '<span class="tiny dimmer"></span>' : '<span></span>').firstChild, result.text);
        }
      } catch (e) {
        failure = e.message;
        thinking.remove();
        giveBack();
        const source = CANNED[pickCanned(text)];
        remember(false, source);
        await openFromSource(source, text, false, failure);
        // The message may carry a slice of a proxy's HTML error page (a
        // Cloudflare 502, an interstitial) — text, never markup.
        { const b = bubble('vibeos', '<span class="no"></span> — fell back to a stock module.'); b.querySelector('.no').textContent = String(failure); }
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
    thinking.remove();
    remember(live, source);
    await openFromSource(source, text, live, failure);
    if (!live) {
      if (failure === 'no model configured') {
        // Offer the key HERE rather than only at boot. Asking on load happens
        // before anyone knows what a key is for; this is the moment someone has
        // just demonstrated they want the thing it unlocks. Measured: 45 people
        // asked the agent with no key on the same day only 12 added one, and
        // the two groups barely overlapped.
        const b = bubble('vibeos', `
          <span class="part">That was a stock module — no model is configured yet.</span>
          <p class="tiny dimmer" style="margin:6px 0 8px">Add a key and I'll build this for real.</p>
          <button class="btn p sm" id="addKeyNow">Add a key</button>`);
        // The stock app opens in its own window, on top of this chat — so the
        // offer can end up buried under the very thing it is offering to
        // improve. Raise the chat and scroll the offer into view.
        const chatWin = log.closest('.win');
        if (chatWin) chatWin.style.zIndex = ++z;
        b.scrollIntoView({ block: 'nearest' });

        b.querySelector('#addKeyNow').onclick = async () => {
          track('key_offer_click');
          await Gen.askForKey();
          if (!Gen.available) return;
          track('key_offer_added');
          b.remove();
          // Retry the same request, now for real. The pictures are already
          // back in the chip row (giveBack), so they go with it this time.
          input.value = text;
          send();
        };
      } else {
        // The message may carry a slice of a proxy's HTML error page (a
        // Cloudflare 502, an interstitial) — text, never markup.
        { const b = bubble('vibeos', '<span class="no"></span> — fell back to a stock module.'); b.querySelector('.no').textContent = String(failure); }
      }
    }
  }

  async function openFromSource(source, text, live, failure) {
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
      const b = bubble('vibeos', `<b></b> <span class="req">vm script</span><br>
        <span class="tiny dimmer">${installed ? 'installed at <b></b>' : 'not installed — the VM is not running'}</span>
        <div class="row" style="margin-top:8px">
          <button class="btn sm" id="run" ${installed ? '' : 'disabled'}>Run it</button>
          <button class="btn sm" id="src">Source</button>
        </div>
        <pre class="out" id="res" style="display:none;margin-top:8px"></pre>`);
      b.querySelector('b').textContent = title;
      if (installed) b.querySelector('.dimmer b').textContent = '/mnt/' + file;
      const res = b.querySelector('#res');
      b.querySelector('#src').onclick = () => { res.style.display = 'block'; res.textContent = source; };
      if (installed) b.querySelector('#run').onclick = async () => {
        res.style.display = 'block'; res.textContent = 'running…';
        try { res.textContent = (await VM.exec('sh /mnt/' + file)) || '(no output)'; }
        catch (e) { res.textContent = e.message; }
      };
      card({ kind: 'vm', title, file, where: installed ? 'installed at /mnt/' + file : 'not installed — the VM was not running' });
    } else {
      const saved = await Apps.save(title, source).catch(() => ({}));
      paintDock();
      const written = saved.source || source;
      const where = [saved.vm && 'the VM', saved.folder && Workspace.label].filter(Boolean).join(' and ');
      const b = bubble('vibeos', `<b></b> <span class="req">window</span><br>
        <span class="tiny dimmer">${where ? 'saved to ' + where : 'not saved — no VM and no workspace'}${saved.headerAdded?.length ? ' (header added)' : ''}</span>
        <div class="row" style="margin-top:8px">
          <button class="btn sm" id="open">Open</button>
          <button class="btn sm" id="src">Source</button>
        </div>
        <pre class="out" id="res" style="display:none;margin-top:8px"></pre>`);
      b.querySelector('b').textContent = title;
      b.querySelector('#src').onclick = () => {
        const r = b.querySelector('#res'); r.style.display = 'block'; r.textContent = written;
      };
      b.querySelector('#open').onclick = () => launchApp({ title, source: written, requires: parseRequires(written) });
      b.querySelector('#open').click();
      card({ kind: 'window', title, where: where ? 'saved to ' + where : 'not saved — no VM and no workspace' });
    }
  }

  body.querySelector('#send').onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  setTimeout(() => input.focus(), 50);
}

// Served both at the root (local dev) and at /app (vibeos.sh, no trailing
// slash). Relative URLs resolve differently in those two cases, so derive the
// directory once rather than guessing.
// BASE is defined by the loader in index.html.
const V86_ASSETS = BASE + 'v86/';

// Three machines. Alpine is the default: a 256 MB ext4 disk cut into 128 KB
// zstd chunks (91 MB on the wire, fetched as the kernel touches them), apk
// works, and it reaches a shell in 20-30 s (measured, Chrome, host load ~20:
// 27 s from localhost, 21 s from CloudFront with the boot.txt prefetch)
// because its initramfs is ours (scripts/alpine/init) and OpenRC runs four
// services. BusyBox is bundled (7 MB ISO, 5-7 s, no package manager). Debian is
// the same streaming trick on a 1 GB disk with apt, and takes minutes. Built
// by scripts/alpine/build.sh and scripts/debian/build.sh.
const DEBIAN_BASE = 'https://d3je35hqch090t.cloudfront.net/debian-3/';
// A build in progress boots from public/alpine-dev/ (git-ignored; build.sh
// copies its output there) by pointing this at new URL('../alpine-dev/', location.href).href.
const ALPINE_BASE = 'https://d3je35hqch090t.cloudfront.net/alpine-2/';
const IMAGES = {
  alpine: {
    id: 'alpine', label: 'Alpine', blurb: 'streamed 91 MB disk, apk works, usually 20-30 s to a shell — longer on a busy machine',
    // The same budget as the bundled image: 20-40 s measured, and a laptop on
    // battery with the tab in the background is slower by more than 2x.
    memoryMB: 128, bootTimeoutMs: 120000,
    preflight: ALPINE_BASE + 'bzImage',
    warm: ALPINE_BASE + 'boot.txt',
    config: () => ({
      bzimage: { url: ALPINE_BASE + 'bzImage' },
      initrd:  { url: ALPINE_BASE + 'initrd' },
      // acpi on, and GPE 1 masked, both measured on Alpine's 6.6 linux-lts:
      // without v86's ACPI tables the kernel reads the MP table and panics in
      // setup_IO_APIC (NULL deref at 0.4s); with them, v86 answers the PCI
      // hotplug GPE with "every slot ejected" and the kernel removes the IDE
      // controller, the NIC and the 9p device one by one, so /dev/sda never
      // appears. acpi_mask_gpe=0x01 keeps the devices; noapic instead hangs
      // the IDE probe waiting for IRQ 14.
      cmdline: 'root=/dev/sda rw rootfstype=ext4 modules=ext4 console=ttyS0 acpi_mask_gpe=0x01 loglevel=3',
      acpi: true,
      hda: { url: ALPINE_BASE + 'chunk.img.zst', async: true, use_parts: true,
             fixed_chunk_size: 128 * 1024, size: 256 * 1024 * 1024 },
    }),
    dhcp: 'ifconfig eth0 up; udhcpc -i eth0 -n -q 2>&1 | tail -1',
    ip: "ifconfig eth0 | grep -o 'inet addr:[0-9.]*' | cut -d: -f2",
    // The same ne2k and the same BusyBox ifconfig as the bundled image: a
    // restored card receives nothing until the driver resets it (see boot).
    netReset: 'ifconfig eth0 down; ifconfig eth0 up',
    // Measured on alpine-2: /sys/class/net/lo/flags is 0x8 after boot (no UP),
    // and a connect to 127.0.0.1 hangs until curl's --max-time, so the
    // Browser's localhost never answered on the default image.
    loopback: 'ifconfig lo up',
    shellLine: 'Then a POSIX shell script for Alpine Linux 3.20 (BusyBox ash, musl). apk works (run apk update first; the network is on): apk add <pkg>. Installed: busybox sh grep sed awk find, curl wget ca-certificates, git nano less. No bash, no glibc — a glibc binary will not run without gcompat. The workspace is at /mnt. Print results to stdout.',
  },
  busybox: {
    id: 'busybox', label: 'BusyBox', blurb: 'tiny: bundled 7 MB ISO, boots in about 10 s, no package manager',
    memoryMB: 64, bootTimeoutMs: 120000,
    config: () => ({ cdrom: { url: V86_ASSETS + 'linux4.iso' } }),
    dhcp: 'udhcpc -i eth0 -n -q 2>&1 | tail -1',
    ip: "ifconfig eth0 | grep -o 'inet addr:[0-9.]*' | cut -d: -f2",
    netReset: 'ifconfig eth0 down; ifconfig eth0 up',
    // linux4.iso boots with lo DOWN (measured: `ifconfig lo` shows no UP flag
    // and a connect to 127.0.0.1 hangs until the timeout instead of being
    // refused), so nothing on localhost — a dev server, the Browser — works
    // until someone brings it up. Debian's systemd does this itself.
    loopback: 'ifconfig lo up',
    shellLine: 'Then a POSIX shell script for BusyBox ash. No bash arrays, no GNU-only flags, no package manager, no network. Available: sh ls cat grep sed awk wc sort head tail cut tr find echo test. The workspace is at /mnt. Print results to stdout.',
  },
  debian: {
    id: 'debian', label: 'Debian', blurb: 'full: streamed 1 GB disk, apt works, slow — 80 to 120 s to a shell',
    memoryMB: 256, bootTimeoutMs: 360000,
    preflight: DEBIAN_BASE + 'bzImage',
    config: () => ({
      bzimage: { url: DEBIAN_BASE + 'bzImage' },
      initrd:  { url: DEBIAN_BASE + 'initrd' },
      // console-getty races the autologin serial getty for ttyS0 and sometimes
      // wins, leaving a login: prompt the desktop cannot get past. Mask it here
      // as well as in the image so an older image still boots usably. getty@tty1
      // is the VGA console: its login: prompt sat in the Machine pane after a
      // boot that had already succeeded on ttyS0, and read as a machine stuck.
      cmdline: 'root=/dev/sda rw console=ttyS0 net.ifnames=0 loglevel=3 systemd.mask=console-getty.service systemd.mask=getty@tty1.service systemd.hostname=vibeos',
      hda: { url: DEBIAN_BASE + 'chunk.img.zst', async: true, use_parts: true,
             fixed_chunk_size: 128 * 1024, size: 1024 * 1024 * 1024 },
    }),
    // udev may rename eth0 to enp0s5 before we get here; ask for whatever is not lo.
    dhcp: 'IF=$(ls /sys/class/net | grep -v ^lo$ | head -1); dhclient -1 $IF 2>&1 | tail -1',
    ip: "ip -4 -o addr show $(ls /sys/class/net | grep -v ^lo$ | head -1) | grep -o 'inet [0-9.]*' | cut -d' ' -f2",
    netReset: 'IF=$(ls /sys/class/net | grep -v ^lo$ | head -1); ip link set $IF down; ip link set $IF up',
    shellLine: 'Then a bash script for Debian 12. apt-get works (run apt-get update first; the network is on). Common tools are installed: bash coreutils grep sed awk find curl wget git nano. python3 is NOT installed by default. The workspace is at /mnt. Print results to stdout.',
  },
};

// A CORS proxy is the natural fit here and it is what v86's `fetch` backend is
// designed around — but that backend is NOT in the published npm build (0.5.445
// ships wisp, ws and inbrowser only; `fetch` exists on master). So the working
// option today is WISP: a websocket protocol carrying real TCP, which is
// strictly more capable anyway — TLS and apt work over it, and they cannot over
// a CORS proxy. Off by default; a VM with no network is the safer default.
// Our own WISP server, running as a Vercel function next to the site. The
// public one stays available as a fallback while ours is in beta.
// Our own relay, verified end to end: the guest gets a lease and reaches the
// internet through it. The public one stays as a fallback.
const NET_DEFAULT = 'wisps://vibeos.sh/api/wisp';
const NET_OURS = 'wisps://wisp.mercurywork.shop/';

/* ---------- snapshots: the machine as a file ---------------------------

   v86 can serialise the whole machine — RAM, CPU, devices, the 9p mount —
   into one ArrayBuffer, and restore it into a freshly constructed emulator.
   That makes a booted machine restorable in seconds instead of re-running
   the kernel, and it is what lets an apt install outlive a reload: the
   Debian disk is streamed and its writes live only in memory.

   One snapshot per image, at system/vm-<image>.state in the workspace, or
   in private browser storage when no workspace is open. gzip on the way in:
   the state is RAM plus every device, and for BusyBox that includes the
   7.7 MB CD image v86 keeps in memory — measured 51.2 MB of state, 30.9 MB
   on disk, 1.2 s to save. The gzip trailer carries the raw size, so a stat
   reports both without reading the file back.

   Every verb takes the store to use — {root, where, private} — and none
   resolves one for itself. The store a boot looks in is pinned on the VM
   for the life of that boot (VM.store), and that is the only store a
   snapshot is ever written to: resolving it at write time meant that a
   workspace folder waiting to be re-granted at boot (so the boot looked in
   private storage, found nothing and ran the kernel) and re-granted within
   the 10 s auto-snapshot had a fresh cold machine written over the good
   snapshot in the folder.

   When the snapshot was taken is the instant BEFORE save_state, and it
   travels inside the file, in the gzip header's MTIME (bytes 4–7, seconds
   since the epoch, the field the format defines for "when the original
   was made"; CompressionStream leaves it zero). The file's own mtime is
   after save_state + gzip + write — 1.2 s on BusyBox, 4.7 s on Debian —
   so a disk edit inside that window read as newer than the machine and
   was 'differs' forever after a restore instead of being pushed in. A
   sidecar json would carry milliseconds, but it is a second file that a
   copy, a sync or a hand edit can separate from the state it describes;
   the header cannot be. The cost is one-second resolution: an edit that
   landed on disk in the same second the snapshot started counts as after
   it, and the disk is the truth in that second too.
   -------------------------------------------------------------------- */

const Snapshots = {
  path(image) { return 'system/vm-' + image + '.state'; },

  // Where a snapshot would go right now: the open workspace, else private
  // browser storage.
  async current() {
    if (Workspace.open) return { root: Workspace.root, where: Workspace.label, private: Workspace.private };
    const priv = await this.privateStore();
    if (priv) return priv;
    throw new Error('nowhere to keep a snapshot: no workspace is open and this browser has no private storage');
  },

  async privateStore() {
    if (!navigator.storage || !navigator.storage.getDirectory) return null;
    return { root: await navigator.storage.getDirectory(), where: 'private browser storage', private: true };
  },

  same(a, b) { return a.root === b.root ? Promise.resolve(true) : a.root.isSameEntry(b.root); },

  // null when there is none. Sizes are bytes: on disk, and the raw state.
  // A file too short to be gzip, or without its magic, is reported rather
  // than thrown: a 0-byte file made the trailer DataView throw RangeError,
  // which the boot read as "could not look for a snapshot" and the Machine
  // tab showed raw, with no Forget button for the file that caused it.
  async stat(image, store) {
    const st = await Workspace.statPath(this.path(image), store.root);
    if (!st) return null;
    const info = { image, bytes: st.size, rawBytes: null, savedAt: null, where: store.where, corrupt: '' };
    const head = this.header(new Uint8Array(await st.file.slice(0, 10).arrayBuffer()), st.size);
    if (head.corrupt) info.corrupt = head.corrupt;
    else {
      info.rawBytes = new DataView(await st.file.slice(-4).arrayBuffer()).getUint32(0, true);
      info.savedAt = head.takenAt;
    }
    return info;
  },

  // One verdict on the first bytes for stat and read alike: a file read()
  // would take that stat() calls unusable is a machine restored without a
  // time, and every disk file would then read as newer than it.
  header(head, size) {
    if (size === 0) return { corrupt: 'the snapshot file is empty (0 bytes)' };
    if (size < 18 || head[0] !== 0x1f || head[1] !== 0x8b) return { corrupt: `the snapshot file is not what this desktop writes (${size} bytes, no gzip header)` };
    const takenAt = new DataView(head.buffer, head.byteOffset).getUint32(4, true) * 1000;
    if (!takenAt) return { corrupt: 'the snapshot does not say when it was taken (written by an older desktop), so a disk edit since could not be told from a file it holds' };
    return { takenAt };
  },

  async read(image, store) {
    const gz = await Workspace.readBytesPath(this.path(image), store.root);
    const head = this.header(gz.subarray(0, 10), gz.length);
    if (head.corrupt) throw new Error(head.corrupt);
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  },

  async write(image, state, store, takenAt) {
    if (!Number.isInteger(takenAt) || takenAt <= 0) throw new Error('a snapshot must say when it was taken');
    const stream = new Blob([state]).stream().pipeThrough(new CompressionStream('gzip'));
    const gz = new Uint8Array(await new Response(stream).arrayBuffer());
    const seconds = Math.floor(takenAt / 1000);
    new DataView(gz.buffer, gz.byteOffset, gz.byteLength).setUint32(4, seconds, true);
    await Workspace.writeBytesPath(this.path(image), gz, store.root);
    return { image, bytes: gz.length, rawBytes: state.byteLength, savedAt: seconds * 1000, where: store.where };
  },

  async forget(image, store) {
    if (!(await Workspace.statPath(this.path(image), store.root))) return false;
    await Workspace.removePath(this.path(image), store.root);
    return true;
  },
};

const APT_INSTALL = /\bapt(-get)?\b[^|;&]*\binstall\b/;

// The shell prompt at the end of the serial line: busybox `~% ` / `~# `,
// debian `root@vibeos:~# `.
const PROMPT_TAIL = /(?:[\w.@()-]*:)?~[%#$]\s*$/;
// The same prompt where it is cut off captured output, with the hostname
// spelt out. PROMPT_TAIL's class before the colon is right for "is the shell
// back" and wrong for "where does the output end": it swallowed output that
// shares the prompt line — `printf no-trailing-newline` on Alpine came back
// "" and `printf "a\nb\nc"` came back "a\nb", because
// "no-trailing-newlinevibeos:" is all word characters. Every image we build
// is hostname vibeos; BusyBox prints no hostname.
const PROMPT = '(?:(?:root@)?vibeos:)?~ ?[%#$]';
const PROMPT_STRIP = new RegExp(PROMPT + '\\s*$');
const PROMPT_AT_START = new RegExp('^' + PROMPT + '\\s*');

// What one exec returns, from the serial bytes since it typed, or null while
// the command is still running. Pure, so scripts/e2e/exec-parse.mjs can run
// it over chunks captured verbatim from the runs that broke it.
//
// Done only when THIS exec's mark comes back as a line of its own. The shell
// echoes the sentinel command first (` echo __VOSn__`), and those bytes also
// contain `__VOSn__\r\n`; a quiet machine prints the echo and the real line
// inside one 120 ms poll, so `includes(mark)` worked by luck. Under load the
// poll saw the echo alone, the exec resolved before its command had run,
// `from` for the next exec landed before this mark's real line, and a check
// for any `__VOS\d+__` then ended that one on the spot too. Measured, 5 runs
// on a loaded laptop (cold boots 10–17 s): `echo alive` returned
// "__VOS2__\nalive"; a dhcp exec ended on the previous mark and left udhcpc
// running while the next three commands were echoed by the kernel tty, each
// returning "" — 7 checks failed per run, 3 runs of 5. The same rule is what
// keeps a timed-out command's late sentinel from ending the NEXT exec with
// the wrong output, and the typed echo (`^Cecho again`, landed while the tty
// was still cooked) from passing for the result.
//
// Output ends where the shell echoes back the sentinel command we typed. CUT
// there rather than dropping the line containing it: a command whose output
// has no trailing newline — `cat` on almost any file — leaves the prompt and
// that echo on the SAME line as the last line of output, so dropping the
// line dropped the output with it. The echo may arrive with the prompt in
// front of it: `from` is taken the instant the previous exec sees its
// sentinel, and the shell prints the next `~% ` a beat later, so a queued
// exec's chunk can start `~% printf x` rather than `printf x` (2 runs in 5
// under load returned "~% printf no-newline\nno-newline"). And cut at the
// LAST echo before the mark's own line, not the first: under load the next
// exec's bytes arrived while the shell was still leaving its line editor, so
// the kernel tty echoed both lines at once (`printf x\r\n echo __VOSn__\r\n`)
// and the shell then read and echoed them again with prompts — cutting at
// the first copy returned "" (once in 11 runs, on a 12.6 s cold boot).
function execResult(chunk, cmd, mark) {
  // On the cleaned bytes, and after a bare \r too: bash's readline answers
  // Enter with `\e[?2004l\r` before the command's first output byte.
  const clean = chunk.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');   // colour and bracketed-paste
  const done = new RegExp('(^|[\\r\\n])' + mark + '\\r?\\n');
  if (!done.test(clean)) return null;
  const body = clean.slice(0, done.exec(clean).index);
  const cut = body.lastIndexOf('echo ' + mark);
  return (cut >= 0 ? body.slice(0, cut) : body)
    .split(/\r?\n/)
    .filter(l => l.replace(PROMPT_AT_START, '').trim() !== cmd.trim())   // the terminal echoing what we typed
    .filter(l => l.trim() !== 'echo ' + mark)                             // the kernel's copy of the sentinel line
    .filter(l => !/^__VOS\d+__$/.test(l.trim()))                          // a previous mark, if `from` still landed before it
    .join('\n')
    // Strip only the prompt itself, not the line it sits on.
    .replace(PROMPT_STRIP, '')
    .trim();
}

// One socket, as far as v86 is concerned, over as many real ones as it takes.
//
// The relay is a Vercel function with maxDuration 800, so every ~13 minutes the
// WebSocket closes under a guest that is still using it. v86's WISP adapter
// does redial — libv86.js register_ws: onclose → setTimeout(register_ws, 10 s)
// — but measured with the socket closed by hand: a wget started inside those
// 10 s timed out, and nothing told the desktop the network was back, so the
// pill said "network dropped" and the pane offered a restart for a network
// that had been working again for minutes. This redials in 0.5 s instead, in
// place: v86 keeps the object it constructed, the native socket is swapped
// underneath it, and 'close' reaches v86 only once redialing has failed for
// good (five tries, 0.5/1/2/2/2 s apart).
//
// WISP semantics after a redial: the relay's stream table lived in the
// function invocation that just ended, so every guest TCP connection that was
// open at the drop is gone on the server side. Frames from CONNECT to CLOSE
// are watched here to know their ids, and once the new socket is open v86 is
// handed a CLOSE (reason 0x03, network error) for each of them, so the guest
// sees those connections fail now rather than after a TCP timeout. Frames v86
// sent during the gap are held and replayed on the new socket, minus the dead
// streams', so a connection the guest opened while this was dialing goes
// through. Open connections are dropped; new ones work. The Network pane says
// exactly that.
class RelaySocket {
  static delays = [500, 1000, 2000, 2000, 2000];

  // `probe` is for the sockets v86 itself constructs every 10 s after this has
  // given up: one dial, no backoff, so a relay that is down costs one failed
  // connection per 10 s rather than five, and a relay that comes back is found.
  // A probe that opens is the relay socket from then on, with the full
  // backoff: measured before, it kept delays = [] for its whole life, so the
  // next ~800 s expiry got no in-place redial at all and the pane said five
  // redials had failed when none had been tried.
  constructor(url, Native, { onLink, probe = false }) {
    this.url = url;
    this.Native = Native;
    this.onLink = onLink;
    this.probe = probe;
    this.delays = probe ? [] : RelaySocket.delays;
    this.__inner = null;            // the native socket of the moment; a test hook, and named so
    this.handlers = { open: new Set(), message: new Set(), close: new Set(), error: new Set() };
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
    this._binaryType = 'blob';
    this.opened = false;            // v86 has seen 'open'; from here on it is told about no close but the last
    this.ended = false;             // closed by v86, or given up: nothing dials again
    this.attempt = 0;
    this.redials = 0;
    this.timer = null;
    this.lastError = null;
    this.streams = new Set();       // WISP stream ids with a CONNECT sent and no CLOSE either way
    this.dropped = new Set();       // the streams open when the current gap began
    this.held = [];                 // frames v86 sent during the gap
    // A probe says nothing until it knows: 'connecting' every 10 s would turn
    // a dead relay into a pill that flickers.
    if (!probe) this.onLink('connecting');
    this.dial();
  }

  dial() {
    const inner = new this.Native(this.url);
    inner.binaryType = this._binaryType;
    this.__inner = inner;
    inner.addEventListener('open', e => { if (inner === this.__inner) this.opened_(inner, e); });
    inner.addEventListener('message', e => {
      if (inner !== this.__inner) return;
      this.watch(e.data, true);
      this.dispatch('message', e);
    });
    inner.addEventListener('error', e => {
      if (inner !== this.__inner) return;
      if (this.ended) this.dispatch('error', e); else this.lastError = e;
    });
    inner.addEventListener('close', e => { if (inner === this.__inner) this.closed_(e); });
  }

  opened_(inner, e) {
    this.attempt = 0;
    this.lastError = null;
    if (this.probe) { this.probe = false; this.delays = RelaySocket.delays; }
    if (!this.opened) {
      this.opened = true;
      this.onLink('open');
      this.dispatch('open', e);
      return;
    }
    this.redials++;
    // Fail the streams the relay forgot before anything else moves, then let
    // through what the guest did while we were dialing.
    const dropped = this.dropped; this.dropped = new Set();
    for (const id of dropped) {
      this.streams.delete(id);
      this.dispatch('message', new MessageEvent('message', { data: RelaySocket.closeFrame(id, 3).buffer }));
    }
    const held = this.held; this.held = [];
    for (const frame of held) {
      if (!dropped.has(RelaySocket.streamId(frame))) inner.send(frame);
    }
    this.onLink('open');
  }

  closed_(e) {
    if (this.ended) { this.dispatch('close', e); return; }
    const delay = this.delays[this.attempt];
    if (delay === undefined) {
      this.ended = true;
      // v86's onclose only schedules its own redial and keeps its connection
      // table, so guest connections open at the drop would hang until a TCP
      // timeout. We know their ids: fail them now, then say the link died.
      for (const id of new Set([...this.dropped, ...this.streams])) {
        this.dispatch('message', new MessageEvent('message', { data: RelaySocket.closeFrame(id, 3).buffer }));
      }
      this.dropped = new Set(); this.streams.clear();
      this.onLink('dead');
      if (this.lastError) this.dispatch('error', this.lastError);
      this.dispatch('close', e);
      return;
    }
    // A socket that has never opened is still connecting, not reconnecting:
    // the desktop must not say the link was lost when there was none, nor
    // that open connections were dropped.
    if (this.attempt === 0 && this.opened) {
      this.dropped = new Set(this.streams);
      this.onLink('reconnecting');
    }
    this.attempt++;
    this.timer = setTimeout(() => { this.timer = null; this.dial(); }, delay);
  }

  // Between real sockets v86 has been told nothing, so this answers what v86
  // has been told: OPEN. Not for v86's sake — its wisps adapter never reads
  // readyState (send_packet calls wispws.send whatever the state, and it
  // redials from onclose alone) — but for whoever else asks, and it is
  // send() below, not this, that holds frames across the gap.
  get readyState() {
    if (this.opened && !this.ended) return 1;
    return this.__inner.readyState;
  }
  get bufferedAmount() {
    return this.__inner.bufferedAmount + this.held.reduce((n, f) => n + f.byteLength, 0);
  }
  get binaryType() { return this._binaryType; }
  set binaryType(v) { this._binaryType = v; this.__inner.binaryType = v; }
  get protocol() { return this.__inner.protocol; }
  get extensions() { return this.__inner.extensions; }

  send(data) {
    this.watch(data, false);
    const gap = this.opened && !this.ended && this.__inner.readyState !== 1;
    if (gap) this.held.push(data); else this.__inner.send(data);
  }

  close(code, reason) {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    this.held = [];
    // A dial timer was pending: nothing is open, so there is nothing to close
    // and no close event will come. Say so ourselves, as a real socket would.
    if (this.__inner.readyState === 3) { this.dispatch('close', { code: code || 1000, reason: reason || '', wasClean: true }); return; }
    this.__inner.close(code, reason);
  }

  addEventListener(type, fn) {
    if (!this.handlers[type]) throw new Error('RelaySocket: no such event: ' + type);
    this.handlers[type].add(fn);
  }
  removeEventListener(type, fn) {
    if (!this.handlers[type]) throw new Error('RelaySocket: no such event: ' + type);
    this.handlers[type].delete(fn);
  }
  dispatch(type, e) {
    const h = this['on' + type];
    if (typeof h === 'function') h.call(this, e);
    this.handlers[type].forEach(fn => fn.call(this, e));
  }

  // The host a relay URL names, as the URL parser sees it — the only thing
  // that decides whether a dial is the relay. v86 hands the string through
  // verbatim but for the scheme (register_ws: replace 'wisps://' → 'wss://'),
  // so 'wisps://VIBEOS.sh/api/wisp' is dialed as 'wss://VIBEOS.sh/…' while
  // new URL() lowercases; a substring match on the lowercased host missed it
  // and the guest got a native socket nobody watched. wisps: is not a special
  // scheme, so its host would come back verbatim too: everything is parsed as
  // https:. null for a string that is not a URL.
  static host(url) {
    try { return new URL(String(url).replace(/^(wisps?|wss?):/, 'https:')).host; } catch { return null; }
  }

  // WISP frames: byte 0 is the type, bytes 1-4 the stream id, little-endian.
  // 1 CONNECT, 2 DATA, 3 CONTINUE, 4 CLOSE.
  static streamId(frame) {
    const u8 = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
    return u8.length >= 5 ? new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(1, true) : null;
  }
  static closeFrame(id, reason) {
    const f = new Uint8Array(6);
    const v = new DataView(f.buffer);
    v.setUint8(0, 4); v.setUint32(1, id, true); v.setUint8(5, reason);
    return f;
  }
  watch(frame, incoming) {
    const u8 = frame instanceof Uint8Array ? frame : frame instanceof ArrayBuffer ? new Uint8Array(frame) : null;
    if (!u8 || u8.length < 5) return;
    const id = RelaySocket.streamId(u8);
    if (u8[0] === 1 && !incoming) this.streams.add(id);
    else if (u8[0] === 4) this.streams.delete(id);
  }
}

const VM = {
  state: 'off',
  net: '',                 // '' = no relay, 'connecting' (lease or relay dial pending), 'no lease', then the link: connected | reconnecting | disconnected | unwatched
  ip: '',                  // the guest's lease, once it has one
  leased: false,           // dhcp has answered, one way or the other; net follows the link from here
  link: '',                // what the relay socket reports: connecting | open | reconnecting | dead
  linkWasOpen: false,      // the relay has been open at least once this boot; 'reconnected' means something only then
  netNote: '',             // shown next to the state once a redial has happened
  relaySocket: null,       // the RelaySocket v86 holds; .__inner is the native socket of the moment
  bootedRelay: '',         // the relay URL this boot gave v86; the setting can change under a running machine
  // Networking is on by default now. An absent setting means "use the default
  // relay"; the explicit string 'off' is how someone turns it off, so that is
  // distinguishable from never having chosen.
  get relay() {
    let stored = null;
    try { stored = localStorage.getItem('vibeos-net'); } catch {}
    if (stored === 'off') return '';
    return stored || NET_DEFAULT;
  },
  setRelay(url) {
    try { localStorage.setItem('vibeos-net', url || 'off'); } catch {}
  },
  // Which Linux boots. Persisted like the relay; takes effect on restart.
  get image() {
    const chosen = this.chosenImage;
    return chosen || 'alpine';
  },
  // The image someone picked in Settings, or null for the default. The default
  // may fall back when it cannot boot; a choice never silently does.
  get chosenImage() {
    let stored = null;
    try { stored = localStorage.getItem('vibeos-image'); } catch {}
    return IMAGES[stored] ? stored : null;
  },
  setImage(id) {
    if (!IMAGES[id]) throw new Error('unknown image: ' + id);
    try { localStorage.setItem('vibeos-image', id); } catch {}
  },            // off | unavailable | booting | ready | failed
  emu: null,
  screen: null,            // created once, moved between windows
  serial: '',
  seq: 0,
  listeners: new Set(),

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  // No paintVM() here any more: the machine announces its state and does not
  // know a DOM exists. The menu-bar painter subscribes like any other listener.
  // Listeners get (state, transition): emit() is a repaint — the lease, a
  // snapshot — and only set() to a different state is a transition. A boot
  // used to announce 'ready' three times (set, set again, emit after the
  // lease), and every listener that did work on 'ready' — the guest CLI
  // install, the first sync — did it three times, queuing execs ahead of the
  // lease and in the window where a kernel line can land inside one.
  emit(transition = false) { this.listeners.forEach(fn => { try { fn(this.state, transition); } catch {} }); },
  set(state, detail) {
    const changed = state !== this.state;
    this.state = state; this.detail = detail || '';
    this.emit(changed);
  },

  async available() {
    try { return (await fetch(V86_ASSETS + 'libv86.js', { method: 'HEAD' })).ok; }
    catch { return false; }
  },

  // v86 owns the relay WebSocket internally and exposes no event for it, so
  // the constructor is wrapped: a dial to the relay's host gets a RelaySocket,
  // which redials under v86 and reports the link here; everything else gets
  // the native socket. Wrapped once per page — a restart used to reset the
  // flag and wrap the wrapper — and the host is read per dial from the URL
  // this boot gave v86, not the setting: that can be edited while the machine
  // runs, and v86 dials what it was given. Hosts are compared parsed and
  // equal, not by substring of the lowercased setting in the verbatim dial —
  // 'wisps://VIBEOS.sh/api/wisp' got a native socket that way.
  watchRelay() {
    if (window.__wsWrapped) return;
    window.__wsWrapped = true;
    const Native = window.WebSocket;
    const self = this;
    window.WebSocket = function (url, protocols) {
      const host = self.bootedRelay && RelaySocket.host(self.bootedRelay);
      if (!host || RelaySocket.host(url) !== host || protocols !== undefined) {
        return protocols === undefined ? new Native(url) : new Native(url, protocols);
      }
      self.relaySocket = new RelaySocket(String(url), Native, {
        probe: self.link === 'dead',
        onLink: link => self.setLink(link),
      });
      return self.relaySocket;
    };
    window.WebSocket.prototype = Native.prototype;
    Object.assign(window.WebSocket, Native);
  },

  setLink(link) {
    const was = this.link;
    this.link = link;
    // Only a link that was open has connections to drop: a first dial that
    // failed and then opened is a connection, not a reconnection.
    if (link === 'open' && this.linkWasOpen && (was === 'reconnecting' || was === 'dead')) {
      this.netNote = 'reconnected; open connections were dropped';
    }
    if (link === 'open') this.linkWasOpen = true;
    this.syncNet();
  },

  // net is what the pill and the Network pane show. Boot owns it until dhcp
  // has answered; from then on it follows the link. The link comes first: a
  // dead relay is 'disconnected' whether or not the guest holds a lease (v86
  // answers DHCP itself, so a lease says nothing about the relay), and 'no
  // lease' is only for a relay that is up with nothing to route to.
  //
  // No link at all means v86 dialed a socket the wrapper did not claim. That
  // was a throw here, which landed in boot()'s try after set('ready') and
  // flipped a running, networked machine to 'failed' — with the emulator still
  // running and boot()'s guard ready to build a second one over it. It is a
  // state now: the guest may well have the internet, and nothing here will
  // notice when it loses it.
  syncNet() {
    if (this.state !== 'ready' || !this.leased) return;
    const byLink = { connecting: 'connecting', reconnecting: 'reconnecting', dead: 'disconnected' };
    if (byLink[this.link]) this.net = byLink[this.link];
    else if (this.link === 'open') this.net = this.ip ? 'connected' : 'no lease';
    else if (this.link === '') {
      this.net = 'unwatched';
      console.error(new Error('relay ' + JSON.stringify(this.bootedRelay) + ' is configured but v86 dialed no socket the wrapper claimed; the link cannot be watched'));
    }
    else throw new Error('unknown relay link state: ' + JSON.stringify(this.link));
    this.emit();
  },

  // Five redials have failed, or the image is being switched: the machine has
  // to come back. Apps survive because they are files on disk; VM state does
  // not.
  async teardown() {
    // v86's network adapter arms a 10 s redial in onclose (register_ws) that
    // destroy() never clears, and destroy() is async. Left alone, the dead
    // emulator kept dialing through the wrapper and the desktop showed the
    // zombie's link instead of the new guest's. Measured: two open relay
    // sockets after a restart. discard() disarms it before tearing down.
    // The machine is 'off' the moment it is detached, not once destroy() has
    // finished: destroy waits for the CPU loop (up to 5 s for a wedged one),
    // and a retry clicked in that window read 'ready' from the machine it
    // had just torn down. The wait stays: the next boot must not build a
    // second emulator over one that is still stopping.
    const destroyed = this.discard();
    this.screen = null; this.serial = '';
    this.net = ''; this.ip = ''; this.leased = false; this.link = ''; this.linkWasOpen = false; this.netNote = '';
    this.relaySocket = null; this.bootedRelay = '';
    window.__v86loaded = null;
    this.set('off');
    await destroyed;
  },
  // No image named while the default's fallback is running: reboot the
  // BusyBox that works, not the Alpine that just failed — retryFallback is
  // the one path that retries it. A choice made in Settings still wins.
  async restart(imageId) {
    const stayOnFallback = !imageId && !!this.fallback && !this.chosenImage;
    const id = stayOnFallback ? this.bootedImage : (imageId || this.image);
    await this.teardown();
    if (!stayOnFallback) this.fallback = null;
    await this.boot(id);
  },
  // The Machine pane's "retry Alpine" after a fallback. Not setImage: the
  // person did not choose Alpine, the default is still the default.
  retryFallback() {
    if (!this.fallback) throw new Error('nothing fell back');
    return this.restart(this.fallback.from);
  },

  // destroy() waits for the CPU loop to notice it should stop; a machine that
  // is wedged never gets there, and a restart must not hang on it.
  async discard() {
    const emu = this.emu;
    this.emu = null;
    if (!emu) return;
    // The adapter's onclose arms a 10 s setTimeout(register_ws) that destroy()
    // never clears; a discarded machine kept dialing through the wrapper.
    try { if (emu.network_adapter) emu.network_adapter.register_ws = () => {}; } catch {}
    // And the RelaySocket that machine dialed: closed, it neither redials nor
    // reports a link, so a machine discarded after a failed restore cannot
    // paint 'reconnecting' over the cold boot's socket.
    const rs = this.relaySocket; this.relaySocket = null;
    try { if (rs) rs.close(); } catch {}
    try { emu.stop(); } catch {}
    try { await Promise.race([emu.destroy(), new Promise(r => setTimeout(r, 5000))]); } catch {}
  },

  // Snapshot bookkeeping, all per boot: where the boot looked, whether this
  // machine came from a snapshot and how old it was, why a restore was
  // refused, what the last snapshot did.
  store: null,          // {root, where, private} the boot consulted; the only store this boot writes
  storeError: '',       // why store is null
  restored: false,
  restoredFrom: null,   // {savedAt} of the snapshot this machine came from
  keptSnapshot: false,  // the boot found a snapshot and left it alone (?safe=1, recovering): nothing this boot may write over it
  restoreError: '',
  snapshotInfo: null,   // {image, bytes, rawBytes, savedAt, where, reason, ms}
  snapshotError: '',
  AUTO_SNAPSHOT_MS: 10000,
  _written: new Set(),  // /mnt names the guest, or an app save, wrote this boot

  construct(image, autostart) {
    this.emu = new V86({
      wasm_path: V86_ASSETS + 'v86.wasm',
      memory_size: image.memoryMB * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      bios:     { url: V86_ASSETS + 'seabios.bin' },
      vga_bios: { url: V86_ASSETS + 'vgabios.bin' },
      ...image.config(),
      ...(this.bootedRelay ? { net_device: { type: 'ne2k', relay_url: this.bootedRelay } } : {}),
      filesystem: {},        // the 9p mount at /mnt — the file bridge
      screen_container: this.screen,
      autostart,
      disable_speaker: true,
    });
    window.__v86 = this.emu;
    this.emu.add_listener('serial0-output-byte', b => {
      this.serial += String.fromCharCode(b);
      // Not while an exec is reading: its `from` is an index into this
      // string, and a trim under it either cut the output silently (350 KB
      // came back as its last 150 KB) or left `from` past the end, so the
      // exec never saw its mark and timed out.
      if (this._execFrom === null && this.serial.length > 200000) this.serial = this.serial.slice(-100000);
    });
  },

  // Cold: run the kernel and wait for the shell prompt on the serial console.
  async coldBoot(image) {
    this.construct(image, true);
    await new Promise((res, rej) => {
      const t0 = Date.now();
      const tick = setInterval(() => {
        if (/~[%#$] $/.test(this.serial) || /~[%#$] /.test(this.serial.slice(-40))) {
          clearInterval(tick); res();
        } else if (Date.now() - t0 > image.bootTimeoutMs) {
          clearInterval(tick); rej(Object.assign(new Error('the VM never reached a shell prompt'), { fallbackReason: 'timeout' }));
        }
      }, 500);
    });
  },

  // Warm: the same machine config, the CPU held until the state is in, then
  // run. The prompt was printed before the snapshot, so there is nothing to
  // wait for on the serial line; instead the sentinel protocol exec relies on
  // is exercised once, with a real command, and "ready" means it answered.
  // The guest's clock stopped at the snapshot, so it is set from the host's.
  // A machine that restores but cannot run a command is not restored.
  // The whole thing is under the image's boot timeout, like coldBoot: a
  // restore measures 0.3–0.5 s (BusyBox) and 4.7 s (Debian), but neither
  // emulator-loaded nor restore_state has a timeout of its own, so a state
  // that never loaded sat at 'vm starting…' forever, with Forget unreachable
  // behind it. Now it is a refused snapshot like any other: discarded, cold
  // boot, and the reason in the pill.
  async restore(image, snap) {
    const t0 = Date.now();
    const state = await Snapshots.read(image.id, this.store);
    this.construct(image, false);
    // Pinned: once the timeout below has won, this.emu is null and then the
    // cold boot's machine, and a restore_state that resolves late must not
    // run that one or send its probe down that one's serial line.
    const emu = this.emu;
    const work = (async () => {
      await new Promise(res => emu.add_listener('emulator-loaded', res));
      await emu.restore_state(state);
      if (this.emu !== emu) throw new Error('superseded by a cold boot');
      await emu.run();
      this._restoring = true;
      try { return await this._exec(`date -s @${Math.floor(Date.now() / 1000)} >/dev/null 2>&1; echo restored-ok`, 20000); }
      finally { this._restoring = false; }
    })();
    work.catch(() => {});   // a late failure after the timeout has already won is not unhandled
    let timer;
    const out = await Promise.race([work, new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`the snapshot did not restore within ${image.bootTimeoutMs / 1000}s`)), image.bootTimeoutMs);
    })]).finally(() => clearTimeout(timer));
    if (!/restored-ok/.test(out)) throw new Error('the restored machine did not answer on the serial line: ' + JSON.stringify(out.slice(0, 80)));
    this.restored = true;
    this.restoredFrom = { savedAt: snap.savedAt };
    track('vm_restored', { image: image.id, seconds: Math.round((Date.now() - t0) / 1000), mb: Math.round(snap.bytes / 1048576) });
  },

  // The default image lives on a CDN. A network that blocks it, or a host too
  // loaded to reach a prompt inside the budget, used to end at 'vm failed'
  // where the bundled BusyBox always worked. So the default — never an image
  // someone chose in Settings — falls back to BusyBox once, and says so.
  fallback: null,          // { from, reason } while a fallback is booting or running
  fellBack: false,         // once per page: the retry after a fallback shows 'failed'
  _execFrom: null,         // where the running exec's output starts in `serial`; the buffer is not trimmed under it
  async boot(imageId) {
    if (this.state === 'booting' || this.state === 'ready') return;
    if (!(await this.available())) return this.set('unavailable');
    const id = imageId || this.image;
    if (!IMAGES[id]) throw new Error('unknown image: ' + id);
    this.set('booting');
    this.bootStarted = Date.now();
    this.store = null; this.storeError = ''; this.restored = false; this.restoredFrom = null;
    this.keptSnapshot = false; this.restoreError = ''; this.snapshotError = ''; this._written = new Set();
    try {
      await loadScriptOnce(V86_ASSETS + 'libv86.js');
      this.watchRelay();

      this.screen = document.createElement('div');
      this.screen.tabIndex = 0;
      this.screen.style.cssText = 'background:#000;height:100%;overflow:auto;outline:none';
      this.screen.innerHTML = `<div style="white-space:pre;font:14px/1.15 'JetBrains Mono',monospace;color:var(--titletext);padding:6px"></div><canvas style="display:none"></canvas>`;
      this.screen.addEventListener('click', () => this.screen.focus());

      const image = IMAGES[id];
      this.bootedImage = id;
      this.bootedRelay = this.relay;
      // v86 retries a missing disk forever; check the CDN once so a bad URL or
      // a blocked network fails in a second with a reason, not in six minutes.
      if (image.preflight) {
        const ok = await fetch(image.preflight, { method: 'HEAD' }).then(r => r.ok, () => false);
        if (!ok) throw Object.assign(new Error(`${image.label} image is not reachable at ${image.preflight}`), { fallbackReason: 'unreachable' });
      }
      // v86 fetches a streamed disk one chunk at a time, when the kernel asks
      // and not before, so a boot is ~100 round trips in a row: the same build
      // booted in 27 s from localhost and 55 s from CloudFront. boot.txt is
      // the list a boot touches (scripts/alpine/warm.mjs); fetching them all
      // at once lands them in the HTTP cache, where v86's own requests find
      // them. Not awaited: v86 asks for whatever is missing anyway.
      if (image.warm) {
        const base = image.warm.slice(0, image.warm.lastIndexOf('/') + 1);
        fetch(image.warm).then(r => r.ok ? r.text() : Promise.reject(new Error(r.status + ' for ' + image.warm)))
          .then(list => Promise.all(list.trim().split('\n').map(name =>
            fetch(base + name).then(r => r.arrayBuffer(), () => null))))
          .catch(e => console.warn('warm list skipped:', e.message));
      }

      // The store is pinned here, and the boot always looks in it, even when
      // it will not restore: what is there decides whether this boot may
      // snapshot at all (below). The recovery rule from the loader applies
      // to the restore: a boot that is already recovering, or asked to be
      // plain, runs the machine from scratch and leaves the snapshot where it
      // is. And a snapshot that fails to restore is forgotten and the machine
      // cold-boots — it must never be a dead machine that fails the same way
      // on every reload.
      const b = window.__vibeosBoot || {};
      let snap = null;
      try {
        this.store = await Snapshots.current();
        snap = await Snapshots.stat(image.id, this.store);
      } catch (e) {
        this.store = null;
        this.storeError = this.restoreError = 'could not look for a snapshot: ' + e.message;
      }
      const kept = !!snap && (b.recovering || b.safe);
      this.keptSnapshot = kept;
      if (snap && !kept) {
        try { await this.restore(image, snap); }
        catch (e) {
          this.restoreError = e.message;
          track('vm_restore_failed', { image: image.id, error: String(e.message).slice(0, 80) });
          await this.discard();
          this.serial = '';
          try { await Snapshots.forget(image.id, this.store); }
          catch (e2) { this.restoreError += ' (and it could not be deleted: ' + e2.message + ')'; }
        }
      }
      if (!this.restored) await this.coldBoot(image);

      this.hookWrites();
      this.bootSeconds = (Date.now() - this.bootStarted) / 1000;
      // Announced once. A second set('ready') used to sit inside the relay
      // block below, and everything that runs on 'ready' ran twice.
      this.set('ready');
      track('vm_ready', { seconds: Math.round(this.bootSeconds), image: this.bootedImage, restored: this.restored });
      // Not in boot's failure path: the machine is up whether or not lo came
      // up, and a timeout or a Terminal Ctrl-C landing on this exec used to
      // flip a ready machine to 'failed'.
      if (image.loopback) {
        try { await this.exec(image.loopback); }
        catch (e) { console.warn(`loopback stayed down: ${e.message}`); }
      }

      // The image brings the NIC up but does not ask for a lease, so a
      // configured relay would look broken until someone ran udhcpc by hand.
      // After a restore this runs again on purpose: the relay socket is v86's
      // and did not survive the snapshot — the guest still holds its old
      // lease, but every TCP connection it had is gone and the new socket is
      // what its traffic now goes through. Renewing is how that gets checked
      // rather than assumed; whatever it reports is what the pill says.
      // The link is bounced first. Measured on BusyBox: after a restore the
      // guest's DHCP discovers do leave the card (four net0-send events on
      // v86's bus) and nothing ever comes back, until the driver resets the
      // device — ifconfig down/up — after which the next request leases in
      // under a second. A restored ne2k receives nothing until it is reset.
      if (this.bootedRelay) {
        this.net = 'connecting';
        this.emit();
        try {
          if (this.restored) await this.exec(image.netReset, 15000);
          await this.exec(image.dhcp, 45000);
          const ip = (await this.exec(image.ip)).trim();
          this.ip = /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : '';
        } catch { this.ip = ''; }
        this.leased = true;
        this.syncNet();
      }

      // A cold boot earns a snapshot once it has settled, so the next load of
      // this image is a restore. Not after a restore: that would rewrite the
      // same state every boot for nothing. And not over a snapshot the boot
      // found and left alone (?safe=1, recovering): that one holds the
      // installs; a fresh kernel written over it is what safe mode promised
      // not to do.
      if (!this.restored && this.store && !kept) {
        setTimeout(() => { if (this.ready() && this.bootedImage === image.id) this.snapshot('first boot').catch(() => {}); }, this.AUTO_SNAPSHOT_MS);
      }
    } catch (e) {
      const seconds = Math.round((Date.now() - this.bootStarted) / 1000);
      const reachedReady = this.state === 'ready';
      const canFallBack = !reachedReady && !!e.fallbackReason && id !== 'busybox'
        && !this.chosenImage && !this.fellBack;
      // vm_failed is what the visitor sees; a default that falls back and
      // boots is vm_fallback, not a failure, or the two would double count.
      if (!canFallBack) {
        track('vm_failed', { image: id, seconds });
        return this.set('failed', e.message);
      }
      this.fellBack = true;
      this.fallback = { from: id, reason: e.fallbackReason };
      track('vm_fallback', { from: id, reason: e.fallbackReason });
      await this.teardown();
      await this.boot('busybox');
    }
  },

  refuseSnapshot(reason) {
    this.snapshotError = `not saved after ${reason}: this boot left the snapshot in ${this.store.where} alone (?safe=1 or recovery), and nothing is written over it`;
    this.emit();
  },

  // Serialised behind exec: a state saved while a command is mid-flight would
  // restore into a shell that is waiting for output nobody will read.
  snapshot(reason) {
    const run = () => this._snapshot(reason || 'manual');
    const next = (this._queue || Promise.resolve()).then(run, run);
    this._queue = next.catch(() => {});
    return next;
  },

  // The store this boot looked in, and only if it still is the store: a
  // workspace opened since boot means the next boot will look somewhere
  // else, and writing here would either overwrite a snapshot the boot never
  // saw or leave one nobody will read.
  async snapshotStore() {
    if (!this.store) throw new Error('not saved: ' + this.storeError);
    const now = await Snapshots.current();
    if (!(await Snapshots.same(now, this.store))) {
      throw new Error(`not saved: the workspace changed since boot (the boot looked for a snapshot in ${this.store.where}; one saved now would go to ${now.where}, which was not checked). Reload, and snapshots go to ${now.where}.`);
    }
    return this.store;
  },

  async _snapshot(reason) {
    if (!this.ready()) throw new Error('the VM is not running');
    const t0 = Date.now();
    try {
      const store = await this.snapshotStore();
      const takenAt = Date.now();
      const state = await this.emu.save_state();
      const info = await Snapshots.write(this.bootedImage, state, store, takenAt);
      this.snapshotInfo = { ...info, reason, ms: Date.now() - t0 };
      this.snapshotError = '';
      track('vm_snapshot', { image: this.bootedImage, reason, mb: Math.round(info.bytes / 1048576), seconds: Math.round((Date.now() - t0) / 1000) });
      this.emit();
      return this.snapshotInfo;
    } catch (e) {
      this.snapshotError = e.message;
      this.emit();
      throw e;
    }
  },

  async forgetSnapshot(image = this.bootedImage || this.image, store = this.store) {
    if (!store) throw new Error(this.storeError || 'the machine has not booted, so there is no snapshot store yet');
    const gone = await Snapshots.forget(image, store);
    if (this.snapshotInfo && this.snapshotInfo.image === image) this.snapshotInfo = null;
    this.emit();
    return gone;
  },

  // After a restore /mnt holds the snapshot's copy of the folder. A file
  // edited on disk since then was shadowed by that stale copy: the diff
  // called it 'differs' and never moved it, and the dock ran the old source.
  // On a cold boot the machine came up empty and the disk copy won; this is
  // that rule for a restored machine — the disk is newer than the snapshot,
  // and the machine has not written the file itself this boot.
  staleSinceRestore(name, diskModified) {
    return !!this.restoredFrom && diskModified > this.restoredFrom.savedAt && !this._written.has(name);
  },


  // ---- push-based sync, VM -> folder ----------------------------------
  // v86's 9p filesystem is plain JavaScript, so its write path can be wrapped.
  // That turns "poll every 60s" into "react when the VM actually writes",
  // which is the useful half of what a FUSE mount would give us. The other
  // half (folder -> VM on change) has no browser equivalent: there is no
  // directory-watch API, so that direction still polls.
  // Kept for the boot path to call; the listeners decide what a write means.
  hookWrites() {
    const fs = this.emu && this.emu.fs9p;
    if (!fs || fs.__hooked) return;
    fs.__hooked = true;
    // v86's Write does not touch the inode mtime (only CreateInode and a
    // guest setattr do), so which files this machine has written is kept
    // here, by name, for staleSinceRestore. /mnt is flat: root is inode 0.
    const nameOf = id => { for (const [n, i] of fs.inodes[0].direntries) if (i === id && n !== '.' && n !== '..') return n; return null; };
    const schedule = (name) => {
      if (this.suppress) return;          // don't echo our own folder -> VM pushes
      if (name) this._written.add(name);
      // Listeners first and unconditionally: a subscriber that wants to react
      // to a specific file cannot afford the 800ms debounce meant for syncing.
      this._writeListeners.forEach(f => { try { f(); } catch {} });
      clearTimeout(this._flush);
      this._flush = setTimeout(() => this._writeSettled.forEach(f => { try { f(); } catch {} }), 800);
    };
    for (const name of ['Write', 'Unlink', 'ChangeSize']) {
      const orig = fs[name];
      if (typeof orig !== 'function') continue;
      fs[name] = function (...args) {
        const written = name === 'Unlink' ? args[1] : nameOf(args[0]);
        const r = orig.apply(this, args); schedule(written); return r;
      };
    }
  },

  /* ---- the machine interface -------------------------------------------

     Eight verbs is the whole of what the rest of the desktop needs from the
     VM: exec, readFile, writeFile, listFiles, onWrite, state+events,
     lifecycle, and screen. They were not written down before, so eight call
     sites reached past this object into VM.emu or the window.__v86 global,
     and a global back door is not an interface.

     Every verb here is async and takes and returns bytes or strings, so the
     whole surface could later sit behind postMessage without a single caller
     changing. screen is the one member that cannot: it is a DOM node the
     emulator owns and the UI adopts.
     -------------------------------------------------------------------- */

  _writeListeners: [],   // fire on every write, undebounced
  _writeSettled: [],     // fire once writes stop, for sync-shaped work

  ready() { return this.state === 'ready' && !!this.emu; },

  async readFile(path) {
    if (!this.emu) throw new Error('the VM is not running');
    return this.emu.read_file(path);
  },

  // create_file goes through v86's set_data, never the hooked fs.Write, so
  // a `// @target vm` create_app or the VM half of Apps.save left the ledger
  // empty and Sync.auto pushed the disk copy over it after a restore. A
  // quiet write (Sync.push, the guest CLI) IS the disk copy and stays out.
  async writeFile(path, bytes) {
    if (!this.emu) throw new Error('the VM is not running');
    const r = await this.emu.create_file(path, bytes);
    if (!this.suppress) this._written.add(path.replace(/^.*\//, ''));   // by root name, as the write hook keys it
    return r;
  },

  async readText(path) {
    return new TextDecoder().decode(await this.readFile(path));
  },

  async writeText(path, text) {
    return this.writeFile(path, new TextEncoder().encode(text));
  },

  // null, not [], when the machine cannot answer — callers already distinguish
  // "no files" from "no VM" and would otherwise report an empty disk.
  // Every entry under /mnt, recursively, as {parentid, name, type}: parentid 0
  // is the mount root and type is the inode's S_IFMT class. Only 'file' is
  // readable through read_file: a directory, a symlink (even one pointing at a
  // readable file — 9p does not follow it), a broken symlink and a FIFO all
  // throw 'File not found' (measured on busybox).
  listFiles() {
    const fs = this.emu && this.emu.fs9p;
    if (!fs) return null;
    const list = [];
    try { fs.GetRecursiveList(0, list); } catch { return null; }
    return list.filter(e => e.name && !/^\./.test(e.name))
               .map(e => ({ ...e, type: inodeType(fs.GetInode(fs.Search(e.parentid, e.name)).mode) }));
  },

  onWrite(fn, { settled = false } = {}) {
    const target = settled ? this._writeSettled : this._writeListeners;
    target.push(fn);
    return () => {
      const i = target.indexOf(fn);
      if (i >= 0) target.splice(i, 1);
    };
  },

  // Writes we make ourselves must not look like the guest writing.
  async writeQuietly(path, bytes) {
    this.suppress = true;
    try { return await this.writeFile(path, bytes); }
    finally { setTimeout(() => { this.suppress = false; }, 50); }
  },

  // A real command, with output captured. A sentinel marks the end so we never
  // have to guess where output stops.
  // One serial line, so one command at a time: a second exec while the first
  // is still running (boot's own dhcp, a user typing during a slow apt) would
  // interleave both outputs and each would claim the other's lines.
  exec(cmd, timeoutMs = 20000) {
    checkTimeout(timeoutMs);
    const run = () => this._exec(cmd, timeoutMs);
    const next = (this._queue || Promise.resolve()).then(run, run);
    this._queue = next.catch(() => {});
    // An install only lives in memory (the Debian disk is streamed), so it
    // earns a snapshot. Here, on the one path every shell goes through — the
    // agent's vm_exec, the Terminal window, api.shell — so "after every apt
    // install" is true of all three, not only the agent's. By command shape,
    // not by result: apt's exit status is not in the output exec returns.
    // Queued behind exec, which means an install backgrounded with & is
    // snapshotted while still running; the finished state is caught by the
    // next apt command or by Snapshot now.
    // Under the same gate as the first-boot snapshot: a boot that left the
    // snapshot alone (?safe=1, recovering) does not write over it here either,
    // and says so where the Machine tab reads.
    if (APT_INSTALL.test(cmd)) next.then(() => this.keptSnapshot ? this.refuseSnapshot('apt install') : this.snapshot('apt install').catch(() => {}), () => {});   // the failure is on VM.snapshotError
    return next;
  },

  // Ctrl-C on the serial line: SIGINT to whatever the shell is running. The
  // exec waiting on that command must reject too: ash drops the ` echo mark`
  // queued behind an interrupted command (measured in exec-timeout.mjs), so
  // without this stamp the Terminal's 600 s exec would sit out its whole
  // timeout on a line that was free after one keypress.
  interrupt() {
    if (this.state !== 'ready') throw new Error('Linux is not running yet.');
    this.interruptedAt = Date.now();
    this.emu.serial0_send('\x03');
  },

  // The shell is back at its line editor once the serial line ends in its
  // prompt. Bounded: a program that ignores SIGINT never gets there.
  async _atPrompt(maxMs) {
    const t0 = Date.now();
    while (!PROMPT_TAIL.test(this.serial.slice(-80))) {
      if (Date.now() - t0 > maxMs) return false;
      await new Promise(r => setTimeout(r, 60));
    }
    return true;
  },

  async _exec(cmd, timeoutMs) {
    // _restoring: the one command that decides whether a restored machine
    // gets to be 'ready' at all, so it runs before the state says so.
    if (this.state !== 'ready' && !this._restoring) throw new Error('Linux is not running yet.');
    const mark = `__VOS${++this.seq}__`;
    const from = this.serial.length;
    this._execFrom = from;
    try {
      return await this._collect(cmd, mark, from, timeoutMs);
    } finally {
      this._execFrom = null;
    }
  },

  async _collect(cmd, mark, from, timeoutMs) {
    this.emu.serial0_send(`${cmd}\n echo ${mark}\n`);
    const t0 = Date.now();
    for (;;) {
      const out = execResult(this.serial.slice(from), cmd, mark);
      if (out !== null) return out;
      const interrupted = this.interruptedAt > t0;
      if (interrupted || Date.now() - t0 > timeoutMs) {
        // The command is still holding the one serial line; leave it and every
        // later exec waits behind it. Ctrl-C frees it, and ash drops the
        // ` echo mark` it had buffered behind the command (measured: the mark
        // of an interrupted exec never reaches the line). Then wait for the
        // prompt before the next exec types: bytes sent while the tty is still
        // cooked are echoed once by the tty and again by the line editor, and
        // the tty's echo of ` echo mark` used to pass for the result.
        // Someone else's Ctrl-C (the Terminal's) already sent the \x03; the
        // same wait applies, and the error says whose it was.
        if (!interrupted) this.interrupt();
        const back = await this._atPrompt(3000);
        const err = new Error((interrupted
          ? `interrupted: ${cmd} — Ctrl-C on the machine's shell`
          : `timed out after ${timeoutMs / 1000}s: ${cmd} — sent Ctrl-C to the machine's shell`)
          + (back ? '' : ', and the prompt did not come back within 3s'));
        err.interrupted = interrupted;
        throw err;
      }
      await new Promise(r => setTimeout(r, 120));
    }
  },
};

function loadScriptOnce(src) {
  if (window.__v86loaded) return window.__v86loaded;
  window.__v86loaded = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
  return window.__v86loaded;
}

const VM_LABEL = {
  off: 'vm off', unavailable: 'no vm', booting: 'vm starting…',
  ready: 'vm ready', failed: 'vm failed',
};

const FALLBACK_REASON = { unreachable: 'could not be fetched', timeout: 'took too long' };
// 'alpine could not be fetched — running busybox': the whole story in the pill.
function fallbackLine() {
  const f = VM.fallback;
  if (!f) return '';
  const what = `${f.from} ${FALLBACK_REASON[f.reason]}`;
  return VM.state === 'ready' ? `${what} — running ${VM.bootedImage}` : `${what} — starting ${IMAGES.busybox.label.toLowerCase()}`;
}

function paintVM() {
  const dot = document.getElementById('lxDot'), txt = document.getElementById('lxText');
  if (!dot) return;
  const dropped = VM.state === 'ready' && VM.net === 'disconnected';
  const redialing = VM.state === 'ready' && VM.net === 'reconnecting';
  txt.textContent = dropped ? 'network dropped' : redialing ? 'reconnecting…'
    : VM.fallback && (VM.state === 'ready' || VM.state === 'booting') ? fallbackLine()
    : VM.state === 'ready' && VM.restored ? `${VM.bootedImage} restored`
    : VM.state === 'ready' ? `${VM.bootedImage} ready` : VM_LABEL[VM.state];
  dot.className = 'dot' + (dropped || redialing ? ' warn' : VM.state === 'ready' ? '' :
                           VM.state === 'booting' ? ' warn' : ' off');
  const bootNote = () => VM.bootedImage === 'debian' ? 'Booting Debian — streams the disk as it goes, a few minutes.'
    : VM.bootedImage === 'alpine' ? 'Booting Alpine from the CDN — usually 20-30 s, longer on a busy machine.'
    : `Booting ${IMAGES[VM.bootedImage].label} — under half a minute.`;
  document.getElementById('lxPill').title =
    VM.state === 'ready'   ? ((VM.fallback ? `${IMAGES[VM.fallback.from].label} ${FALLBACK_REASON[VM.fallback.reason]}; ${IMAGES[VM.bootedImage].label} is running instead. Settings › Machine can retry.  `
                                : VM.restored ? `${IMAGES[VM.bootedImage].label} restored from its snapshot in ${VM.bootSeconds.toFixed(1)}s. api.shell() runs real commands.`
                                : 'The VM is up. api.shell() runs real commands.')
                              + (VM.net ? '  Network: ' + VM.net + (VM.ip ? ', ' + VM.ip : '') : '  No network.')
                              + (VM.restoreError ? '  Snapshot discarded: ' + VM.restoreError : '')) :
    VM.state === 'booting' ? (VM.fallback ? `${fallbackLine()} instead.` : bootNote()) :
    VM.state === 'failed'  ? ('Boot failed: ' + (VM.detail || '')) :
    VM.state === 'unavailable' ? 'The 11 MB of v86 assets are not served here.' :
    'Click to start the VM.';
}

// Switching images is a restart into a different streamed disk, not a
// download; whatever was installed lives in memory and goes away with it.
function imageSwitch() {
  const box = document.createElement('div');
  box.style.cssText = 'padding:8px 10px;border-bottom:1px solid var(--barline);display:flex;flex-direction:column;gap:6px';
  const current = VM.bootedImage || VM.image;
  box.innerHTML = `
    <span class="small">Running <b>${IMAGES[current].label}</b> <span class="dimmer">· ${IMAGES[current].blurb}</span></span>
    ${Object.entries(IMAGES).map(([id, im]) => `
      <div style="display:flex;gap:8px;align-items:baseline">
        <button class="btn sm${id === current ? ' p' : ''}" id="img-${id}" ${id === current ? 'disabled' : ''}>${id === current ? 'running' : 'switch to'} ${im.label}</button>
        <span class="tiny dimmer">${im.blurb}${id === VM.image && id !== current ? ' · boots next time' : ''}</span>
      </div>`).join('')}
    <span class="tiny dimmer">switching restarts the machine; packages you installed live in memory and go away with it</span>`;
  if (VM.fallback) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:baseline';
    const note = document.createElement('span');
    note.className = 'small';
    note.id = 'fallbackNote';
    note.textContent = fallbackLine();
    const retry = document.createElement('button');
    retry.className = 'btn sm'; retry.id = 'retryFallback';
    retry.textContent = 'retry ' + IMAGES[VM.fallback.from].label;
    retry.disabled = VM.state !== 'ready';
    retry.onclick = () => { retry.disabled = true; retry.textContent = 'restarting…'; VM.retryFallback(); };
    row.append(note, retry);
    box.prepend(row);
  }
  Object.keys(IMAGES).forEach(id => {
    box.querySelector('#img-' + id).onclick = async (e) => {
      // Whether anyone actually reaches for a package manager, and whether the
      // streamed images boot for real people, was unmeasured — it shipped blind.
      track('image_switch', { to: id });
      e.target.disabled = true; e.target.textContent = 'restarting…';
      VM.setImage(id);
      await VM.restart();
    };
  });
  return box;
}

const fmtMB = bytes => (bytes / 1048576).toFixed(1) + ' MB';

// The machine as a file: what is saved, where, how big, and the two verbs.
// Sizes come from the file, not from memory, so what this shows is what the
// next boot will actually find.
function snapshotBox() {
  const box = document.createElement('div');
  box.style.cssText = 'padding:8px 10px;border-bottom:1px solid var(--barline);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  const image = VM.bootedImage || VM.image;
  const paint = async () => {
    // The store the boot looked in, not whatever is open now: that is the
    // one the next boot reads and the only one this boot writes.
    let snap = null, lookupError = VM.store ? '' : (VM.storeError || 'the machine has not booted yet');
    if (VM.store) { try { snap = await Snapshots.stat(image, VM.store); } catch (e) { lookupError = e.message; } }
    // A folder open at boot means the boot never looked in private storage;
    // a snapshot left there (from a boot while the folder was waiting to be
    // re-granted, or before it was chosen) is listed so it can be forgotten
    // rather than sitting invisible.
    let orphan = null, priv = null;
    if (VM.store && !VM.store.private) {
      try { priv = await Snapshots.privateStore(); orphan = priv && await Snapshots.stat(image, priv); } catch {}
    }
    const last = VM.snapshotInfo && VM.snapshotInfo.image === image ? VM.snapshotInfo : null;
    const describe = s => `<b>${fmtMB(s.bytes)}</b> <span class="dimmer">(${fmtMB(s.rawBytes)} of machine state) · saved ${new Date(s.savedAt).toLocaleTimeString()} · in ${s.where}`;
    box.innerHTML = `
      <span class="small" id="snapText">${lookupError ? `<span class="no">no snapshot store: ${lookupError}</span>`
        : snap && snap.corrupt ? `<span class="no">Snapshot in ${snap.where} is unusable: ${escHtml(snap.corrupt)}.</span> <span class="dimmer">The next boot will discard it and run the kernel; Forget does it now.</span>`
        : snap ? `Snapshot ${describe(snap)}${last ? ' · ' + last.reason + ', ' + (last.ms / 1000).toFixed(1) + 's' : ''}${VM.restored ? ' · <b>this machine was restored from it</b>' : ''}</span>`
        : `<span class="dimmer">No snapshot of ${IMAGES[image].label} yet — one is taken ${VM.AUTO_SNAPSHOT_MS / 1000}s after a cold boot, and after every apt install.</span>`}</span>
      <button class="btn p sm" id="snapNow" ${VM.ready() ? '' : 'disabled'}>Snapshot now</button>
      ${snap ? '<button class="btn sm" id="snapForget">Forget snapshot</button>' : ''}
      ${orphan ? `<span class="small" id="snapOrphan" style="flex-basis:100%">Also a snapshot ${orphan.corrupt ? `in private browser storage that is unusable: ${escHtml(orphan.corrupt)}` : describe(orphan)}</span> <span class="dimmer">— the boot looked in ${VM.store.where} and not there, so nothing reads it.</span>
          <button class="btn sm" id="snapOrphanForget">Forget that one</button></span>` : ''}
      ${VM.snapshotError ? `<span class="tiny no" style="flex-basis:100%">last snapshot failed: ${escHtml(VM.snapshotError)}</span>` : ''}
      ${VM.restoreError ? `<span class="tiny no" style="flex-basis:100%">the snapshot could not be restored, so it was discarded and the machine cold-booted: ${escHtml(VM.restoreError)}</span>` : ''}`;
    // restoreError can quote the serial line — guest bytes — hence the escape above.
    box.querySelector('#snapNow').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'saving…';
      track('snapshot_click');
      try { await VM.snapshot('manual'); } catch {}   // the error is on VM.snapshotError, painted below
      paint();
    };
    const forget = box.querySelector('#snapForget');
    if (forget) forget.onclick = async () => {
      track('snapshot_forget_click');
      try { await VM.forgetSnapshot(image); } catch (e) { VM.snapshotError = e.message; }
      paint();
    };
    const forgetOrphan = box.querySelector('#snapOrphanForget');
    if (forgetOrphan) forgetOrphan.onclick = async () => {
      track('snapshot_forget_click', { orphan: true });
      try { await VM.forgetSnapshot(image, priv); } catch (e) { VM.snapshotError = e.message; }
      paint();
    };
  };
  paint();
  return box;
}

function ConsoleApp(body) {
  // Raw machine console: boot and kernel output. A debug surface, kept apart
  // from the Terminal so command output is not buried in boot spam.
  body.style.padding = '0';
  const render = () => {
    if (VM.state === 'ready' && VM.screen) {
      body.innerHTML = '';
      const hint = document.createElement('div');
      hint.className = 'tiny dimmer';
      hint.style.cssText = 'padding:6px 10px;border-bottom:1px solid var(--barline)';
      hint.textContent = 'Machine console — boot and kernel output. Run commands in the Terminal.';
      body.appendChild(hint);
      body.appendChild(imageSwitch());
      body.appendChild(snapshotBox());
      body.appendChild(VM.screen);
      return;
    }
    body.style.padding = '14px';
    body.innerHTML = VM.state === 'unavailable'
      ? `<h3>The VM isn't served here</h3><p class="small muted">Needs ~11 MB of assets this page cannot fetch cross-origin. Run it locally.</p>`
      : VM.state === 'failed'
        ? `<p class="no small">VM failed: ${VM.detail || 'unknown'}</p>`
        : `<p class="small muted">Starting the machine…</p>`;
  };
  const off = VM.on(render); render();
  body.closest('.win').querySelector('.tl.r').addEventListener('click', () => {
    off();
    if (VM.screen && VM.screen.parentNode === body) body.removeChild(VM.screen);
  });
}

function TerminalApp(body) {
  // Its own transcript. Commands run through VM.exec(), so this shows what you
  // typed and what came back — never the boot log.
  body.style.padding = '0';
  body.innerHTML = `
    <div id="tout" class="mono" style="padding:10px 12px;font-size:12.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word"></div>
    <div class="row" style="position:sticky;bottom:0;gap:6px;padding:8px 10px;border-top:1px solid var(--barline);background:var(--panel)">
      <span class="mono dimmer" style="font-size:12.5px">$</span>
      <input type="text" id="tin" autocomplete="off" spellcheck="false"
             style="flex:1;border:0;background:transparent;padding:2px 0;font-family:'JetBrains Mono',monospace;font-size:12.5px;color:var(--text)" />
    </div>`;
  const out = body.querySelector('#tout'), input = body.querySelector('#tin');
  const hist = []; let hpos = 0;

  const line = (text, cls) => {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    out.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  };
  const ready = () => VM.state === 'ready';

  if (!ready()) {
    const waiting = line('waiting for the machine…', 'dimmer');
    const off = VM.on(() => {
      if (ready()) { waiting.textContent = 'machine ready — type a command'; off(); input.focus(); }
      else if (VM.state === 'failed' || VM.state === 'unavailable') {
        waiting.textContent = 'the machine is not available'; waiting.className = 'no'; off();
      }
    });
    body.closest('.win').querySelector('.tl.r').addEventListener('click', off);
  }

  async function run(cmd) {
    line('$ ' + cmd, 'dimmer');
    if (!ready()) return line('the machine is not running', 'no');
    const pending = line('…', 'dimmer');
    try {
      // 600 s, not exec's 20 s default: a typed `apk add` or `git clone` is
      // the user's to wait on, and Ctrl-C below is the way out of it.
      const res = await VM.exec(cmd, 600000);
      pending.remove();
      if (res) line(crCollapse(res));
    } catch (e) { pending.remove(); if (!e.interrupted) line(e.message, 'no'); }
  }

  input.addEventListener('keydown', async e => {
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'c') {
      // What a terminal does with Ctrl-C: SIGINT to whatever holds the line.
      // The exec waiting on it rejects as interrupted and run() prints nothing
      // for that; this ^C is the whole record of it, like on a tty.
      e.preventDefault();
      if (!ready()) return;
      line('^C', 'dimmer');
      VM.interrupt();
    } else if (e.key === 'Enter') {
      const cmd = input.value.trim();
      if (!cmd) return;
      hist.push(cmd); hpos = hist.length; input.value = '';
      await run(cmd);
    } else if (e.key === 'ArrowUp' && hpos > 0) {
      e.preventDefault(); input.value = hist[--hpos] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); hpos = Math.min(hpos + 1, hist.length); input.value = hist[hpos] || '';
    }
  });
  setTimeout(() => input.focus(), 50);
}

const Sync = {
  timer: null,
  every: 60,          // seconds; 0 = off
  last: null,         // {at, moved, conflicts} of the most recent auto run
  watchers: new Set(),

  onRun(fn) { this.watchers.add(fn); return () => this.watchers.delete(fn); },

  start(seconds = this.every) {
    // The VM used to call Sync.flushFromVM by name from inside its write hook,
    // which meant the machine knew about the sync layer. Now Sync asks the
    // machine to tell it when writes settle, and the VM names nobody.
    if (!this._subscribed) {
      this._subscribed = VM.onWrite(() => this.flushFromVM(), { settled: true });
    }
    this.every = seconds;
    clearInterval(this.timer); this.timer = null;
    if (!seconds) { this.watchers.forEach(f => f()); return; }
    this.timer = setInterval(async () => {
      if (VM.state !== 'ready' || !Workspace.open) return;
      try {
        const r = await this.auto();
        if (!r.error) this.last = { at: new Date(), moved: r.moved, conflicts: r.conflicts };
      } catch { /* a failed tick must not kill the timer */ }
      this.watchers.forEach(f => f());
    }, seconds * 1000);
    this.watchers.forEach(f => f());
  },

  // The mirror is flat: a regular file at the root of /mnt is data/<name> or
  // apps/<name>.js, and nothing else moves. The 9p list is recursive, so
  // `mkdir /mnt/sub; echo x > /mnt/sub/x` used to put `sub` and a bare `x` in
  // the diff; readFile('sub') throws 'File not found', auto() died there, and
  // every name sorted after it (zz.txt, measured) never reached the folder —
  // inside the 60 s timer, which swallows the throw. A symlink or a FIFO at
  // the root wedged it the same way once directories were filtered, so the
  // filter is on the inode type, not on "is not a directory".
  vmFiles() {
    const all = VM.listFiles();
    return all && all.filter(e => e.parentid === 0 && e.type === 'file');
  },

  // The root entries that filter drops, as {name, type}, so the Sync pane and
  // list_apps can say "sub/ stays in the machine" instead of listing nothing.
  unmirrored() {
    const all = VM.listFiles();
    return all ? all.filter(e => e.parentid === 0 && e.type !== 'file')
                    .map(e => ({ name: e.name, type: e.type }))
                    .sort((a, b) => a.name.localeCompare(b.name)) : [];
  },

  async diff() {
    const vm = this.vmFiles();
    if (vm === null) return { error: 'The VM is not running — open the Terminal window first.' };
    if (!Workspace.open) return { error: 'No workspace open — pick a folder first.' };

    const ws = await Workspace.listAll();
    const names = [...new Set([...ws.map(f => f.name), ...vm.map(f => f.name)])].sort();
    const rows = [];
    for (const name of names) {
      const onDisk = ws.find(f => f.name === name);
      const inWs = !!onDisk;
      const inVm = vm.some(f => f.name === name);
      let state = 'same';
      if (inWs && !inVm) state = 'push';
      else if (!inWs && inVm) state = 'pull';
      else {
        // Both sides have it; compare bytes. These are small text files, so a
        // full compare is cheaper than maintaining a hash index. A difference
        // on a restored machine that only the disk has touched since the
        // snapshot is 'stale', not a conflict: the folder is the truth there.
        try {
          const a = await Workspace.readAny(name);
          const b = await VM.readFile(name);
          state = (a.length === b.length && a.every((v, i) => v === b[i])) ? 'same'
            : VM.staleSinceRestore(name, onDisk.modified) ? 'stale' : 'differs';
        } catch { state = 'differs'; }
      }
      rows.push({ name, inWs, inVm, state });
    }
    return { rows, unmirrored: this.unmirrored() };
  },

// Called by the VM's write hook, debounced. Only moves VM -> folder, and
  // only files that are safe to move; anything conflicting is left for the
  // diff view. Sets VM.suppress so the folder -> VM direction cannot echo.
  async flushFromVM() {
    if (VM.state !== 'ready' || !Workspace.open || this.busy) return;
    this.busy = true;
    try {
      const d = await this.diff();
      if (d.error) return;
      let moved = 0;
      for (const r of d.rows) {
        if (r.state === 'pull') { await this.pull(r.name); moved++; }
      }
      if (moved) {
        this.last = { at: new Date(), moved, conflicts: d.rows.filter(x => x.state === 'differs').length, live: true };
        this.watchers.forEach(f => f());
      }
    } catch { /* never let a flush failure wedge the hook */ }
    finally { this.busy = false; }
  },

  async push(name) {
    const bytes = await Workspace.readAny(name);
    await VM.writeQuietly(name, bytes);
  },
  async pull(name) {
    const bytes = await VM.readFile(name);
    await Workspace.writeAny(name, bytes);
  },

  // Auto mode moves only the unambiguous ones. Anything that changed on both
  // sides is left alone and stays visible as a conflict.
  async auto() {
    const d = await this.diff();
    if (d.error) return d;
    let moved = 0;
    for (const r of d.rows) {
      if (r.state === 'push' || r.state === 'stale') { await this.push(r.name); moved++; }
      else if (r.state === 'pull') { await this.pull(r.name); moved++; }
    }
    return { moved, conflicts: d.rows.filter(r => r.state === 'differs').length };
  },
};

/* ---------- where apps actually live ----------------------------------

   The VM is the source of truth. Generated apps are written into it first,
   and mirrored out to the folder on disk so they survive the VM and can be
   opened by the native build. When the VM is down the folder stands in, so
   the desktop still works — it just says which one it is reading.
   -------------------------------------------------------------------- */

const Apps = {
  get source() {
    const vm = VM.state === 'ready', folder = Workspace.open;
    return vm && folder ? 'vm+folder' : vm ? 'vm' : folder ? 'folder' : 'none';
  },

  // BOTH sources, merged — not whichever is preferred. Preferring the VM meant
  // that after a reload the dock was empty: the machine comes back blank, so
  // every app the user had built was missing from the desktop while sitting
  // safely in the folder on disk. They came back only when the 60s sync tick
  // happened to push them in. Files are the durable copy; the VM is a cache of
  // them, and a cold cache must not read as an empty disk.
  //
  // Returns { apps, unlisted }: apps carry the header the agent writes and go
  // in the dock; unlisted are .js files without one, or that could not be
  // read, each with the reason.
  async list() {
    const byName = new Map();

    if (Workspace.open) {
      for (const f of await Workspace.listApps().catch(() => [])) byName.set(f.name, f);
    }
    if (VM.state === 'ready') {
      for (const f of (Sync.vmFiles() || []).filter(f => f.name.endsWith('.js'))) {
        const disk = byName.get(f.name);
        // The folder wins when the machine's copy is the snapshot's and the
        // disk was edited after it — the dock ran the old source otherwise.
        if (disk && disk.modified && VM.staleSinceRestore(f.name, disk.modified)) continue;
        // Otherwise the VM wins on a name collision: it is where the agent just wrote.
        try { byName.set(f.name, { source: await VM.readText(f.name) }); }
        catch (e) { byName.set(f.name, { error: e.message }); }
      }
    }
    const apps = [], unlisted = [];
    for (const [name, f] of byName) {
      const c = classifyApp(name, f);
      (c.reason ? unlisted : apps).push(c);
    }
    const byNameAsc = (a, b) => a.name.localeCompare(b.name);
    return { apps: apps.sort(byNameAsc), unlisted: unlisted.sort(byNameAsc) };
  },

  // Write to the VM first, then mirror to disk. Returns what actually happened
  // rather than a boolean, so the UI can say so instead of implying both —
  // including the source as written, since the header may have been added.
  async save(title, source) {
    const file = (title || 'app').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase().slice(0, 40) + '.js';
    const headed = ensureHeader(title, source);
    const out = { file, vm: false, folder: false, headerAdded: headed.added, source: headed.source };
    if (VM.state === 'ready') {
      try { await VM.writeText(file, headed.source); out.vm = true; } catch {}
    }
    if (Workspace.open) {
      try { await Workspace.saveApp(title || 'app', headed.source); out.folder = true; } catch {}
    }
    return out;
  },
};

function SyncApp(body) {
  body.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <button class="btn sm" id="refresh">Refresh</button>
      <button class="btn sm" id="pushall">Push all →</button>
      <button class="btn sm" id="pullall">← Pull all</button>
      <span class="sp" style="flex:1"></span>
      <label class="tiny dimmer">auto
        <select id="every" style="background:var(--panel2);color:var(--btntext);border:1px solid var(--line);border-radius:var(--radius-sm);padding:3px 6px;margin-left:4px">
          <option value="0">off</option><option value="5">5s</option><option value="60">60s</option><option value="300">5m</option>
        </select>
      </label>
    </div>
    <div id="out"></div>
    <div class="tiny dimmer" id="syncMsg" style="margin-top:8px"></div>
    <div class="tiny dimmer" id="lastrun" style="margin-top:4px"></div>`;

  const out = body.querySelector('#out'), msg = body.querySelector('#syncMsg');
  const LABEL = {
    same:    ['in sync',        'dimmer', ''],
    push:    ['workspace only', 'part',   'Push →'],
    pull:    ['VM only',        'part',   '← Pull'],
    stale:   ['edited on disk since the snapshot', 'part', 'Push →'],
    differs: ['both changed',   'no',     ''],
  };

  async function paint() {
    const d = await Sync.diff();
    if (d.error) { out.innerHTML = '<p class="note"></p>'; out.firstChild.textContent = d.error; return; }
    if (!d.rows.length) { out.innerHTML = '<p class="small dimmer">Nothing on either side yet.</p>'; msg.textContent = ''; unmirrored(d); return; }

    out.innerHTML = `<table><thead><tr><th>File</th><th>Workspace</th><th>VM</th><th>State</th><th></th></tr></thead><tbody></tbody></table>`;
    const tb = out.querySelector('tbody');
    d.rows.forEach(r => {
      const [label, cls, action] = LABEL[r.state];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono tiny"></td>
        <td>${r.inWs ? '●' : '<span class="dimmer">—</span>'}</td>
        <td>${r.inVm ? '●' : '<span class="dimmer">—</span>'}</td>
        <td class="${cls}">${label}</td>
        <td style="text-align:right">${action ? `<button class="btn sm">${action}</button>` : ''}</td>`;
      tr.firstElementChild.textContent = r.name;   // a VM filename, so never markup
      const btn = tr.querySelector('button');
      if (btn) btn.onclick = async () => {
        try { r.state === 'pull' ? await Sync.pull(r.name) : await Sync.push(r.name); await paint(); }
        catch (e) { msg.textContent = e.message; }
      };
      tb.appendChild(tr);
    });
    const conflicts = d.rows.filter(r => r.state === 'differs').length;
    msg.innerHTML = conflicts
      ? `<span class="no">${conflicts} file${conflicts === 1 ? '' : 's'} changed on both sides.</span> Auto-sync will not touch these — copy the one you want by hand.`
      : 'Auto-sync moves only files that exist on one side.';
    unmirrored(d);
  }

  function unmirrored(d) {
    if (!d.unmirrored.length) return;
    // Guest names: textContent, never markup.
    const p = document.createElement('p');
    p.className = 'small dimmer';
    const label = e => e.type === 'dir' ? e.name + '/' : `${e.name} (${e.type})`;
    p.textContent = `not mirrored: ${d.unmirrored.map(label).join(' ')} — only regular files at the root of /mnt are mirrored; subdirectories, links and special files stay in the machine.`;
    msg.appendChild(p);
  }

  body.querySelector('#refresh').onclick = paint;
  body.querySelector('#pushall').onclick = async () => {
    const d = await Sync.diff();
    if (d.error) return;
    for (const r of d.rows) if (r.state === 'push') await Sync.push(r.name);
    paint();
  };
  body.querySelector('#pullall').onclick = async () => {
    const d = await Sync.diff();
    if (d.error) return;
    for (const r of d.rows) if (r.state === 'pull') await Sync.pull(r.name);
    paint();
  };
  const sel = body.querySelector('#every');
  sel.value = String(Sync.every);
  sel.onchange = e => Sync.start(+e.target.value);

  // Repaint whenever the background timer runs, so the window reflects it
  // rather than showing a stale diff.
  const off = Sync.onRun(() => { paint(); stamp(); });
  body.closest('.win').querySelector('.tl.r').addEventListener('click', off);

  function stamp() {
    const el = body.querySelector('#lastrun');
    if (!el) return;
    el.textContent = !Sync.every ? 'auto off'
      : Sync.last
        ? `auto every ${Sync.every}s${Sync.last.live ? ' + live on VM writes' : ''} · last ${Sync.last.at.toLocaleTimeString()} · moved ${Sync.last.moved}`
        : `auto every ${Sync.every}s · no run yet`;
  }
  paint(); stamp();
}

function AboutApp(body) {
  body.innerHTML = `
    <h3>What this prototype tests</h3>
    <table><tbody>
      <tr><td><b>Agent-written code runs with no build step</b></td>
          <td class="yes"><b>shown</b></td>
          <td class="dimmer tiny">Blob URL + dynamic <code>import()</code>.</td></tr>
      <tr><td><b>Apps are real files you keep</b></td>
          <td class="${CAP.supports.files ? 'yes' : 'no'}"><b>${CAP.supports.files ? 'shown' : 'unavailable here'}</b></td>
          <td class="dimmer tiny">Written to <code>vibeos/apps/*.js</code> on your disk, not browser storage.</td></tr>
      <tr><td><b>A real Linux, and a bridge to your folder</b></td>
          <td class="part"><b>local only</b></td>
          <td class="dimmer tiny">v86 boots an actual x86 kernel; <code>create_file</code>/<code>read_file</code>
              move bytes across its 9p mount. Needs the 11&nbsp;MB assets, so it only runs from a local server.</td></tr>
      <tr><td><b>One UI, browser or native</b></td>
          <td class="part"><b>partial</b></td>
          <td class="dimmer tiny">Both providers implemented; the native daemon isn't built — it probes <code>127.0.0.1:4571</code> and finds nothing.</td></tr>
    </tbody></table>

    <h3 style="margin-top:16px">Why the workspace is a folder</h3>
    <p class="small muted">
      Because it makes "download the binary and keep working" free. The apps were never in browser
      storage, so there is nothing to export, sync, or migrate — the native build opens the same
      directory and finds the same files. Build a <i>terminal</i> in the Agent window to see the
      other half: it saves fine, and refuses to run here, and says why.
    </p>

    <h3 style="margin-top:16px">The boundary that does not move</h3>
    <p class="small muted">
      A tab can run a wasm shell, real workers, and websockets — more than people assume. What it
      cannot do is reach <i>your</i> binaries, <i>your</i> processes, or files outside folders you
      pick. So a browser vibeOS is a real computer; it just isn't <i>your</i> computer.
    </p>
    <p class="note">Everything runs locally in your tab. Nothing is uploaded.</p>`;
}

/* ---------- boot ------------------------------------------------------ */

/* ---------- settings ---------------------------------------------------
   Workspace, files, the machine, sync, capabilities: none of these are apps.
   They are how the system is configured, so they live in one window with
   tabs. The dock is for actual apps — vibeOS itself, and whatever it builds.
   -------------------------------------------------------------------- */

const SETTINGS_TABS = [
  { id: 'workspace', label: 'Workspace',    render: WorkspaceApp },
  { id: 'files',     label: 'Files',        render: FilesApp },
  { id: 'terminal',  label: 'Terminal',     render: TerminalApp },
  { id: 'console',   label: 'Machine',      render: ConsoleApp },
  { id: 'sync',      label: 'Sync',         render: SyncApp },
  { id: 'caps',      label: 'Capabilities', render: CapsApp },
  { id: 'network',   label: 'Network',      render: NetworkApp },
  { id: 'model',     label: 'Model',        render: ModelApp },
  { id: 'design',    label: 'Design',       render: DesignApp },
  { id: 'about',     label: 'About',        render: AboutApp },
];

function SettingsApp(body, win, opts) {
  body.style.padding = '0';
  body.style.display = 'flex';
  body.innerHTML = `
    <nav id="tabs" style="flex:0 0 132px;border-right:1px solid var(--line);padding:8px;display:flex;flex-direction:column;gap:2px"></nav>
    <div id="pane" style="flex:1;overflow:auto;min-width:0"></div>`;
  const nav = body.querySelector('#tabs'), pane = body.querySelector('#pane');

  const show = (tab) => {
    [...nav.children].forEach(b => b.style.background = b.dataset.id === tab.id ? 'var(--sel)' : 'transparent');
    pane.innerHTML = '';
    pane.style.padding = '';
    const holder = document.createElement('div');
    holder.className = 'body';
    holder.style.cssText = 'padding:14px;overflow:visible';
    pane.appendChild(holder);
    tab.render(holder, win);
  };

  SETTINGS_TABS.forEach(tab => {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.dataset.id = tab.id;
    b.style.cssText = 'border:0;background:transparent;text-align:left;padding:6px 9px';
    b.textContent = tab.label;
    b.onclick = () => show(tab);
    nav.appendChild(b);
  });
  show(SETTINGS_TABS.find(t => t.id === (opts && opts.tab)) || SETTINGS_TABS[0]);
}

/* ---------- a browser, without a browser engine -----------------------

   Real sites cannot be framed — X-Frame-Options and frame-ancestors exist
   precisely to stop it, which is why the docker build drives Chromium over
   CDP. So this re-serves instead of framing: fetch through the proxy, then
   render.

   The page is rendered inside a SANDBOXED iframe with NO allow-scripts. That
   is the load-bearing part: this desktop holds the user's API key in
   localStorage, and reading localStorage requires running a script. Without
   allow-scripts nothing in the fetched page executes — not inline handlers,
   not javascript: URLs, not a <script> that slipped past the regex strip.

   allow-same-origin IS set, so the desktop can read the rendered document and
   catch link clicks; without it, every link either died silently in the
   sandbox or had to be thrown to the host browser, which is the one place a
   browser app must never send you. It grants the frame our origin, but an
   origin is only worth something to code, and no code runs here.
   -------------------------------------------------------------------- */

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

function BrowserApp(body) {
  body.style.padding = '0';
  body.innerHTML = `
    <div class="row" style="gap:6px;padding:8px 10px;border-bottom:1px solid var(--barline);background:var(--panel)">
      <button class="btn sm" id="back" title="Back">← Back</button>
      <input type="text" id="url" placeholder="search, or type a url" spellcheck="false"
             style="flex:1;border:1px solid var(--line);border-radius:var(--radius-ctl);background:var(--panel2);padding:6px 10px;font-size:12.5px" />
      <button class="btn p sm" id="go">Go</button>
    </div>
    <div id="status" class="tiny dimmer" style="padding:5px 10px"></div>
    <iframe id="page" sandbox="allow-same-origin"
            referrerpolicy="no-referrer"
            style="width:100%;height:calc(100% - 74px);border:0;background:#fff"></iframe>`;

  const input = body.querySelector('#url'), frame = body.querySelector('#page');
  const status = body.querySelector('#status'), back = body.querySelector('#back');
  const stack = [];

  // Every place a page names a URL, passed through fn: the href/src/poster/
  // action attributes (quoted either way, or not at all — <img src=/p.png>
  // is legal HTML and used to slip past a quoted-only pattern), srcset's
  // comma list with descriptors (missing it is why responsive images,
  // Google's logo among them, rendered as broken icons), and url(...) in
  // inline styles. attrs narrows the attribute pass.
  // An attribute value is entity-decoded by the parser before it is a URL:
  // src="http://localhost&#58;3000/x" is a guest URL to the browser and was
  // not one to a regex over the raw text. Decoded the way the browser does
  // it (DOMParser documents are inert — nothing in them fetches), then
  // re-escaped on the way out so the value stays inside its quotes.
  const decodeAttr = (v) => !v.includes('&') ? v
    : new DOMParser().parseFromString(`<i title="${v.replace(/"/g, '&quot;')}">`, 'text/html').querySelector('i').getAttribute('title');
  const escAttr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const rewriteUrls = (html, fn, attrs = 'href|src|poster|action', cssFn = fn) => html
    .replace(new RegExp(`\\b(${attrs})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"'=]+))`, 'gi'),
             (m, attr, dq, sq, uq) => { const v = decodeAttr(dq ?? sq ?? uq); return `${attr}="${v === '' ? '' : escAttr(fn(v))}"`; })
    .replace(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"'=]+))/gi, (m, dq, sq, uq) =>
      'srcset="' + (dq ?? sq ?? uq).split(',').map(part => {
        const bits = part.trim().split(/\s+/);
        if (!bits[0]) return part.trim();
        bits[0] = fn(bits[0]);
        return bits.join(' ');
      }).join(', ') + '"')
    .replace(/url\((['"]?)([^'")]+)\1\)/gi, (m, q, val) => `url(${q}${cssFn(val)}${q})`);

  const absolutise = (html, base) => {
    // Relative URLs would resolve against our origin inside srcdoc, so make
    // them absolute against the page they came from. action too: a guest
    // page's <form action="/search"> must come back to the guest through
    // open(), not resolve against this origin.
    try {
      const b = new URL(base);
      const one = (val) => {
        if (/^(https?:|data:|mailto:|#)/i.test(val)) return val;
        try { return new URL(val, b).href; } catch { return val; }
      };
      // Fonts are the one asset the frame cannot load cross-origin
      // (CORS-checked), so they go through the proxy — every proxied page with
      // an icon font spat six CORS errors into the console for nothing. Not a
      // guest's fonts: the proxy must never be asked about the machine's
      // localhost, and blankGuestAssets blanks them with the rest.
      const font = (val) => {
        const abs = one(val);
        return !isGuestHost(abs) && /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(abs) ? PROXY + encodeURIComponent(abs) : abs;
      };
      return rewriteUrls(html, one, undefined, font);
    } catch { return html; }
  };

  const strip = (html) => html
    // The sandbox already blocks scripts; removing them as well keeps the
    // rendered DOM honest and stops noisy console errors.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    // Forms stay forms: a GET form is a link with fields, and the load handler
    // below turns its submit into a navigation through the proxy. It used to
    // be renamed away with iframe/object/embed, so Google's search box drew a
    // button that did nothing.
    .replace(/<\s*(iframe|object|embed)\b/gi, '<disabled-$1')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // What you typed is a URL if it looks like a host; anything else is a search.
  // "california tax 2024" used to become https://california tax 2024 and fail.
  const SEARCH = 'https://old-search.marginalia.nu/search?query=';
  const asUrl = (raw) => {
    const text = raw.trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    // localhost and bare IPv4 addresses are http: they are the machine's own
    // dev servers (fetched from inside it — see guestFetch), and nobody has a
    // certificate for 127.0.0.1. Everything with a name gets https.
    if (/^(localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?([/?#].*)?$/i.test(text)) return 'http://' + text;
    if (/^[^\s/?#]+\.[a-z]{2,}(?::\d+)?([/?#].*)?$/i.test(text)) return 'https://' + text;
    // Marginalia, after measuring the alternatives through this proxy on
    // 2026-09-02. DuckDuckGo (all three endpoints) and Ecosia hard-403 us.
    // Google and Bing answer 200 but emit no plain result links, so with
    // scripts off there is nothing to render. Brave answered well once and
    // then served a bot-check page for every query after — which is what a
    // single datacenter address gets. Marginalia throttles softly, retries
    // fine, and welcomes crawlers. See WebTools for the same reasoning.
    return SEARCH + encodeURIComponent(text);
  };

  // Escaped: the title carries the typed host and the detail carries what a
  // server or the guest's wget said, and the frame must never fetch or render
  // anything either of them chose.
  const errorPage = (title, detail) =>
    `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:28px;background:var(--panel2);color:var(--text);font:14px system-ui,-apple-system,sans-serif">
       <p style="margin:0 0 6px;font-weight:600">${escHtml(title)}</p>
       <p style="margin:0;color:var(--dim);font-size:13px;line-height:1.5">${escHtml(detail)}</p>
     </body>`;
  const fail = (text) => { status.innerHTML = '<span class="no"></span>'; status.querySelector('.no').textContent = text; };

  // Every subresource that resolves to the guest, blanked. absolutise() has
  // already made them absolute, so a bare /logo.png is http://localhost:3000/
  // logo.png here and would otherwise be fetched by the HOST browser from the
  // developer's own port 3000. <a href> stays: a click comes back through
  // open() and is fetched inside the machine like the page was. <link href>
  // does not: a stylesheet is a fetch.
  // This pass is for the rendered DOM's honesty, not the guarantee: it is a
  // regex allowlist, and <body background>, <svg><image href>, @import "…",
  // image-set("…") each slipped past an earlier version of it (measured, the
  // host fetched all four). The guarantee is GUEST_CSP on the frame itself.
  const blankGuestAssets = (html) => {
    const blank = (val) => isGuestHost(val) ? 'data:,' : val;
    return rewriteUrls(html, blank, 'src|poster|background')
      .replace(/<(?:link|image)\b[^>]*>/gi, tag => rewriteUrls(tag, blank, 'href'));
  };
  // The frame refuses every fetch the rewrites miss. Inline styles stay so
  // the page keeps its shape; data: images stay because that is what the
  // blanks are.
  const GUEST_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'">`;

  // The proxy's answer in the same shape as guestFetch's, so open() renders
  // both the same way. finalUrl is where the content actually came from, for
  // resolving relative URLs.
  const proxyFetch = async (url) => {
    const r = await fetch(PROXY + encodeURIComponent(url), { headers: { 'ngrok-skip-browser-warning': '1' } });
    const type = r.headers.get('content-type') || '';
    const finalUrl = r.headers.get('x-final-url') || url;
    const text = await r.text();
    return { ok: r.ok, status: r.status, type, text, finalUrl, via: 'proxy' };
  };

  async function open(target, push = true) {
    const url = asUrl(target);
    if (!url) return;
    input.value = url;
    status.textContent = 'fetching…';
    frame.removeAttribute('srcdoc');
    const guest = isGuestHost(url);
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    // What people do in the Browser, host-level only: a search, a site, or the
    // machine's own dev server — never the path or the query, which is theirs.
    const kind = guest ? 'localhost' : url.startsWith(SEARCH) ? 'search' : 'site';
    const t0 = Date.now();
    try {
      track('browser_open', { kind, host: kind === 'search' ? 'search' : host, guest, how: push ? 'nav' : 'history' });
      const r = await (guest ? guestFetch(url) : proxyFetch(url));
      track('browser_result', { kind, ok: r.ok, status: r.status, seconds: Math.round((Date.now() - t0) / 1000) });
      const { type, finalUrl, text } = r;
      if (!r.ok) {
        let msg = text;
        try { msg = JSON.parse(text).error || text; } catch {}
        msg = msg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        // A blank white frame reads as "vibeOS is broken". Say who refused and
        // why — 403 and 429 here are almost always the site blocking datacenter
        // egress, which is the proxy's address, not a bug in this browser.
        const hint = !guest && (r.status === 403 || r.status === 429)
          ? `${host} refuses requests from datacenter addresses, and the proxy is one. Nothing here can change that — the site has to be reachable without a browser fingerprint.`
          : (msg || 'No detail was returned.');
        frame.srcdoc = errorPage(`${host} returned ${r.status}`, hint);
        fail(`${r.status} · ${host}` + (guest ? ' · inside the machine' : ''));
        return;
      }
      if (push) { stack.push(url); back.style.opacity = stack.length < 2 ? '.6' : '1'; }

      const doc = type.includes('text/html')
        ? (guest ? blankGuestAssets : (h => h))(absolutise(strip(text), finalUrl))
        : `<pre style="white-space:pre-wrap;font:13px ui-monospace,monospace;padding:12px">${
             text.slice(0, 200000).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>`;

      // No target="_blank": links used to leave for the host browser, which is
      // the one place a browser app should never send you. The load handler
      // below catches clicks and navigates here instead.
      // A guest page gets no <base>: with one, any relative URL the rewrites
      // above missed would resolve to the guest host and be fetched by the
      // host browser from the developer's laptop; without one it resolves to
      // this origin, where nothing of the sort is served.
      frame.srcdoc = `<!doctype html><meta charset="utf-8">${guest ? GUEST_CSP : `<base href="${finalUrl}">`}${doc}`;
      status.innerHTML = '<span class="dimmer"></span>';
      status.querySelector('.dimmer').textContent = `${type.split(';')[0] || 'ok'} · ${(text.length / 1024).toFixed(0)} KB · `
        + (guest ? `served from inside the machine (${r.via}) · scripts off · assets not loaded` : 'scripts disabled');
    } catch (e) {
      track('browser_result', { kind, ok: false, status: 0, seconds: Math.round((Date.now() - t0) / 1000) });
      // Not a blank frame: the guest case is the one where a person is
      // waiting for their own server, and "nothing is listening" is the answer.
      frame.srcdoc = errorPage(guest ? `${host} inside the machine` : host, e.message);
      fail(e.message);
    }
  }

  // The frame is same-origin (scripts off), so its clicks are ours to handle.
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    // The parsed document is visible before this load event fires, so anyone
    // polling for the form can click it before the handlers below exist. The
    // flag says when they do; the e2e waits on it rather than on the form.
    doc.__vibeosWired = true;
    doc.addEventListener('click', (e) => {
      const a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.href;
      if (!/^https?:/i.test(href)) return;   // mailto:, tel:, in-page anchors
      e.preventDefault();
      open(href);
    });
    // GET forms navigate through the proxy like a link with fields. The frame
    // has no allow-forms on purpose — with it, a native submission would
    // navigate the frame to the real site — and without it no submit event
    // ever fires. So the submit is caught one step earlier: a click on the
    // form's submit button, or Enter in one of its fields. POST is refused out
    // loud: the proxy forwards no bodies, and posting logins or uploads
    // through our relay to arbitrary sites is a different posture.
    const submitForm = (form, submitter) => {
      const method = (form.getAttribute('method') || 'get').toLowerCase();
      if (method !== 'get') {
        status.innerHTML = '<span class="no"></span>';
        status.querySelector('.no').textContent = 'this form posts (method=' + method + '); a scripts-off browser cannot submit it through the proxy';
        return;
      }
      let action;
      try { action = new URL(form.getAttribute('action') || '', doc.baseURI); } catch { return; }
      const params = new URLSearchParams();
      for (const [k, v] of new FormData(form)) if (typeof v === 'string') params.append(k, v);
      if (submitter && submitter.name) params.append(submitter.name, submitter.value || '');
      action.search = params.toString();
      open(action.href);
    };
    doc.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('button, input[type="submit"], input[type="image"]');
      if (!btn) return;
      const form = btn.form || btn.closest('form');
      if (!form) return;
      const type = (btn.getAttribute('type') || (btn.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase();
      if (type !== 'submit' && type !== 'image') return;
      e.preventDefault();
      submitForm(form, btn);
    });
    doc.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const field = e.target;
      if (!field || !/^(INPUT)$/.test(field.tagName) || !field.form) return;
      if (/^(checkbox|radio|button|submit|file)$/i.test(field.type || '')) return;
      e.preventDefault();
      submitForm(field.form, field.form.querySelector('button[type="submit"], input[type="submit"], button:not([type])'));
    });
  });

  body.querySelector('#go').onclick = () => open(input.value);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') open(input.value); });
  back.onclick = () => { if (stack.length < 2) return; stack.pop(); const prev = stack[stack.length - 1]; back.style.opacity = stack.length < 2 ? '.6' : '1'; if (prev) open(prev, false); };
  setTimeout(() => input.focus(), 50);
}

function NetworkApp(body) {
  const render = () => {
    const on = !!VM.relay;
    body.innerHTML = `
      <h3>Network</h3>
      <p class="small muted" style="margin-top:0">
        The VM has no network unless you give it a relay. v86's <code>fetch</code> backend turns the
        guest's HTTP requests into browser <code>fetch()</code> calls, and a CORS proxy makes those
        reach the open internet.
      </p>
      <div class="col" style="margin-bottom:10px">
        <input type="text" id="relay" placeholder="${NET_DEFAULT}" value="${on ? VM.relay : ''}" />
        <div class="row">
          <button class="btn p sm" id="save">${on ? 'Update' : 'Enable networking'}</button>
          <button class="btn sm" id="preset">vibeos.sh relay</button>
          <button class="btn sm" id="public">public relay</button>
          ${on ? '<button class="btn sm" id="off">Turn off</button>' : ''}
        </div>
      </div>
      <p class="small ${VM.net === 'connected' ? 'yes' : 'dimmer'}" id="netState" style="margin:0 0 8px">
        ${!on ? '' : VM.net === 'connecting'
            ? (VM.leased ? (VM.ip ? 'guest has <b>' + VM.ip + '</b>; ' : 'no DHCP lease; ') + 'dialing the relay…' : 'getting a lease…')
          : VM.net === 'no lease' ? 'connected to the relay but got no DHCP lease'
          : VM.net === 'unwatched'
            ? '<span class="part">the relay socket could not be watched.</span> v86 dialed a socket this desktop did not recognise as the relay, so a drop will not be noticed here' + (VM.ip ? '; the guest has <b>' + VM.ip + '</b>' : '') + '.'
          : VM.net === 'reconnecting'
            ? '<span class="part">the relay dropped this connection; redialing…</span> the relay is a serverless function and its socket closes at its maximum duration. connections the guest had open are lost; new ones work once this is back.'
          : VM.net === 'disconnected'
            ? `<span class="no">${VM.linkWasOpen ? 'the relay dropped this connection and five redials in a row failed.' : 'the relay never answered: five dials in a row failed.'}</span> it is tried once more every 10 s; if it never answers, restart the machine — your apps are files and survive; anything only in VM memory does not.`
          : VM.net === 'connected' ? 'guest has <b>' + VM.ip + '</b>' + (VM.netNote ? ' <span class="dimmer">· ' + VM.netNote + '</span>' : '')
          : ''}
      </p>
      ${VM.net === 'disconnected' ? '<button class="btn p sm" id="reconnect" style="margin-bottom:10px">Restart the machine</button>' : ''}
      <p class="note">
        <b>Takes effect on the next VM start</b> — reload the page after changing it.
        ${on ? 'On by default, through our own relay.' : 'Currently <b>off</b>: the guest can reach nothing.'}
      </p>
      <h3 style="margin-top:16px">What this does and does not give you</h3>
      <table><tbody>
        <tr><td>Plain HTTP from the guest</td><td class="yes"><b>yes</b></td>
            <td class="dimmer tiny">via the proxy, to allowlisted hosts</td></tr>
        <tr><td>HTTPS / TLS from the guest</td><td class="no"><b>no</b></td>
            <td class="dimmer tiny">the fetch backend speaks HTTP; TLS needs the <code>wisp</code> backend and a WISP server</td></tr>
        <tr><td>Raw TCP, ssh, listening sockets</td><td class="no"><b>no</b></td>
            <td class="dimmer tiny">same reason</td></tr>
        <tr><td>Arbitrary destinations</td><td class="part"><b>public only</b></td>
            <td class="dimmer tiny">the relay refuses loopback, private ranges and odd ports, so the guest cannot reach our infrastructure</td></tr>
        <tr><td>Staying connected</td><td class="part"><b>redials</b></td>
            <td class="dimmer tiny">the relay is a serverless function and its socket closes at its max duration (800 s); the desktop redials in place — connections open at that moment are dropped, new ones work</td></tr>
      </tbody></table>`;
    const rc = body.querySelector('#reconnect');
    if (rc) rc.onclick = async () => { rc.disabled = true; rc.textContent = 'restarting…'; await VM.restart(); render(); };

    body.querySelector('#save').onclick = () => {
      VM.setRelay(body.querySelector('#relay').value.trim()); render();
    };
    body.querySelector('#preset').onclick = () => {
      body.querySelector('#relay').value = NET_DEFAULT; VM.setRelay(NET_DEFAULT); render();
    };
    body.querySelector('#public').onclick = () => {
      body.querySelector('#relay').value = NET_OURS; VM.setRelay(NET_OURS); render();
    };
    const off = body.querySelector('#off');
    if (off) off.onclick = () => { VM.setRelay(''); render(); };
  };
  render();
  // The state line follows the link while the pane is open. The subscription
  // lets go once the pane is gone, since nothing tells it when, and stays out
  // of the way while the relay URL has focus or has been edited: a failed
  // probe emits every 10 s while 'disconnected', and a re-render replaces the
  // input, so a focused one lost its caret on every probe.
  const unsub = VM.on(() => {
    if (!body.isConnected) return unsub();
    const input = body.querySelector('#relay');
    if (document.activeElement === input || input.value !== (VM.relay || '')) return;
    render();
  });
}

function DesignApp(body) {
  const render = () => DesignAppRender(body, render);
  render();
}

function DesignAppRender(body, rerender) {
  const skills = VibeOSSkills.installed().skills;
  const theme = VibeOSSkills.getTheme(Theme.id);
  const swatches = Object.entries(Theme.tokens()).map(([name, hex]) =>
    `<div class="row" style="gap:7px;align-items:center">
       <span style="width:14px;height:14px;border-radius:var(--radius-sm);border:1px solid var(--line2);background:${hex};flex:0 0 auto"></span>
       <code class="tiny">${name}</code><span class="tiny dimmer">${hex}</span>
     </div>`).join('');

  const themeButtons = Object.values(VibeOSSkills.THEMES).map(t =>
    `<button class="btn sm${t.id === Theme.id ? ' p' : ''}" data-theme="${t.id}">${t.title}</button>`).join('');

  body.innerHTML = `
    <h3>Design</h3>
    <div class="row" style="gap:6px;margin-bottom:10px">${themeButtons}
      ${Theme.custom ? '<button class="btn sm" id="themeReset">Clear overrides</button>' : ''}</div>
    <p class="small muted" style="margin-top:0">
      What the agent is told about looks and behaviour, on top of the build rules.
      Both are appended to every prompt, whichever model you are using.
    </p>

    <h4 class="small" style="margin-bottom:4px">Theme &middot; ${theme.title}</h4>
    <p class="tiny dimmer" style="margin-top:0">${theme.summary}</p>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px;margin-bottom:14px">${swatches}</div>

    ${skills.map(sk => `
      <h4 class="small" style="margin-bottom:4px">Skill &middot; ${sk.title}</h4>
      <p class="tiny dimmer" style="margin-top:0">${sk.summary}</p>
      <pre class="tiny app-scroll" style="max-height:150px;overflow:auto;background:var(--panel2);border:1px solid var(--line);border-radius:var(--radius-ctl);padding:9px;white-space:pre-wrap;margin:0 0 12px">${sk.instructions.replace(/</g, '&lt;')}</pre>`).join('')}

    <h4>Source</h4>
    <p class="tiny dimmer" style="margin-top:0">${window.__vibeosBoot && window.__vibeosBoot.source === 'stored'
      ? 'This desktop is running <b>your</b> copy: system/os.js in the workspace. The agent edits it with edit_file; delete it to go back to stock.'
      : 'Running the served desktop. The agent\'s first edit_file on system/os.js forks it into your workspace, and yours boots from then on.'}</p>
    ${forkVersionHtml()}
    <p class="note">The agent can change this itself &mdash; ask it for light mode. Apps mount inside this document, so the tokens above are inherited &mdash;
    a generated app using <code>var(--text)</code> follows the desktop instead of drifting from it.</p>`;

  body.querySelectorAll('[data-theme]').forEach(b => {
    b.onclick = () => { Theme.set(b.dataset.theme); rerender(); };
  });
  const clear = body.querySelector('#themeReset');
  if (clear) clear.onclick = () => { Theme.set(Theme.id, {}); rerender(); };
  const fv = body.querySelector('#forkVersion');
  if (fv) {
    fv.querySelector('.d').textContent = forkVersionText();
    const keep = fv.querySelector('#forkKeep'), take = fv.querySelector('#forkTake'), diff = fv.querySelector('#forkDiffBtn');
    if (keep) keep.onclick = () => { window.__vibeosFork.keep(); rerender(); };
    if (take) take.onclick = () => window.__vibeosFork.take().catch(e => recoveryBar('Could not take the update.', e.message));
    if (diff) diff.onclick = () => window.__vibeosFork.diff();
  }
}

// A fork pins the OS to a version. The loader (index.html) compares the
// version the fork was taken from with the one vibeos.sh serves now, and
// this is where that answer lives in the UI, with the same three actions as
// the loader's bar. Text goes in through textContent: the record and its
// parse errors are guest strings, and a JSON.parse message quotes the file.
function forkVersionHtml() {
  const b = window.__vibeosBoot;
  if (!b || b.source !== 'stored') return '';
  const fork = b.fork;
  const moved = !fork || !!fork.moved || !!fork.error;
  return `<p class="tiny dimmer" id="forkVersion" style="margin-top:0"><span class="d"></span></p>
    <div class="row" style="gap:6px;margin:0 0 12px">
      ${moved && fork && !fork.dismissed ? '<button class="btn sm" id="forkKeep">Keep mine</button>' : ''}
      <button class="btn sm${moved ? ' p' : ''}" id="forkTake">Take the update</button>
      <button class="btn sm" id="forkDiffBtn">Show diff</button>
    </div>`;
}

function forkVersionText() {
  const fork = window.__vibeosBoot.fork;
  if (fork === undefined) return 'Still checking whether the served vibeOS has moved on since this copy was forked…';
  if (fork === null) return (window.__vibeosBoot.stored
    ? 'The version check could not run this boot (the served os.js was unreachable), so whether the served vibeOS has moved on is unknown. "Take the update" still sets your copy aside and boots the served one.'
    : 'Running the served desktop; nothing is forked.');
  if (fork.error) return 'Its version record could not be read: ' + fork.error + '. The served vibeOS is ' + fork.served['os.js'] + ' now; which version this copy came from is unknown.';
  const from = fork.files.map(f => f + ' from version ' + fork.base[f] + (fork.at[f] ? ' (' + fork.at[f].slice(0, 10) + ')' : '')).join(', ');
  if (!fork.moved) return 'Forked: ' + from + '. That is still what vibeos.sh serves, so this copy is up to date with it.';
  const now = fork.files.filter(f => fork.base[f] !== fork.served[f]).map(f => f + ' is ' + fork.served[f]).join(', ');
  return 'Forked: ' + from + '. vibeOS has moved since: ' + now + ' now' + (fork.dismissed ? ' (you chose to keep yours for this version)' : '') +
    '. Keep mine hides the notice until the next served change; Take the update sets your copy aside as system/os.js.bak and boots the served one; Show diff lists what changed between them.';
}

function ModelApp(body) {
  const render = () => {
    body.innerHTML = `
      <h3>Model</h3>
      <p class="small muted" style="margin-top:0">
        ${Gen.viaServer
          ? `A local server is holding the key. Model: <b>${Gen.model}</b>.`
          : Gen.key
            ? `Using your own <b>${Gen.provider}</b> key, stored in this browser only and sent
               straight to the provider. Model: <b>${Gen.model}</b>.`
            : Gen.oauth
              ? `Signed in with ChatGPT (<b>${Gen.provider}</b>). Model: <b>${Gen.model}</b>.`
              : `No key set, so prompts fall back to stock modules.`}
      </p>
      <div class="row">
        <button class="btn p sm" id="setkey">${Gen.key || Gen.oauth ? 'Replace key' : 'Add a key'}</button>
        ${Gen.key ? '<button class="btn sm" id="clear">Forget key</button>' : ''}
        ${Gen.oauth ? '<button class="btn sm" id="clearoauth">Sign out</button>' : ''}
      </div>
      ${Gen.oauth ? `
        <h4>Model id</h4>
        <p class="tiny dimmer" style="margin-top:0">
          Which aliases your ChatGPT account can reach is not something this page can know.
          Set one here to try it; a rejected id reports the reason OpenAI actually gave.
        </p>
        <div class="row" style="gap:6px">
          <input type="text" id="modelId" spellcheck="false" value="${Gen.codexModel}"
                 placeholder="${VibeOSOAuth.CODEX_MODEL} (default)"
                 style="flex:1;border:1px solid var(--line);border-radius:var(--radius-ctl);background:var(--panel2);padding:6px 10px;font-size:12.5px;font-family:'JetBrains Mono',ui-monospace,monospace" />
          <button class="btn sm" id="modelSave">Use</button>
          ${Gen.codexModel ? '<button class="btn sm" id="modelReset">Default</button>' : ''}
        </div>` : ''}
      <p class="note" style="margin-top:12px">
        ${Gen.oauth
          ? 'ChatGPT tokens stay in <code>localStorage</code> and are sent to vibeos.sh only for proxied Codex inference.'
          : 'API keys never reach vibeos.sh. They live in <code>localStorage</code> and go directly to Anthropic or OpenAI from your browser.'}
      </p>`;
    body.querySelector('#setkey').onclick = async () => { await Gen.askForKey(); render(); };
    const c = body.querySelector('#clear');
    if (c) c.onclick = () => { Gen.saveKey(''); render(); };
    const co = body.querySelector('#clearoauth');
    if (co) co.onclick = () => { Gen.saveOAuth(null); render(); };
    const save = body.querySelector('#modelSave');
    if (save) save.onclick = () => { Gen.saveCodexModel(body.querySelector('#modelId').value); render(); };
    const reset = body.querySelector('#modelReset');
    if (reset) reset.onclick = () => { Gen.saveCodexModel(''); render(); };
  };
  render();
}

function paintWorkspace() {
  const dot = document.getElementById('wsDot'), txt = document.getElementById('wsText');
  if (Workspace.open) { dot.className = 'dot' + (Workspace.private ? ' warn' : ''); txt.textContent = Workspace.label; }
  else if (Workspace.pending) { dot.className = 'dot warn'; txt.textContent = 'reopen folder'; }
  else { dot.className = 'dot off'; txt.textContent = 'no workspace'; }
}

async function detectMode() {
  const native = await NativeProvider.probe();
  CAP = native ? NativeProvider : BrowserProvider;
  document.getElementById('modeText').textContent = CAP.label;
  document.getElementById('modeDot').className = 'dot' + (native ? '' : ' warn');
  document.getElementById('modePill').title = native
    ? 'Local vibeOS binary detected on 127.0.0.1:4571 — full capabilities.'
    : 'No local binary. Browser capabilities only.';
}

const ICONS = {
  vibeos: `<img src="${BASE}icon.png" alt=""" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-win)" onerror="this.replaceWith(document.createTextNode('◇'))">`,
  settings: '⚙',
};

const SHELL = {
  chat:     { id: 'chat', title: 'vibeOS', badge: 'agent', render: ChatApp, w: 580, h: 500 },
  browser:  { id: 'browser', title: 'Browser', badge: 'proxied', render: BrowserApp, w: 820, h: 560 },
  settings: { id: 'settings', title: 'Settings', badge: '', render: SettingsApp, w: 720, h: 480 },
};

const brand = document.getElementById('brandIcon');
if (brand) brand.src = BASE + 'icon.png';

const dock = document.getElementById('dock');

// The dock lists vibeOS, then the apps it has built, then Settings — the same
// shape as a real dock, where system panels are one icon and not eight.
async function paintDock() {
  dock.innerHTML = '';
  const add = (html, title, onclick, cls) => {
    const b = document.createElement('button');
    b.innerHTML = html; b.title = title; b.onclick = onclick;
    if (cls) b.className = cls;
    dock.appendChild(b);
    return b;
  };

  add(ICONS.vibeos, 'vibeOS — ask for an app', () => focusOrOpen(SHELL.chat));
  add('🌐', 'Browser', () => openWindow(SHELL.browser));

  let apps = [];
  try { apps = (await Apps.list()).apps; } catch {}
  if (apps.length) {
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;background:rgba(0,0,0,.18);margin:4px 2px';
    dock.appendChild(sep);
  }
  apps.slice(0, 8).forEach(a => {
    const missing = missingCaps(a.requires);
    // The title is a header line in a file the guest can write: text, not html.
    const b = add('', a.title + (missing.length ? ' (needs ' + missing.join(', ') + ')' : ''), () => launchApp(a));
    b.textContent = a.title.slice(0, 2).toUpperCase();
    b.style.fontSize = '13px';
    b.style.fontWeight = '700';
    if (missing.length) b.style.opacity = '.5';
  });

  const sep2 = document.createElement('span');
  sep2.style.cssText = 'width:1px;background:rgba(0,0,0,.18);margin:4px 2px';
  dock.appendChild(sep2);
  add(ICONS.settings, 'Settings', () => focusOrOpen(SHELL.settings));
}

const openSettings = (tab) => openWindow(Object.assign({}, SHELL.settings, {
  render: (body, win) => SettingsApp(body, win, { tab }),
}));

document.getElementById('wsPill').onclick = () => openSettings('workspace');
document.getElementById('lxPill').onclick = () => {
  if (VM.state === 'off' || VM.state === 'failed') VM.boot();
  openSettings('console');
};

const tick = () => document.getElementById('clock').textContent =
  new Date().toLocaleTimeString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
tick(); setInterval(tick, 1000);

// A reload key or a closed tab took a whole conversation with the agent with it.
// The chat lives in memory until chat persistence lands, and even after, an
// agent mid-turn is work in flight. Ask before leaving when there is something
// to lose; our own reload_os sets the flag and is not asked about.
window.__vibeosUnsaved = () => {
  try {
    if (window.__vibeosIntentionalUnload) return false;
    const chat = document.querySelector('.win #log');
    return !!(chat && chat.children.length > 1);   // more than the intro bubble
  } catch { return false; }
};
window.addEventListener('beforeunload', (e) => {
  if (!window.__vibeosUnsaved()) return;
  e.preventDefault();
  e.returnValue = '';   // the browser shows its own "leave page?" prompt; the text is not ours to set
});

(async () => {
  const recovering = window.__vibeosBoot.recovering;
  // Paint the saved theme before anything else, or a light-mode desktop
  // flashes dark for the length of the first two awaits.
  Theme.load({ stock: recovering });
  VM.on(paintVM);   // the VM used to call this itself; now it just announces
  paintVM();
  // On the transition only: a repaint (the lease landing, a snapshot) also
  // announces 'ready', and this must not install the CLI or sync again.
  VM.on(async (s, transition) => {
    if (s !== 'ready' || !transition) return;
    GuestBridge.start();
    // The CLI lives in the VM's RAM, so it is re-added each boot. A slow guest
    // can time this out; that is a missing convenience, not a broken desktop,
    // and it must not surface as the red "vibeOS hit an error" bar — which is
    // exactly what an unhandled rejection from this listener did.
    try { await GuestBridge.install(); }
    catch (e) { console.warn('guest CLI not installed this boot:', e.message); }
    // A fresh machine has none of the user's files. Sync once now rather than
    // waiting up to a minute for the timer — until this runs, the workspace
    // exists on disk but not in the VM the agent is about to run commands in.
    if (Workspace.open) { try { await Sync.auto(); paintDock(); } catch {} }
  });
  await detectMode();
  await Gen.probe();
  // The workspace before the machine: the machine's snapshot lives in it, so
  // the boot has to know where the workspace is to find one. This is a
  // handle lookup and a permission query — milliseconds, no gesture, and a
  // folder that needs re-granting is left pending exactly as before.
  let state = await Workspace.restore();
  // Nothing mounted and nothing pending: use private browser storage so apps
  // persist without a click. A real folder stays one click away in Settings.
  if ((state === 'none' || state === 'no-picker') && canStoreWorkspace) {
    try { await Workspace.mountPrivate(); state = 'private'; } catch {}
  }
  paintWorkspace();
  // Start the machine BEFORE the key modal. It is an in-page overlay that is
  // awaited, so booting after it left the VM at 'off' until the user dealt with
  // the modal — two slow things in series, with the desktop looking dead in
  // between. The VM needs no key, so it must not wait for one.
  VM.available().then(ok => ok ? VM.boot() : VM.set('unavailable'));
  Sync.start();   // 60s by default; each tick no-ops until the VM and a folder exist

  // Ask once, while the machine boots behind it. Declining is fine — the
  // desktop still works, prompts just fall back to stock modules.
  if (!Gen.available) {
    try {
      if (!localStorage.getItem('vibeos-asked')) {
        localStorage.setItem('vibeos-asked', '1');
        await Gen.askForKey();
      }
    } catch { await Gen.askForKey(); }
  }
  await paintDock();
  VM.on((s, transition) => { if (s === 'ready' && transition) paintDock(); });
  // open the agent, not a settings panel — vibeOS is the app.
  focusOrOpen(SHELL.chat);
  bootFinished();
  if (window.__vibeosBoot.source === 'served' && window.__vibeosBoot.storedFailed) {
    recoveryBar('Your edited OS did not finish booting last time, so this is the stock one.',
                'Fix system/os.js in your workspace (or delete it) and reload. Your files and apps are untouched.');
  }
  if (recovering) {
    recoveryBar('The last boot did not finish, so this one skipped your saved theme.',
                'Your theme is still stored. Set it again from Settings > Design, or ignore this.');
  }
})();
