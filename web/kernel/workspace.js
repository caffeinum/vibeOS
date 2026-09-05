/* vibeOS kernel — the workspace, the sync, the apps on disk, the chat log.
 * Loaded after kernel/machine.js; never hot-reloads (see kernel/machine.js).
 */

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
  listeners: new Set(),

  get open() { return !!this.root; },

  // The menubar used to be painted from here by name; now the workspace
  // announces a mount and does not know a DOM exists.
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.listeners.forEach(fn => { try { fn(); } catch {} }); },

  async mount(handle) {
    this.root = handle;
    this.apps = await handle.getDirectoryHandle('apps', { create: true });
    this.dataDir = await handle.getDirectoryHandle('data', { create: true });
    await idb.set('workspace', handle);
    this.emit();
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

  // The served-relative name of a file the loader or the ui registry boots
  // — 'os.css', 'kernel/machine.js', 'ui/chat.js' — for a workspace path
  // under system/, or null. The list is the loader's (OS_FILES in
  // index.html): one list, read by the loader, the fork check and the tools.
  systemFile(path) {
    const rel = String(path).replace(/^\/+/, '');
    if (!rel.startsWith('system/')) return null;
    if (typeof OS_FILES === 'undefined') throw new Error('OS_FILES is missing: the kernel must boot from the vibeOS loader');
    const name = rel.slice('system/'.length);
    return OS_FILES.includes(name) ? name : null;
  },
  // Why a write under system/ must not happen, or null. system/os.js was
  // the whole OS once and is loaded by nothing now; a copy under kernel/ or
  // ui/ that the loader does not name would be written, reported saved, and
  // never run — the refusal says which files do.
  refusedSystemWrite(path, text) {
    const rel = String(path).replace(/^\/+/, '');
    if (rel === 'system/os.js' && String(text).trim()) return 'system/os.js is no longer loaded: the OS is system/kernel/*.js and system/ui/*.js now (see list_apps builtin sources). Edit those instead; an empty write retires this file.';
    if (!/^system\/(kernel|ui)\//.test(rel) || this.systemFile(rel)) return null;
    const dir = rel.split('/')[1];
    const loads = OS_FILES.filter(f => f.startsWith(dir + '/')).map(f => 'system/' + f).join(', ');
    return `${rel} is not a file the OS loads, so a copy there would never run. The ${dir} files are: ${loads}. A new module is an edit to one of those (a new function in the nearest file) rather than a new file.`;
  },
  // The stored text of a loaded file, null when there is no copy. Not
  // readPath: that falls back to the served text, and "is it forked" must
  // not.
  async readStoredSystem(name) {
    const st = await this.statPath('system/' + name);
    return st ? st.file.text() : null;
  },
  // A loaded system file reads as the served text when the workspace has no
  // copy — or a blank one: write_file('') is how a fork is retired, and the
  // loader boots the served file over a blank, so edit_file must read the
  // same text the next boot runs, not an empty file no anchor can match.
  async readPath(path) {
    if (!this.open) throw new Error('no workspace is open');
    const file = this.systemFile(path);
    let text = null;
    try {
      const { dir, name } = await this.dirFromPath(path, false);
      text = await (await (await dir.getFileHandle(name)).getFile()).text();
    } catch (e) {
      if (!file) throw new Error('not found: ' + path);
    }
    if (text !== null && (!file || text.trim())) return text;
    return (await this.fetchServed(file)).text;
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
  // One read-modify-write of a path at a time: the chain is keyed by path
  // and dropped when it drains, so a rejected step never wedges the next.
  _exclusive: new Map(),
  exclusive(path, fn) {
    const prev = this._exclusive.get(path) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {}).then(() => { if (this._exclusive.get(path) === tail) this._exclusive.delete(path); });
    this._exclusive.set(path, tail);
    return run;
  },
  async writePath(path, text) {
    if (!this.open) throw new Error('no workspace is open');
    const refused = this.refusedSystemWrite(path, text);
    if (refused) throw new Error(refused);
    const { dir, name } = await this.dirFromPath(path, true);
    const file = this.systemFile(path);
    let forking = false;
    if (file) { try { await dir.getFileHandle(name); } catch { forking = true; } }
    if (forking) await this.recordFork(file);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(text); await w.close();
    if (file) await SystemMirror.refresh(file);
  },
  // First write of a loaded file: pin the version it came from in
  // system/os.version.json, one entry per file since they fork on different
  // days. Written before the fork itself, so a fork with no record
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

  // Which OS files boot from the workspace: every loaded file with a stored
  // copy, or those under `prefix`. A blank file counts as none: the loader
  // reads it as "stock" (that is how write_file('') un-forks), so a reload
  // after one would come back the same and say nothing.
  async forkedSystem(prefix = '') {
    const out = [];
    for (const name of OS_FILES) {
      if (!name.startsWith(prefix)) continue;
      const text = await this.readStoredSystem(name);
      if (text !== null && text.trim()) out.push('system/' + name);
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

// Where a window opens: `// @geometry <corner> [WxH]`, `// @geometry
// x,y,w,h` or `// @geometry WxH` (a size, cascaded like any window — the
// shape the model wrote first, twice in two runs), in px. null without the
// header; a header that is none of those throws naming them — create_app
// refuses the source rather than open the window somewhere else and say it
// did what was asked.
const GEOMETRY_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
function parseGeometry(src) {
  const m = /^\s*\/\/\s*@geometry\s+(.+)$/m.exec(src);
  if (!m) return null;
  const line = m[1].trim();
  const nums = line.match(/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/);
  if (nums) return { x: +nums[1], y: +nums[2], w: +nums[3], h: +nums[4] };
  const size = line.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (size) return { w: +size[1], h: +size[2] };
  const corner = line.match(/^([a-z]+-[a-z]+)(?:\s+(\d+)\s*[x×]\s*(\d+))?$/i);
  if (corner && GEOMETRY_CORNERS.includes(corner[1].toLowerCase())) {
    return { corner: corner[1].toLowerCase(), w: corner[2] ? +corner[2] : 430, h: corner[3] ? +corner[3] : 320 };
  }
  throw new Error('// @geometry must be one of ' + GEOMETRY_CORNERS.join(', ') + ' with an optional <w>x<h>, or <x>,<y>,<w>,<h>, or <w>x<h> alone, in px — got: ' + line.slice(0, 60));
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
  // A header create_app would refuse, in a file that reached the folder or
  // /mnt some other way: unlisted with that reason, or the dock listed it and
  // a click on it threw in launchApp with nothing on screen.
  try { parseGeometry(source); } catch (e) { return { name, reason: e.message }; }
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
  if (/api\.(shell|tty)\s*\(/.test(source)) return null;
  const machine = `The machine is ${VM.state}.`;
  if (/\b(terminal|term|shell|console)\b/i.test(title)) {
    return { rule: 'fake_terminal', error: `a terminal must drive the Linux VM: declare // @requires tty and attach api.tty() (bytes both ways — Ctrl-C, top, vi, passwords), or // @requires shell and run each line with api.shell(line). ${machine}` };
  }
  if (requires.includes('shell')) {
    return { rule: 'unused_shell', error: `declares // @requires shell but never calls api.shell(). Run commands through api.shell(cmd) or drop the requirement. ${machine}` };
  }
  if (requires.includes('tty')) {
    return { rule: 'unused_tty', error: `declares // @requires tty but never calls api.tty(). Attach the terminal with api.tty() or drop the requirement. ${machine}` };
  }
  return null;
}

function parseTarget(src) {
  const m = /^\s*\/\/\s*@target\s+(\w+)/m.exec(src);
  return m ? m[1] : 'browser';
}
function parseFile(src) {
  const m = /^\s*\/\/\s*@file\s+(.+)$/m.exec(src);
  return m ? m[1].trim() : null;
}

/* ---------- /mnt/system: the OS source, read-only, inside the machine ----

   The workspace's system/ is never synced and never mounted: it holds the
   chat log, the version record, the snapshots. What the guest gets instead
   is a copy of the files the loader runs — the same text, stored fork or
   served — so `cat /mnt/system/ui/dock.js`, grep and diff work from the
   Terminal and from the agent's vm_exec. Written host-side through 9p at
   every 'ready' (a cold boot and a restore alike: the snapshot's copy may be
   older than the fork that boots) and again on every Workspace.writePath of
   a loaded file, so after edit_file the mirror shows the fork before
   reload_ui/reload_os runs it. Read-only for the guest by a bind mount
   remounted ro: root ignores 0444, but the kernel answers EROFS on a ro
   mount (measured on busybox: "can't create … Read-only file system", rm
   and touch the same). The host's writes bypass the guest kernel and land
   regardless. Trust by convention like the app gate: root can umount it.
   -------------------------------------------------------------------- */
const SystemMirror = {
  DIR: 'system',
  // The loader and its two libraries are served, never forked (index.html
  // is the trusted loader; the page cannot write it).
  SERVED_ONLY: ['index.html', 'oauth.js', 'skills.js'],
  // One exec on the boot's queue, not four: the setup is a script the host
  // drops at a root-level dotfile (hidden from Sync and Files like .vfetch-N)
  // because the serial line editor wraps a command over 80 columns into its
  // own output. The ro check makes a restore idempotent: the bind survives in
  // the snapshot, and a second one would stack a mount per restore.
  SCRIPT: [
    'mkdir -p /mnt/system/kernel /mnt/system/ui || exit 1',
    "grep -q ' /mnt/system 9p ro' /proc/mounts && { echo ok; exit 0; }",
    'mount -o bind /mnt/system /mnt/system || exit 1',
    'mount -o remount,ro,bind /mnt/system || exit 1',
    'echo ok',
  ].join('\n') + '\n',
  SETUP: 'sh /mnt/.sysmirror.sh; rm -f /mnt/.sysmirror.sh',
  // Alpine mounts /mnt with cache=loose (scripts/alpine/Dockerfile): a host
  // rewrite of an inode the guest has already read is served from the page
  // cache — after edit_file, grep still found 0 in the guest; a restored
  // snapshot's cache holds every file it booted with. Measured: rc=0 and the
  // next cat shows the new text. BusyBox mounts cache=none and does not need
  // it; one exec on every image is cheaper than knowing which is which.
  DROP: 'echo 3 > /proc/sys/vm/drop_caches; echo rc=$?',
  state: '',        // '' | writing | ready | failed
  error: '',
  written: 0,
  ready: null,      // the populate in flight or done, for a refresh to queue behind
  pending: new Set(),   // system files written before the machine was ready

  status() { return { state: this.state, error: this.error, written: this.written }; },

  get names() {
    if (typeof OS_FILES === 'undefined') throw new Error('OS_FILES is missing: the kernel must boot from the vibeOS loader');
    return [...OS_FILES, ...this.SERVED_ONLY];
  },

  // The text the loader ran this boot: __vibeosBoot.files says where each
  // loaded file came from and .stored holds the stored texts it handed the
  // kernel and the ui registry. Not readPath: on a recovery or ?safe=1 boot
  // the served file runs over a stored fork, and the mirror must say so.
  async bootText(name) {
    const b = window.__vibeosBoot;
    if (!b || !b.files) throw new Error('__vibeosBoot.files is missing: the kernel must boot from the vibeOS loader');
    // UI.source is the truth for ui files: a stored ui that failed to paint
    // is put aside for the served one after the loader has said 'stored'.
    const source = (name in UI.source) ? UI.source[name] : b.files[name];
    if (source === 'stored') {
      const text = b.stored && b.stored.files && b.stored.files[name];
      if (typeof text !== 'string') throw new Error(`the loader says system/${name} is stored but handed over no text`);
      return text;
    }
    return (await Workspace.fetchServed(name)).text;
  },

  async put(name, text) {
    await VM.writeQuietly(this.DIR + '/' + name, new TextEncoder().encode(text));
  },
  async dropCaches() {
    const out = await VM.exec(this.DROP);
    if (out !== 'rc=0') throw new Error('drop_caches after writing /mnt/system: ' + JSON.stringify(out));
  },

  // The directories and the read-only mount, then every file: the host's
  // writes bypass the guest kernel, so the mount's order does not matter and
  // mkdir -p under a restored machine's ro mount is rc=0 (measured).
  populate() {
    this.ready = this._populate().catch(e => {
      this.state = 'failed'; this.error = e.message;
      console.warn('/mnt/system was not mirrored:', e.message);
    });
    return this.ready;
  },
  async _populate() {
    this.state = 'writing'; this.error = ''; this.written = 0;
    await VM.writeQuietly('.sysmirror.sh', new TextEncoder().encode(this.SCRIPT));
    const out = await VM.exec(this.SETUP);
    if (out !== 'ok') throw new Error('/mnt/system setup: ' + JSON.stringify(out));
    for (const name of this.names) { await this.put(name, await this.bootText(name)); this.written++; }
    // A file written before the machine was ready shows what its write left
    // on disk, like one written after — not the text that booted.
    for (const name of this.pending) await this.put(name, await Workspace.readPath('system/' + name));
    this.pending.clear();
    await this.dropCaches();
    this.state = 'ready';
  },

  // After a write of system/<name>: the fork, or the served text when the
  // write retired it (readPath's rule — the text the next boot runs). The
  // mirror is a view of a write that is already on disk and will boot, so
  // its failure is recorded here, never thrown into edit_file's result.
  async refresh(name) {
    if (!VM.ready()) { this.pending.add(name); return; }
    try {
      if (this.ready) await this.ready;
      await this.put(name, await Workspace.readPath('system/' + name));
      await this.dropCaches();
      this.state = 'ready'; this.error = '';
    } catch (e) {
      this.state = 'failed'; this.error = `system/${name}: ${e.message}`;
      console.warn('/mnt/system was not refreshed:', this.error);
    }
  },
};
VM.on((s, transition) => { if (s === 'ready' && transition) SystemMirror.populate(); });

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
    return all ? all.filter(e => e.parentid === 0 && e.type !== 'file' && e.name !== SystemMirror.DIR)
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
    return { rows, unmirrored: this.unmirrored(), system: SystemMirror.status() };
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
    // A card's source and a user turn's pictures live in the page only: the
    // file holds what it always held.
    const text = JSON.stringify({ v: 1, turns }, (k, v) => (k === 'src' || k === 'shots') ? undefined : v, 1);
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
