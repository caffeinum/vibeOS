/* ui/windows.js — window chrome, the sandbox generated apps run in, the
 * shell's own apps and the dock's icons. A ui module: an ES module the
 * kernel imports from its text (served, or system/ui/windows.js) and can
 * import again on reload_ui. The one thing it imports is Lit, by the bare
 * name the loader's import map resolves to vendor/lit.js (a blob-URL module
 * cannot name a path: its base URL is opaque). Every kernel symbol it uses
 * (VM, Workspace, CAP, UI, …) is a global of a classic script, which is
 * what lets the same text run served or from a blob URL with no build step.
 */
import { LitElement, html, nothing } from 'lit';

/* ---------- the chrome: <vibeos-window> ---------------------------------

   A window's frame is a Lit element rendered in light DOM — os.css styles
   `.win .titlebar` and the suites find `.win .title`, so no shadow root —
   from the kernel's record: `el.rec` in, DOM events out (close, minimise,
   zoom, drag, resize call the kernel or move the host's own style). The
   element owns no state: the record is the kernel's, subscriptions go
   through Windows.onDispose on this element, the body is a plain div the
   renderer paints into and lit never touches again (nothing binds inside
   it, so a re-render diffs around it).

   The tag is registered once per page — customElements.define refuses a
   second class under the same name — and every ui import after the first
   (a reload_ui) hands its OWN template function to the element (`el.view`),
   so an edit to `chrome()` below is live on the next reload_ui while the
   class itself is two lines that never need to change. The chrome renders
   synchronously in build() through performUpdate(): the record's body must
   exist before the renderer runs, and a reload_ui trial paints into
   detached elements that Lit would otherwise not update until connected.
   -------------------------------------------------------------------- */
class VibeosWindow extends LitElement {
  createRenderRoot() { return this; }
  render() { return this.view(this); }
}
if (!customElements.get('vibeos-window')) customElements.define('vibeos-window', VibeosWindow);

// The template, from the record. Interpolations are text: a title from a
// generated app's header or the model reaches the title bar as characters.
function chrome(el) {
  const { title, badge } = el.rec.spec;
  return html`
    <div class="titlebar" @mousedown=${e => dragStart(e, el)}>
      <button class="tl r" title="Close" @click=${() => Windows.close(el)}></button>
      <button class="tl y" title="Minimise" @click=${() => el.classList.add('min')}></button>
      <button class="tl g" title="Zoom" @click=${() => zoom(el)}></button>
      <span class="title">${title}</span>
      ${badge ? html`<span class="badge">${badge}</span>` : nothing}
    </div>
    <div class="body"></div>
    <div class="resize" @mousedown=${e => resizeStart(e, el)}></div>`;
}

function zoom(el) {
  if (el.dataset.full === '1') { Object.assign(el.style, JSON.parse(el.dataset.prev)); el.dataset.full = '0'; return; }
  el.dataset.prev = JSON.stringify({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height });
  Object.assign(el.style, { left: '8px', top: '38px', width: 'calc(100% - 16px)', height: 'calc(100% - 110px)' });
  el.dataset.full = '1';
}

function dragStart(e, el) {
  drag(e, { l: parseFloat(el.style.left), t: parseFloat(el.style.top) },
    (dx, dy, s) => { el.style.left = Math.max(0, s.l + dx) + 'px'; el.style.top = Math.max(30, s.t + dy) + 'px'; });
}

function resizeStart(e, el) {
  drag(e, { w: el.offsetWidth, h: el.offsetHeight },
    (dx, dy, s) => { el.style.width = Math.max(300, s.w + dx) + 'px'; el.style.height = Math.max(180, s.h + dy) + 'px'; });
}

function drag(e, s, move) {
  e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY;
  const mv = ev => move(ev.clientX - x0, ev.clientY - y0, s);
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}

