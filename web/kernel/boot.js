/* vibeOS kernel — the ui registry and the boot sequence. Loaded last of the
 * kernel files; never hot-reloads.
 *
 * The ui is the set of ES modules the loader names in UI_FILES, each imported
 * as a blob URL from its text — the served file, or system/ui/<name>.js in
 * the workspace — and merged into one namespace, UI.api. Nothing in the
 * kernel names a ui function directly: the few it calls (openWindow,
 * launchApp, paintDock, …) are the delegates at the bottom of this file,
 * which resolve through UI.api at call time. That is what makes the ui
 * replaceable under a running kernel.
 */

/* ---------- the windows, held by the kernel --------------------------

   A window is a record here: which app, with what options, its state bag,
   and the chrome element the ui built for it. The ui paints; the kernel
   remembers. On reload_ui every record is painted again by the new ui —
   the same state bag, the geometry read off the old chrome — so a Settings
   pane comes back on its tab, the Browser on its page, an app window
   running its module again, and the chat from ChatLog.

   What a window subscribed to (VM.on, Sync.onRun, a ResizeObserver, the
   VM's screen borrowed into a pane) is registered on the chrome element
   itself through Windows.onDispose and run by Windows.dispose: on close,
   before a repaint, on a Settings tab switch, and when a reload retires the
   old chrome. Element-owned, not record-owned, because during a trial the
   old chrome and the candidate's both exist for the same record and each
   must undo only its own.
   -------------------------------------------------------------------- */

const Windows = {
  list: [],   // every open window, in open order: { id, spec, state, el, done }
  seq: 0,
  z: 10,
  offset: 0,

  // spec: { id (a shell app id, or ''), title, badge, w, h, render (an
  // export name, or a function), opts }. Renderers get (body, win, opts,
  // state).
  track(spec) {
    if (!spec || !spec.title) throw new Error('a window needs a title');
    const rec = { id: String(++this.seq), spec, state: {}, el: null, done: Promise.resolve() };
    this.list.push(rec);
    return rec;
  },
  stamp(rec, el) { el.dataset.win = rec.id; },
  attach(rec, el) { rec.el = el; this.stamp(rec, el); },
  // A record whose chrome never got built: the renderer threw before
  // attach(). Left in the list it is a window with no element, and every
  // later reload_ui trial died reading its geometry — blaming the candidate
  // for a ghost no file edit could remove.
  untrack(rec) { this.list = this.list.filter(r => r !== rec); },
  rec(el) {
    const id = el && el.dataset ? el.dataset.win : undefined;
    const rec = this.list.find(r => id !== undefined && r.id === id);
    if (!rec) throw new Error('not an open window: ' + (el && el.className));
    return rec;
  },
  place() {
    const at = { left: (60 + (this.offset % 5) * 34) + 'px', top: (60 + (this.offset % 5) * 28) + 'px', zIndex: String(++this.z) };
    this.offset++;
    return at;
  },
  raise(el) { el.style.zIndex = ++this.z; },
  onDispose(el, fn) {
    if (!el || !el.dataset || el.dataset.win === undefined) throw new Error('onDispose: not a window chrome');
    if (typeof fn !== 'function') throw new Error('onDispose: not a function');
    (el.__disposers || (el.__disposers = [])).push(fn);
  },
  dispose(el) {
    const list = el.__disposers || [];
    el.__disposers = [];
    for (const fn of list) fn();
  },
  close(el) {
    const rec = this.rec(el);
    this.dispose(el);
    this.list = this.list.filter(r => r !== rec);
    el.remove();
  },
  byApp(id) { return this.list.filter(r => r.spec.id === id); },
};

/* ---------- the ui registry --------------------------------------------

   Hot reload is: read every ui file again (stored or served), refuse the
   set if one does not parse, import them all, then TRY the candidate
   before it is live — paint the dock and every open window from it into
   detached elements, with each window's own state bag — and only when all
   of that succeeded retire the old chrome and put the candidate's in its
   place. A candidate that throws or rejects while painting goes nowhere:
   its subscriptions are undone, the previous ui is put back, the windows
   it touched are repainted by that ui, and the error is the result. The
   prototype swapped first and painted second, which left a module whose
   default() threw live, with every window of its kind wiped, and the tool
   saying it was applied.
   -------------------------------------------------------------------- */

