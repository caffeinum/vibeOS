/* ui/dock.js — the dock and the menubar: the workspace, machine and mode
 * pills, the clock. A ui module (see ui/windows.js). start() subscribes the
 * painters and returns the function that unsubscribes them, so a reload_ui
 * can retire this copy without leaving a painter behind on VM.on.
 * paintDock stops after its await when the element it was painting has been
 * retired by a reload_ui swap meanwhile; a trial's detached #dock is painted.
 */

export function paintVM() {
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

export function paintWorkspace() {
  const dot = document.getElementById('wsDot'), txt = document.getElementById('wsText');
  if (Workspace.open) { dot.className = 'dot' + (Workspace.private ? ' warn' : ''); txt.textContent = Workspace.label; }
  else if (Workspace.pending) { dot.className = 'dot warn'; txt.textContent = 'reopen folder'; }
  else { dot.className = 'dot off'; txt.textContent = 'no workspace'; }
}

// How the agent is signed in, in a few words: Codex, an API key, an agent
// through vibeos-mcp, the local server, or nothing. Never the key, never
// an account: a model id, a provider name, the MCP client's own name — all
// textContent. The tooltip says where the credential lives.
function mcpPill() {
  const name = RemoteBridge.agentName || RemoteBridge.detail || 'an agent';
  const paired = RemoteBridge.state === 'connected' || (RemoteBridge.token && RemoteBridge.state === 'waiting');
  if (!paired && !(RemoteBridge.token && RemoteBridge.state === 'pairing')) return { suffix: '', agent: '', on: false, reconnecting: false, titleExtra: '' };
  const live = RemoteBridge.live();
  if (live) return { suffix: ' (mcp)', agent: name, on: true, reconnecting: false, titleExtra: ' ' + name + ' drives this desktop through vibeos-mcp with its own model.' };
  return { suffix: ' (reconnecting)', agent: name, on: false, reconnecting: true, titleExtra: ' ' + name + ' is paired but the relay socket is down or redialing — tool calls may fail until it is back.' };
}
export function loginLine() {
  const mcp = mcpPill();
  const agent = mcp.agent;
  const via = mcp.agent ? (mcp.reconnecting && !Gen.available ? mcp.suffix : mcp.reconnecting ? ' (reconnecting)' : ' + mcp') : '';
  if (Gen.viaServer) return { text: 'Server · ' + (Gen.model || 'local') + via, on: true, warn: mcp.reconnecting, title: 'A local vibeOS server holds the model.' + (agent ? (mcp.reconnecting ? mcp.titleExtra : ' ' + agent + ' also drives this desktop through vibeos-mcp.') : '') };
  if (Gen.provider === 'openai-codex') return { text: 'Codex · ' + Gen.model + via, on: true, warn: mcp.reconnecting, title: 'Signed in with ChatGPT; the model is ' + Gen.model + (Gen.codexModel ? ' (set in Settings › Model)' : ' (the default)') + '. Tokens stay in this browser.' + (agent ? ' ' + agent + ' also drives this desktop through vibeos-mcp.' : '') };
  if (Gen.key && Gen.provider) return { text: 'API key · ' + Gen.provider + ' ' + Gen.model + via, on: true, warn: mcp.reconnecting, title: 'A pasted ' + Gen.provider + ' key, kept in this browser; the model is ' + Gen.model + '.' + (agent ? ' ' + agent + ' also drives this desktop through vibeos-mcp.' : '') };
  if (agent) return { text: 'Agent · ' + agent + (mcp.reconnecting ? mcp.suffix : ' (mcp)'), on: mcp.on, warn: mcp.reconnecting, title: mcp.reconnecting ? mcp.titleExtra.slice(1) : agent + ' drives this desktop through vibeos-mcp with its own model; no model is connected here.' };
  return { text: 'no model', on: false, warn: false, title: 'No model connected. Click to connect one.' };
}

export function paintLogin() {
  const txt = document.getElementById('loginText'), dot = document.getElementById('loginDot'), pill = document.getElementById('loginPill');
  if (!txt) return;
  const { text, on, warn, title } = loginLine();
  txt.textContent = text;
  dot.className = 'dot' + (on ? '' : warn ? ' warn' : ' off');
  pill.title = title;
}

export function paintMode() {
  const native = CAP === NativeProvider;
  document.getElementById('modeText').textContent = CAP.label;
  document.getElementById('modeDot').className = 'dot' + (native ? '' : ' warn');
  document.getElementById('modePill').title = native
    ? 'Local vibeOS binary detected on 127.0.0.1:4571 — full capabilities.'
    : 'No local binary. Browser capabilities only.';
}

// The dock lists vibeOS, then the apps it has built, then Settings — the same
// shape as a real dock, where system panels are one icon and not eight.
export async function paintDock(dock = document.getElementById('dock')) {
  const { SHELL, BUILTIN_ICONS, dockButtonContent } = UI.live();
  dock.innerHTML = '';
  const addIcon = (iconSrc, label, title, onclick, cls) => {
    const b = document.createElement('button');
    b.title = title;
    b.onclick = onclick;
    if (cls) b.className = cls;
    if (cls === 'dock-start') b.id = 'dockStart';
    b.append(dockButtonContent(iconSrc, label || ''));
    dock.appendChild(b);
    return b;
  };

  const ui = UI.live();
  const focusOrOpen = ui.focusOrOpen;
  const openAgent = ui.openAgent || (() => focusOrOpen(SHELL.chat));
  const focusOrLaunch = ui.focusOrLaunch || (app => {
    console.warn('your system/ui/windows.js has no focusOrLaunch — launching a second window; Settings › Design › Take the update');
    return ui.launchApp(app);
  });
  const win95 = Theme.id === 'win95';
  if (win95) {
    addIcon(BUILTIN_ICONS.chat, 'Start', 'Start — open vibeOS agent', () => openAgent(), 'dock-start');
  } else {
    addIcon(BUILTIN_ICONS.vibeos, '', 'vibeOS — ask for an app', () => focusOrOpen(SHELL.chat));
  }
  addIcon(BUILTIN_ICONS.browser, win95 ? 'Web' : '', 'Browser', () => focusOrOpen(SHELL.browser));
  addIcon(BUILTIN_ICONS.terminal, win95 ? 'CL' : '', 'Terminal', () => openSettings('terminal'));

  const live = dock.isConnected;
  let apps = [];
  try { apps = (await Apps.list()).apps; } catch {}
  if (live && !dock.isConnected) return;
  if (apps.length) {
    const sep = document.createElement('span');
    sep.className = 'dock-sep';
    dock.appendChild(sep);
  }
  apps.slice(0, 8).forEach(a => {
    const missing = missingCaps(a.requires);
    const short = win95 ? a.title.slice(0, 2) : '';
    const b = addIcon(a.icon, short, a.title + (missing.length ? ' (needs ' + missing.join(', ') + ')' : ''), () => focusOrLaunch(a));
    if (missing.length) b.style.opacity = '.5';
  });

  const sep2 = document.createElement('span');
  sep2.className = 'dock-sep';
  dock.appendChild(sep2);
  addIcon(BUILTIN_ICONS.settings, win95 ? 'Set' : '', 'Settings', () => focusOrOpen(SHELL.settings));
}

// Wire the menubar to the kernel's state and paint it now. Returns stop().
export function start() {
  const brand = document.getElementById('brandIcon');
  if (brand) brand.src = BASE + 'icon.png';
  const offVM = VM.on(paintVM);
  const offWs = Workspace.on(paintWorkspace);
  const offGen = Gen.on(paintLogin);
  const offBridge = RemoteBridge.on(paintLogin);
  paintVM(); paintWorkspace(); paintMode(); paintLogin();
  document.getElementById('wsPill').onclick = () => openSettings('workspace');
  const login = document.getElementById('loginPill');
  if (login) login.onclick = () => { if (Gen.available) openSettings('model'); else Gen.askForKey(); };
  document.getElementById('lxPill').onclick = () => {
    if (VM.state === 'off' || VM.state === 'failed') VM.boot();
    openSettings('console');
  };
  const tick = () => document.getElementById('clock').textContent =
    new Date().toLocaleTimeString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  tick();
  const clock = setInterval(tick, 1000);
  const offSplash = bootSplash();
  const offTray = startTray();
  return () => { offVM(); offWs(); offGen(); offBridge(); clearInterval(clock); offSplash(); offTray(); };
}

const winxp = () => document.documentElement.dataset.theme === 'winxp';

/* ---------- the boot splash (winxp) --------------------------------------

   The first thing a visit does is wait on the machine. In the winxp theme
   that wait is XP's boot screen — the mark, a marquee of blue blocks — and
   it ends in a short "welcome back." that fades into the desktop. Shown
   once per page, only while the first boot is still under way, and never a
   trap: a click or Escape dismisses it, a failure or a fallback ends it at
   once, and it sits under the key modal, the pairing dialog and the
   recovery bar (z 8500 against 9000 and 99999), which must stay readable.
   The layout that keeps it a full screen is inline, so a forked os.css that
   predates the rules shows a plain black screen, not loose text. */
const SPLASH_MAX_MS = 180000, WELCOME_MS = 1400, FADE_MS = 500;

function bootSplash() {
  if (window.__vibeosSplashDecided) return () => {};
  window.__vibeosSplashDecided = true;
  if (!winxp() || !(VM.state === 'off' || VM.state === 'booting') || VM.fallback) return () => {};
  const el = document.createElement('div');
  el.id = 'bootSplash';
  el.className = 'boot-splash';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'vibeOS is starting; click or press Escape to use the desktop now');
  el.style.cssText = 'position:fixed;inset:0;z-index:8500;background:#000;color:#fff;cursor:default';
  el.innerHTML = `
    <div class="bs-boot">
      <div class="bs-mark"><img class="bs-logo" alt=""><span class="bs-word">vibe<b>OS</b></span></div>
      <div class="bs-bar" aria-hidden="true"><i></i><i></i><i></i></div>
      <p class="bs-status"></p>
    </div>
    <p class="bs-hint">Click or press Esc to use the desktop while it boots</p>
    <div class="bs-welcome">
      <div class="bs-band"></div>
      <div class="bs-mid"><p class="bs-hello">welcome back.</p><img class="bs-pic" alt=""></div>
      <div class="bs-band bs-low"></div>
    </div>`;
  el.querySelector('.bs-logo').src = el.querySelector('.bs-pic').src = BASE + 'icon.png';
  const status = el.querySelector('.bs-status');
  const label = () => { const img = IMAGES[VM.bootedImage || VM.image]; return img ? img.label : 'Linux'; };
  status.textContent = 'Starting ' + label() + '…';
  document.body.appendChild(el);

  let ended = false, welcomeTimer = null;
  const end = () => {
    if (ended) return;
    ended = true;
    offVM(); document.removeEventListener('keydown', onKey); themeWatch.disconnect();
    clearTimeout(cap); clearTimeout(welcomeTimer);
    el.remove();
    pumpBalloons();
  };
  const welcome = () => {
    if (el.classList.contains('welcome')) return;
    el.classList.add('welcome');
    el.style.background = '#5a7edc';
    welcomeTimer = setTimeout(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return end();
      el.style.transition = `opacity ${FADE_MS}ms ease`;
      el.style.opacity = '0';
      welcomeTimer = setTimeout(end, FADE_MS);
    }, WELCOME_MS);
  };
  const onVM = () => {
    try {
      if (VM.fallback || VM.state === 'failed' || VM.state === 'unavailable') return end();
      if (VM.state === 'ready') return welcome();
      status.textContent = 'Starting ' + label() + '…';
    } catch (e) { console.warn('boot splash:', e); end(); }
  };
  const offVM = VM.on(onVM);
  const onKey = e => { if (e.key === 'Escape') end(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('pointerdown', end);
  const themeWatch = new MutationObserver(() => { if (!winxp()) end(); });
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const cap = setTimeout(end, SPLASH_MAX_MS);
  return end;
}

/* ---------- tray balloons -------------------------------------------------

   A few words from the notification area for things that happened away
   from the window the person is looking at: an agent signed in or out
   through vibeos-mcp, the machine came up, an app was made. One at a time,
   a few seconds each, a queue of four (the oldest waiting one drops), the
   same words twice in a row said once, held while the boot splash is up.
   Every string is textContent — an agent's name is whatever its client
   says it is. winxp wears XP's yellow balloon; every other theme a plain
   toast in its own tokens. */
const BALLOON_MS = 6000, BALLOON_QUEUE = 4, SIGNOUT_GRACE_MS = 8000;
let tray = null;   // { queue, current: { title, text, el, close } }

export function balloon(title, text = '') {
  if (!tray) return false;
  const b = { title: String(title).slice(0, 90), text: String(text).slice(0, 220) };
  const same = x => x && x.title === b.title && x.text === b.text;
  if (same(tray.current) || tray.queue.some(same)) return false;
  if (tray.queue.length >= BALLOON_QUEUE) tray.queue.shift();
  tray.queue.push(b);
  pumpBalloons();
  return true;
}

function pumpBalloons() {
  if (!tray || tray.current || !tray.queue.length || document.getElementById('bootSplash')) return;
  const b = tray.current = tray.queue.shift();
  const el = b.el = document.createElement('div');
  el.id = 'balloon';
  el.className = 'balloon';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.cssText = 'position:fixed;right:14px;z-index:8000';
  const icon = document.createElement('span');
  icon.className = 'balloon-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'i';
  const body = document.createElement('div');
  body.className = 'balloon-body';
  const head = document.createElement('b');
  head.className = 'balloon-title';
  head.textContent = b.title;
  body.appendChild(head);
  if (b.text) {
    const line = document.createElement('div');
    line.className = 'balloon-text';
    line.textContent = b.text;
    body.appendChild(line);
  }
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'balloon-x';
  x.title = 'Close';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '×';
  el.append(icon, body, x);
  document.body.appendChild(el);
  // Above whatever sits at the bottom: the dock (a taskbar in winxp and
  // win95) and the analytics notice, when it is up.
  const tops = [document.getElementById('dock'), document.getElementById('analyticsBar')]
    .map(n => n && n.getBoundingClientRect()).filter(r => r && r.height > 0).map(r => r.top);
  el.style.bottom = (innerHeight - Math.min(innerHeight, ...tops) + 12) + 'px';
  let timer = setTimeout(() => b.close(), BALLOON_MS);
  el.onmouseenter = () => clearTimeout(timer);
  el.onmouseleave = () => { clearTimeout(timer); timer = setTimeout(() => b.close(), 2500); };
  b.close = () => {
    clearTimeout(timer);
    el.remove();
    if (tray && tray.current === b) { tray.current = null; pumpBalloons(); }
  };
  x.onclick = () => b.close();
}

// A client's own name for itself, said the way a person would.
const AGENT_NAMES = { 'claude-code': 'Claude Code', 'claude-ai': 'Claude', cursor: 'Cursor', 'cursor-vscode': 'Cursor', codex: 'Codex', 'codex-mcp-client': 'Codex' };
const agentLabel = () => {
  const n = String(RemoteBridge.agentName || '').slice(0, 60);
  return AGENT_NAMES[n.toLowerCase()] || n || 'An agent';
};

function startTray() {
  tray = { queue: [], current: null };
  const mine = tray;
  const guard = (what, fn) => (...a) => { try { fn(...a); } catch (e) { console.warn('tray balloon (' + what + '):', e); } };

  const offMachine = VM.on(guard('machine', (state, transition) => {
    if (state !== 'ready' || !transition) return;
    const img = IMAGES[VM.bootedImage];
    balloon((img ? img.label : 'The machine') + ' is ready',
      VM.fallback ? fallbackLine() + '.' : VM.restored ? 'Restored from its snapshot. The Terminal and apps that need the machine work now.'
        : 'The Terminal and apps that need the machine work now.');
  }));

  // Signed in once the name has had its beat to arrive (the relay's
  // {paired} lands before the package's want frame, as LINK_ANNOUNCE_MS
  // says); signed out only when the drop outlives a redial — a socket that
  // comes back inside the grace is not news. A revoke is said at once.
  // A reload_os the agent asked for resumes the same session: no sign-in.
  const nameBeat = typeof LINK_ANNOUNCE_MS === 'number' ? LINK_ANNOUNCE_MS : 1500;
  // The name is remembered while connected: a revoke forgets agentName
  // before it announces 'off'.
  let signedIn = RemoteBridge.state === 'connected', firstIn = true, pendingIn = null, pendingOut = null;
  let lastName = signedIn ? agentLabel() : 'An agent';
  const sayOut = (name, revoked) => {
    signedIn = false;
    balloon(name + ' has signed out', revoked ? 'The pairing was ended; it can no longer reach this desktop.'
      : 'It disconnected. It can come back with the same pairing.');
  };
  const offAgent = RemoteBridge.on(guard('agent', state => {
    if (state === 'connected') {
      if (RemoteBridge.agentName) lastName = agentLabel();
      if (pendingOut) { clearTimeout(pendingOut); pendingOut = null; return; }
      if (signedIn || pendingIn) return;
      pendingIn = setTimeout(guard('agent', () => {
        pendingIn = null;
        if (RemoteBridge.state !== 'connected') return;
        signedIn = true;
        const resumed = firstIn && RemoteBridge.pairedHow === 'reload';
        firstIn = false;
        if (!resumed) balloon(agentLabel() + ' has signed in', 'It can edit this desktop and run commands in its Linux machine. Settings › Capabilities ends it.');
      }), nameBeat);
      return;
    }
    if (pendingIn) { clearTimeout(pendingIn); pendingIn = null; return; }
    if (!signedIn || pendingOut) return;
    const name = RemoteBridge.agentName ? agentLabel() : lastName;
    if (!RemoteBridge.token) return sayOut(name, true);
    pendingOut = setTimeout(guard('agent', () => {
      pendingOut = null;
      if (RemoteBridge.state !== 'connected') sayOut(name, !RemoteBridge.token);
    }), SIGNOUT_GRACE_MS);
  }));

  // create_app: a balloon in every theme, the solitaire cascade in winxp.
  // A ui on a kernel forked before AppEvents existed simply has neither.
  const offApps = typeof AppEvents !== 'undefined' ? AppEvents.on(info => {
    guard('app', () => balloon(info.title + ' is ready', 'Made just now — it is in the dock.'))();
    guard('cascade', () => { const c = UI.stable().cascadeWindow; if (c) c(info.el); })();
  }) : (console.warn('kernel has no AppEvents (a fork of kernel/agent.js older than the tray): no app balloons'), () => {});

  return () => {
    offMachine(); offAgent(); offApps();
    clearTimeout(pendingIn); clearTimeout(pendingOut);
    if (mine.current) mine.current.el.remove();
    if (tray === mine) tray = null;
  };
}