// A SHELL entry names its renderer by export (render: 'ChatApp'), resolved
// through the live ui at open time; the loader's diff window passes a
// function. Renderers get (body, win, opts, state): opts from the spec,
// state the kernel's bag for the window, which outlives this module.
function renderer(spec) {
  const fn = typeof spec.render === 'function' ? spec.render : UI.live()[spec.render];
  if (typeof fn !== 'function') throw new Error('openWindow: "' + spec.title + '" names no renderer (' + String(spec.render) + ')');
  return fn;
}

export function openWindow(spec) {
  const rec = Windows.track(Object.assign({ id: '', badge: '', w: 560, h: 380, opts: {} }, spec));
  let el, done;
  try { ({ el, done } = build(rec, null)); }
  catch (e) { Windows.untrack(rec); throw e; }
  rec.done = done;
  done.catch(() => {});   // awaited by whoever opened it; not an unhandled rejection here
  Windows.attach(rec, el);
  document.getElementById('desktop').appendChild(el);
  return el;
}

// Chrome and content for a record, in one element that is not in the
// document yet: openWindow appends it, a reload_ui trial keeps it aside
// until every window has painted. `geom` is where the previous chrome was
// (from geometry()), or null for the next cascade slot. `done` settles when
// the renderer has — a renderer that throws, or returns a promise that
// rejects, fails the trial rather than the page.
export function build(rec, geom) {
  const { id, w, h, title, badge } = rec.spec;
  // A title or badge that is not a string comes from the model (create_app
  // passes input.title through) and would reach Lit as a child value: an
  // array renders its items joined, an object is Lit's own error. Refuse
  // it here, naming the window, before anything is built.
  for (const [k, v] of [['title', title], ['badge', badge]]) {
    if (typeof v !== 'string') throw new Error('build: a window ' + k + ' must be a string, got ' + (Array.isArray(v) ? 'an array' : v === null ? 'null' : 'a ' + typeof v) + (k === 'badge' ? ' for "' + String(title) + '"' : ''));
  }
  const el = document.createElement('vibeos-window');
  el.className = 'win';
  if (id) el.dataset.app = id;
  Windows.stamp(rec, el);
  Object.assign(el.style, { width: w + 'px', height: h + 'px' }, Windows.place());
  if (geom) {
    Object.assign(el.style, { left: geom.left, top: geom.top, width: geom.width, height: geom.height, zIndex: geom.zIndex });
    Windows.z = Math.max(Windows.z, Number(geom.zIndex) || 0);
    if (geom.min) el.classList.add('min');
    if (geom.full) el.dataset.full = geom.full;
    if (geom.prev) el.dataset.prev = geom.prev;
  }
  el.rec = rec;
  el.view = chrome;
  el.performUpdate();
  if (!el.querySelector('.body')) throw new Error('build: the chrome rendered no body for "' + rec.spec.title + '"');
  el.addEventListener('mousedown', () => Windows.raise(el), true);
  return { el, done: paint(rec, el) };
}

// Paint the record's content into a chrome. Not async, on purpose: a
// renderer that throws synchronously throws out of here, and the promise is
// only for a renderer that returns one.
function paint(rec, el) {
  const body = el.querySelector('.body');
  const result = renderer(rec.spec)(body, el, rec.spec.opts || {}, rec.state);
  return Promise.resolve(result);
}

// Paint a window again in its own chrome, from this module. The kernel
// calls it on the previous ui after a candidate failed mid-trial, since the
// candidate's paints may have taken state-owned nodes (the machine's screen)
// with them.
export function repaint(rec) {
  Windows.dispose(rec.el);
  const body = rec.el.querySelector('.body');
  body.innerHTML = '';
  body.className = 'body';
  body.removeAttribute('style');
  return paint(rec, rec.el);
}

// Where a chrome is, as this module laid it out, for the next ui to put
// its chrome in the same place.
export function geometry(el) {
  return { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height, zIndex: el.style.zIndex,
           min: el.classList.contains('min'), full: el.dataset.full || '', prev: el.dataset.prev || '' };
}