// A ui module whose import never settles (a top-level await that hangs, an
// import of one) would otherwise hang reload_ui — the tool call never
// returning, the turn never ending — and hang the boot with no chat and no
// bar. A classic-script os.js could not do that; the split can, so every
// import and every trial paint is raced against a deadline that names the
// file or the window.
const UI_IMPORT_MS = 10000, UI_PAINT_MS = 15000;
function deadline(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} did not settle in ${ms / 1000} s`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const UI = {
  api: null,        // the merged exports of every ui module, or null before boot
  previous: null,   // during a trial: the ui that is still live on the desktop
  source: {},       // 'ui/chat.js' -> 'served' | 'stored'
  bootMs: 0,
  stop: null,       // undoes the live ui's menubar subscriptions (from its start())
  swaps: 0,         // reloads applied this page

  live() {
    if (!this.api) throw new Error('the ui is not loaded yet');
    return this.api;
  },

  // The ui that owns the desktop right now. During a trial UI.api is the
  // candidate (its renderers resolve siblings through live()), but a kernel
  // event in that window — the machine reaching 'ready', a create_app — must
  // paint the LIVE dock with the ui that is live, or a candidate that then
  // failed had already painted the real dock.
  stable() { return this.previous || this.live(); },

  // The text of one ui file for this boot: the workspace copy when the loader
  // read one and this boot may use it, the served file otherwise. The loader
  // already decided the recovery and ?safe=1 cases by handing over no stored
  // set at all, so this asks nothing about them again.
  async text(file, { stock }) {
    const stored = !stock && window.__vibeosBoot.stored && window.__vibeosBoot.stored.files[file];
    if (stored !== null && stored !== undefined && stored !== false && stored.trim()) return { text: stored, source: 'stored' };
    return { text: await fetchServed(file), source: 'served' };
  },

  // A blob URL is a fresh module every time; the same URL would be cached
  // and re-importing it would hand back the old namespace.
  async importText(text, file) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try { return await deadline(import(url), UI_IMPORT_MS, `importing system/${file}`); }
    finally { URL.revokeObjectURL(url); }
  },

  // Every module's exports in one object. Two modules exporting the same
  // name would shadow each other silently, and the later file would win by
  // load order; refuse that instead.
  merge(namespaces) {
    const api = {};
    for (const [file, ns] of namespaces) {
      for (const key of Object.keys(ns)) {
        if (key in api) throw new Error(`ui export "${key}" is defined twice (${file} and an earlier ui file)`);
        api[key] = ns[key];
      }
    }
    return api;
  },

  // Import every ui file, stored or served. A stored copy that fails to
  // import is named in the recovery bar and its served file is used instead:
  // a page with no windows at all is not a better outcome than a stock chat.
  async load({ stock }) {
    const t0 = performance.now();
    const namespaces = [];
    const source = {};
    for (const file of UI_FILES) {
      let picked = await this.text(file, { stock });
      let ns;
      try { ns = await this.importText(picked.text, file); }
      catch (e) {
        if (picked.source !== 'stored') throw e;
        recoveryBar(`Your edited system/${file} failed to load, so the served one is running.`, e.message);
        picked = await this.text(file, { stock: true });
        ns = await this.importText(picked.text, file);
      }
      namespaces.push([file, ns]);
      source[file] = picked.source;
    }
    this.api = this.merge(namespaces);
    this.source = source;
    this.bootMs = Math.round(performance.now() - t0);
  },

  // Paint the desktop from the live ui: the menubar, the dock, the first
  // window. Everything the boot needs a ui for, in one place, so the boot
  // can try a stored ui and fall back to the served one when it cannot.
  async open() {
    if (this.stop) this.stop();
    this.stop = this.live().start();
    await deadline(paintDock(), UI_PAINT_MS, 'painting the dock');
    const el = focusOrOpen(this.live().SHELL.chat);
    await deadline(Windows.rec(el).done, UI_PAINT_MS, 'painting the chat');
  },

  // The hot path: { ok, ... } for the tool, never a throw for a ui that is
  // merely broken. `stock` reloads the served files whatever the workspace
  // holds.
  async reload({ stock = false } = {}) {
    const t0 = performance.now();
    const picked = [];
    for (const file of UI_FILES) {
      const stored = stock ? null : await Workspace.readStoredSystem(file);
      const text = stored !== null && stored.trim() ? stored : await fetchServed(file);
      const source = stored !== null && stored.trim() ? 'stored' : 'served';
      const syntax = moduleParseError(text);
      if (syntax) return { ok: false, file: 'system/' + file, error: `system/${file} does not parse: ${syntax} — the ui was not touched; fix the file and call reload_ui again` };
      picked.push({ file, text, source });
    }
    const namespaces = [];
    for (const { file, text } of picked) {
      try { namespaces.push([file, await this.importText(text, file)]); }
      catch (e) { return { ok: false, file: 'system/' + file, error: `system/${file} failed to import: ${e.message} — the ui was not touched` }; }
    }
    let api;
    try { api = this.merge(namespaces); }
    catch (e) { return { ok: false, error: e.message + ' — the ui was not touched' }; }
    let trial;
    try { trial = await this.trial(api); }
    catch (e) {
      return { ok: false, error: `the new ui failed while painting ${e.__where || 'the desktop'}: ${e.message} — the previous ui is still running, its windows repainted; fix the file and call reload_ui again` };
    }
    const repainted = this.swap(api, trial);
    this.source = Object.fromEntries(picked.map(p => [p.file, p.source]));
    this.swaps++;
    return { ok: true, hot: true, ms: Math.round(performance.now() - t0), repainted, sources: this.source };
  },

  // Paint everything from the candidate into elements that are not in the
  // document. The candidate has to be UI.api while it paints: renderers
  // resolve their siblings through UI.live() (a SettingsApp reached from
  // openSettings, the SHELL the dock lists), so the candidate is only
  // reachable through the registry.
  async trial(api) {
    const prev = this.api;
    const dock = document.createElement('div');
    dock.id = 'dock';
    const built = [];
    this.api = api;
    this.previous = prev;
    try {
      try { await deadline(api.paintDock(dock), UI_PAINT_MS, 'painting the dock'); }
      catch (e) { e.__where = 'the dock'; throw e; }
      // A window the kernel opens while a renderer is awaited (the previous
      // ui builds it, through stable()) is a record the candidate has not
      // painted; go round until every record has its candidate chrome.
      for (;;) {
        const pending = Windows.list.filter(rec => !built.some(([r]) => r === rec));
        if (!pending.length) break;
        for (const rec of pending) {
          if (!Windows.list.includes(rec)) continue;   // closed while an earlier renderer was awaited
          try {
            const { el, done } = api.build(rec, prev.geometry(rec.el));
            built.push([rec, el]);
            await deadline(done, UI_PAINT_MS, `painting the window "${rec.spec.title}"`);
          } catch (e) { e.__where = `the window "${rec.spec.title}"`; throw e; }
        }
      }
    } catch (e) {
      this.api = prev;
      this.previous = null;
      // The candidate's paints subscribed things and may have moved
      // state-owned nodes (the machine's screen) into their bodies; undo
      // the first, and let the previous ui take the second back.
      for (const [, el] of built) { try { Windows.dispose(el); } catch {} }
      for (const [rec] of built) {
        if (!Windows.list.includes(rec)) continue;   // closed during the trial
        try { await prev.repaint(rec); }
        catch (e2) { console.error('repaint after a failed ui trial failed too:', e2); }
      }
      throw e;
    }
    this.previous = null;
    return { built, dock };
  },

  // The candidate painted everything: retire the old chrome and put the
  // candidate's where it was, same records, same state bags. Returns how
  // many windows that was.
  swap(api, { built, dock }) {
    if (this.stop) this.stop();
    let swapped = 0;
    for (const [rec, el] of built) {
      if (!Windows.list.includes(rec)) { Windows.dispose(el); continue; }   // closed during the trial
      const old = rec.el;
      Windows.dispose(old);
      old.replaceWith(el);
      Windows.attach(rec, el);
      swapped++;
    }
    document.getElementById('dock').replaceWith(dock);
    this.api = api;
    this.stop = api.start();
    return swapped;
  },
};

// The kernel's few calls into the ui, resolved at call time — to the ui
// that owns the desktop, never to a candidate mid-trial.
function openWindow(spec) { return UI.stable().openWindow(spec); }
function focusOrOpen(spec) { return UI.stable().focusOrOpen(spec); }
function launchApp(app) { return UI.stable().launchApp(app); }
function paintDock() { return UI.stable().paintDock(); }
function openSettings(tab) { return UI.stable().openSettings(tab); }

async function detectMode() {
  const native = await NativeProvider.probe();
  CAP = native ? NativeProvider : BrowserProvider;
}

// A reload key or a closed tab took a whole conversation with the agent with it.
// The chat lives in memory until chat persistence lands, and even after, an
// agent mid-turn is work in flight. Ask before leaving when there is something
// to lose; our own reload_os sets the flag and is not asked about.
window.__vibeosUnsaved = () => {
  try {
    if (window.__vibeosIntentionalUnload) return false;
    return Chat.turns.length > 0 || !!Chat.running;
  } catch { return false; }
};
window.addEventListener('beforeunload', (e) => {
  if (!window.__vibeosUnsaved()) return;
  e.preventDefault();
  e.returnValue = '';   // the browser shows its own "leave page?" prompt; the text is not ours to set
});

(async () => {
  // The loader runs the kernel files in order whatever happened to the one
  // before, so a kernel file that failed to parse shows up here as its
  // globals missing. Say which, rather than the first ReferenceError.
  for (const [name, defined] of [['VM', typeof VM], ['Workspace', typeof Workspace], ['Agent', typeof Agent], ['Theme', typeof Theme]]) {
    if (defined === 'undefined') throw new Error('kernel incomplete: ' + name + ' is not defined — an earlier kernel file failed to load (see the error before this one)');
  }
  const recovering = window.__vibeosBoot.recovering;
  // Paint the saved theme before anything else, or a light-mode desktop
  // flashes dark for the length of the first two awaits.
  Theme.load({ stock: recovering });
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
  // Start the machine BEFORE the key modal. It is an in-page overlay that is
  // awaited, so booting after it left the VM at 'off' until the user dealt with
  // the modal — two slow things in series, with the desktop looking dead in
  // between. The VM needs no key, so it must not wait for one.
  VM.available().then(ok => ok ? VM.boot() : VM.set('unavailable'));
  Sync.start();   // 60s by default; each tick no-ops until the VM and a folder exist

  // The ui comes up behind the key modal too: its files are fetched while
  // the person reads the modal, and the menubar paints as soon as they load.
  // A stored ui that loads but cannot paint the desktop — a chat whose
  // renderer throws, or rejects — is put aside for the served one here and
  // now, with the bar naming what failed: there is nothing to try it against
  // before this, and a boot that died here left the next boot stock without
  // saying which file.
  await UI.load({ stock: recovering });
  Chat.load();
  try { await UI.open(); }
  catch (e) {
    const stored = Object.entries(UI.source).filter(([, src]) => src === 'stored').map(([f]) => 'system/' + f);
    if (!stored.length) throw e;
    for (const rec of [...Windows.list]) { try { rec.el ? Windows.close(rec.el) : Windows.untrack(rec); } catch {} }
    recoveryBar('Your edited ui failed to paint the desktop, so the served ui is running.', stored.join(', ') + ': ' + e.message);
    await UI.load({ stock: true });
    await UI.open();
  }
  // The machine's ready handler, registered after the ui is up and run at
  // once if the machine got there first: it ends in a dock repaint, and a boot
  // that reached 'ready' behind the modal used to find no dock to paint. On
  // the transition only: a repaint (the lease landing, a snapshot) also
  // announces 'ready', and this must not install the CLI or sync again.
  const onReady = async () => {
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
    if (Workspace.open) { try { await Sync.auto(); } catch {} }
    await paintDock();
  };
  VM.on((s, transition) => { if (s === 'ready' && transition) onReady(); });
  if (VM.state === 'ready') onReady();
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
  // The agent is already open (UI.open), not a settings panel — vibeOS is the app.
  bootFinished();
  if (window.__vibeosBoot.source === 'served' && window.__vibeosBoot.storedFailed) {
    recoveryBar('Your edited OS did not finish booting last time, so this is the stock one.',
                'Fix the system/ files in your workspace (or delete them) and reload. Your files and apps are untouched.');
  }
  if (recovering) {
    recoveryBar('The last boot did not finish, so this one skipped your saved theme.',
                'Your theme is still stored. Set it again from Settings > Design, or ignore this.');
  }
})();