export function focusOrOpen(spec) {
  const open = document.querySelector(`.win[data-app="${spec.id}"]`);
  if (!open) return openWindow(spec);
  open.classList.remove('min');
  Windows.raise(open);
  return open;
}

export function raise(el) { Windows.raise(el); }

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

function createAppApi(provider, mount, title) {
  let resizeCb = null;
  const ro = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    mount.style.setProperty('--mount-w', Math.round(width) + 'px');
    mount.style.setProperty('--mount-h', Math.round(height) + 'px');
    if (resizeCb) resizeCb(width, height);
  });
  ro.observe(mount);
  Windows.onDispose(mount.closest('.win'), () => ro.disconnect());
  const streams = new Set();
  Windows.onDispose(mount.closest('.win'), () => { for (const s of streams) s.close(); });
  return {
    async list(...args) { return provider.list(...args); },
    async shell(...args) { return provider.shell(...args); },
    // A byte stream with its own shell on the machine's second serial line.
    // Held by this window: closing it (or a repaint) gives the line back,
    // and the kernel's close() emits so a Terminal waiting for it attaches.
    tty() {
      const handle = provider.tty(title);
      Windows.onDispose(mount.closest('.win'), () => handle.close());
      return handle;
    },
    // Raw TCP through the relay (kernel/net.js), not the machine's stack:
    // a connection is the window's and closes with it. One disposer for
    // the window, not one per connect: an app that connects in a loop
    // would otherwise grow the window's list for its whole life.
    net: {
      connect(host, port, opts) {
        const stream = Net.connect(host, port, opts);
        streams.add(stream);
        stream.onClose(() => streams.delete(stream));
        return stream;
      },
    },
    onResize(fn) {
      resizeCb = fn;
      fn(mount.clientWidth, mount.clientHeight);
    },
    mountSize() {
      return { width: mount.clientWidth, height: mount.clientHeight };
    },
  };
}

async function runModule(source, mount, provider, title) {
  const api = createAppApi(provider, mount, title);
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    const mod = await import(url);
    if (typeof mod.default !== 'function') throw new Error('module must `export default function(mount, api)`');
    await mod.default(mount, api);
  } finally { URL.revokeObjectURL(url); }
}

// A generated app's window. The app ({ title, source, requires }) rides in
// the spec's opts, so a reload_ui reruns the module from its source in the
// new ui's sandbox rather than through a closure of the old one.
export function launchApp(app) {
  if (!app || typeof app.source !== 'string') throw new Error('launchApp: an app needs a source');
  const missing = missingCaps(app.requires);
  return openWindow({
    title: app.title, badge: missing.length ? 'blocked' : 'app', w: 430, h: 320,
    render: 'AppWindow', opts: { app },
  });
}

export function AppWindow(body, win, { app }) {
  const missing = missingCaps(app.requires);
  const mount = createAppMount(body);
  const start = async () => {
    try { await runModule(app.source, mount, CAP, app.title); }
    catch (e) { mount.textContent = ''; const m = document.createElement('p'); m.className = 'no small'; m.textContent = e.message; mount.appendChild(m); }
  };
  if (!missing.length) return start();
  renderUpsell(mount, missing);
  // Blocked only on the machine while it boots: open the app the moment
  // it is ready instead of leaving a "blocked" window behind. The
  // subscription is the window's: closed or repainted, it lets go. The tty
  // comes up after 'ready' (its own state, on every emit), so the check is
  // "nothing missing any more", not the state name.
  // `some`, not `every`: an app on shell AND net while the relay is off is
  // still waiting on the machine, and stayed on "still booting" forever when
  // 'net' in the list switched the watcher off.
  if (missing.some(c => VM_CAPS.includes(c)) && VM.state !== 'failed' && VM.state !== 'unavailable') {
    const off = VM.on(() => {
      const still = missingCaps(app.requires);
      if (!still.length) { off(); start(); return; }
      renderUpsell(mount, still);
    });
    Windows.onDispose(win, off);
  }
}

// The capabilities the VM provides once it is up, as against the native build's.
const VM_CAPS = ['shell', 'tty'];

// The limitation is the conversion moment, not a dead end.
function renderUpsell(mount, missing) {
  // "shell" is not a native-only capability: the VM provides it the moment it
  // is ready. Saying "a browser tab cannot provide" it while the machine was
  // still booting sent people (and the agent) away from kernel-backed apps —
  // the exact apps this OS exists to run. Say what is actually true.
  const vmCaps = missing.filter(c => VM_CAPS.includes(c));
  const net = missing.includes('net');
  const nativeOnly = missing.filter(c => !VM_CAPS.includes(c) && c !== 'net');
  // net is neither the machine's nor the native build's: it is the relay,
  // and the relay is a setting. Say that instead of sending people to a
  // binary for a switch in Settings — alone, or under the machine's line
  // and the native build's, so it never drops out of the text when paired.
  const netLine = net ? '<p class="small muted" style="margin:0 0 10px">It also opens TCP connections through the relay, and the relay is turned off: Settings &rsaquo; Network turns it on; the app runs on the next launch.</p>' : '';
  if (net && !vmCaps.length && !nativeOnly.length) {
    mount.innerHTML = `
      <div class="upsell">
        <h3 style="margin:0 0 6px">Networking is off</h3>
        <p class="small muted" style="margin:0 0 10px">This app opens TCP connections through the relay, and the relay is turned off. Settings &rsaquo; Network turns it on; the app runs on the next launch.</p>
      </div>`;
    return;
  }
  if (vmCaps.length && !nativeOnly.length) {
    const ttyDown = vmCaps.includes('tty') && VM.state === 'ready' && VM.ttyState === 'failed';
    const why = ttyDown ? `the machine is ready but its terminal line failed: ${VM.ttyError}`
      : VM.state === 'ready' ? (vmCaps.includes('tty') ? 'the machine is ready and its terminal line is starting' : 'ready')
      : VM.state === 'failed' || VM.state === 'unavailable' ? `the machine is ${VM.state}${VM.detail ? ': ' + VM.detail : ''}`
      : `the machine is still ${VM.state || 'starting'} — this window opens by itself when it is ready`;
    mount.innerHTML = `
      <div class="upsell">
        <h3 style="margin:0 0 6px">Waiting for Linux</h3>
        <p class="small muted" style="margin:0 0 10px">This app uses the <b></b>, which the VM provides. Right now <span class="why"></span>.</p>
        ${netLine}
        ${VM.state === 'failed' || VM.state === 'unavailable' || ttyDown
          ? '<button class="btn sm" id="upsellRestart">Restart the machine</button>'
          : '<p class="tiny dimmer" style="margin:0">Settings &rsaquo; Machine shows the boot console.</p>'}
      </div>`;
    // The reason can carry the guest's last bytes (ttyError): text, not html.
    mount.querySelector('b').textContent = vmCaps.join(' and ');
    mount.querySelector('.why').textContent = why;
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
      ${netLine}
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

export const ICONS = {
  vibeos: `<img src="${BASE}icon.png" alt=""" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-win)" onerror="this.replaceWith(document.createTextNode('◇'))">`,
  settings: '⚙',
};

// The shell's own apps. `file` is where the agent finds the source and
// `render` the export that paints it; list_apps reports both.
export const SHELL = {
  chat:     { id: 'chat', title: 'vibeOS', badge: 'agent', render: 'ChatApp', file: 'ui/chat.js', w: 580, h: 500 },
  browser:  { id: 'browser', title: 'Browser', badge: 'proxied', render: 'BrowserApp', file: 'ui/browser.js', w: 820, h: 560 },
  settings: { id: 'settings', title: 'Settings', badge: '', render: 'SettingsApp', file: 'ui/settings.js', w: 720, h: 480 },
};
export const openSettings = (tab) => openWindow(Object.assign({}, SHELL.settings, { opts: { tab } }));
