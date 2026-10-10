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
    : VM.state === 'ready' ? `${VM.bootedImage} ready`
    : VM.state === 'booting' && bootArmB() && VM.progress && VM.progress.percent !== null ? `starting… ${VM.progress.percent}%` : VM_LABEL[VM.state];
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
  return { suffix: ' (reconnecting)', agent: name, on: false, reconnecting: true, titleExtra: ' ' + name + ' is paired, but the relay socket is down or redialing. Tool calls may fail until it’s back.' };
}
export function loginLine() {
  const mcp = mcpPill();
  const agent = mcp.agent;
  const via = mcp.agent ? (mcp.reconnecting && !Gen.available ? mcp.suffix : mcp.reconnecting ? ' (reconnecting)' : ' + mcp') : '';
  if (Gen.viaServer) return { text: 'Server · ' + (Gen.model || 'local') + via, on: true, warn: mcp.reconnecting, title: 'A local vibeOS server holds the model.' + (agent ? (mcp.reconnecting ? mcp.titleExtra : ' ' + agent + ' also drives this desktop through vibeos-mcp.') : '') };
  if (Gen.provider === 'openai-codex') return { text: 'Codex · ' + Gen.model + via, on: true, warn: mcp.reconnecting, title: 'Signed in with ChatGPT. The model is ' + Gen.model + (Gen.codexModel ? ' (set in Settings › Model)' : ' (the default)') + '. Your tokens stay in this browser.' + (agent ? ' ' + agent + ' also drives this desktop through vibeos-mcp.' : '') };
  if (Gen.key && Gen.provider) return { text: 'API key · ' + Gen.provider + ' ' + Gen.model + via, on: true, warn: mcp.reconnecting, title: 'A pasted ' + Gen.provider + ' key, kept in this browser. The model is ' + Gen.model + '.' + (agent ? ' ' + agent + ' also drives this desktop through vibeos-mcp.' : '') };
  if (agent) return { text: 'Agent · ' + agent + (mcp.reconnecting ? mcp.suffix : ' (mcp)'), on: mcp.on, warn: mcp.reconnecting, title: mcp.reconnecting ? mcp.titleExtra.slice(1) : agent + ' drives this desktop through vibeos-mcp with its own model. No model is connected here.' };
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
    : 'No local binary, so only what a browser can do.';
}

// The dock lists vibeOS, then the apps it has built, then Settings — the same
// shape as a real dock, where system panels are one icon and not eight.
export async function paintDock(dock = document.getElementById('dock')) {
  const { SHELL, BUILTIN_ICONS, dockButtonContent } = UI.live();
  dock.innerHTML = '';
  const addIcon = (iconSrc, label, title, onclick, cls) => {
    const b = document.createElement('button');
    b.title = title;
    b.setAttribute('aria-label', title);
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
  const openPortal = ui.openPortalPrompt || (() => focusOrOpen(SHELL.portal));
  addIcon(BUILTIN_ICONS.portal, win95 ? 'Pt' : '', 'Portal — generated scene', () => openPortal(), 'dock-portal');
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
  const offProgress = VM.onProgress ? VM.onProgress(() => { if (bootArmB()) paintVM(); }) : () => {};
  const offSplash = bootSplash();
  const offBootCard = startBootCard();
  const offTray = startTray();
  const offAsk = startAsk();
  const offPortal = (UI.live().startPortalMenu || (() => () => {}))();
  return () => { offVM(); offWs(); offGen(); offBridge(); clearInterval(clock); offProgress(); offSplash(); offBootCard(); offTray(); offAsk(); offPortal(); };
}

const winxp = () => document.documentElement.dataset.theme === 'winxp';

/* ---------- the boot splash (winxp) --------------------------------------

   The first thing a visit does is wait on the machine. In the winxp theme
   the page opens on XP's boot screen — the mark, a marquee of blue blocks —
   for SPLASH_MS only, then a short "welcome back." fades into the desktop
   while the machine keeps booting behind the menubar pill (aleks: "it looks
   like its broken. maybe only show it for 2-3 seconds"): a splash held for
   the whole 20-90 s boot read as a hung page. Shown once per page, never a
   trap: a Skip button, a click or Escape dismisses it, a failure or a
   fallback ends it at once, and it sits under the key modal, the pairing dialog and the
   recovery bar (z 8500 against 9000 and 99999), which must stay readable.
   The layout that keeps it a full screen is inline, so a forked os.css that
   predates the rules shows a plain black screen, not loose text. */
const SPLASH_MS = 2000, WELCOME_MS = 700, FADE_MS = 400;

function bootSplash() {
  if (window.__vibeosSplashDecided) return () => {};
  window.__vibeosSplashDecided = true;
  if (!winxp() || !(VM.state === 'off' || VM.state === 'booting') || VM.fallback) return () => {};
  const el = document.createElement('div');
  el.id = 'bootSplash';
  el.className = 'boot-splash';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'vibeOS is starting; Skip, click or press Escape to use the desktop now');
  el.style.cssText = 'position:fixed;inset:0;z-index:8500;background:#000;color:#fff;cursor:default';
  el.innerHTML = `
    <div class="bs-boot">
      <div class="bs-mark"><img class="bs-logo" alt=""><span class="bs-word">vibe<b>OS</b></span></div>
      <div class="bs-bar" aria-hidden="true"><i></i><i></i><i></i></div>
      <p class="bs-status"></p>
    </div>
    <p class="bs-hint">Linux is still starting in the background. <button type="button" class="bs-skip">Skip</button></p>
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
  const cap = setTimeout(welcome, SPLASH_MS);
  return end;
}

/* ---------- the boot card (beads-tavc.14, arm b) ---------------------------

   People left a cold boot at a median 15.5 s, watching a pill that said
   "vm starting…" and nothing else, while the chat already worked. Arm b
   shows how far the boot is — VM.progress, the guest's own instructions
   against what the image's boot runs, never a timer — and one line that the
   agent can be asked now, with a button that opens the chat. Not a modal and
   nothing opens by itself: the auto key modal is what cut boots in tavc.13.
   Shown on the page's first cold boot (a restore has no progress and takes
   seconds), gone at 'ready', 'failed' or the ×. Top right: the chat opens
   on the left. Arm a is the desktop as it
   was; the arm is BootArm's (kernel/machine.js), and an older kernel fork
   without it shows nothing. */
const bootArmB = () => typeof BootArm !== 'undefined' && BootArm.arm === 'b';

function startBootCard() {
  if (window.__vibeosBootCardDecided) return () => {};
  window.__vibeosBootCardDecided = true;
  if (!bootArmB() || !VM.onProgress) return () => {};
  let el = null, line = null, bar = null, ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    offProgress(); offVM();
    if (el) el.remove();
  };
  const paint = p => {
    if (!el) show();
    const typical = IMAGES[p.image].typicalSeconds;
    line.textContent = 'Starting Linux…' + (p.percent === null ? '' : ` ${p.percent}%`) + (typical ? `, usually about ${typical} s` : '');
    bar.parentNode.hidden = p.percent === null;
    bar.style.width = (p.percent || 0) + '%';
  };
  const show = () => {
    el = document.createElement('div');
    el.id = 'bootCard';
    el.className = 'boot-card';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;right:14px;z-index:7900';
    const top = document.getElementById('menubar');
    el.style.top = ((top ? top.getBoundingClientRect().bottom : 0) + 10) + 'px';
    const head = document.createElement('div');
    head.className = 'ask-head';
    line = document.createElement('p');
    line.className = 'ask-line boot-line';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'ask-x';
    x.title = 'Close';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '×';
    x.onclick = end;
    head.append(line, x);
    const rail = document.createElement('div');
    rail.className = 'boot-bar';
    bar = document.createElement('i');
    rail.appendChild(bar);
    const now = document.createElement('div');
    now.className = 'boot-now';
    const say = document.createElement('p');
    say.className = 'ask-note';
    say.textContent = 'You can start now: ask the agent for an app while Linux boots.';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn p boot-go';
    go.textContent = 'Open the chat';
    go.onclick = () => {
      track('boot_start_now_click');
      // From here it is a progress line over a desktop in use: clicks go
      // through it, so it never takes a window's title bar on a narrow screen.
      now.remove(); x.remove();
      el.style.pointerEvents = 'none';
      const ui = UI.live();
      ui.focusOrOpen(ui.SHELL.chat);
    };
    now.append(say, go);
    el.append(head, rail, now);
    document.body.appendChild(el);
    track('boot_progress_shown');
  };
  const offProgress = VM.onProgress(p => {
    try { if (p) paint(p); } catch (e) { console.warn('boot card:', e); end(); }
  });
  // A fallback to busybox is a second cold boot under the same card; only
  // the machine's own end ends it.
  const offVM = VM.on(state => { if (state === 'ready' || state === 'failed' || state === 'unavailable') end(); });
  if (VM.progress) paint(VM.progress);
  else if (VM.state === 'ready' || VM.state === 'failed' || VM.state === 'unavailable') end();
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
    balloon(name + ' has signed out', revoked ? 'The pairing was ended, so it can’t reach this desktop anymore.'
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
        if (!resumed) balloon(agentLabel() + ' has signed in', 'It can edit this desktop and run commands in its Linux machine. Settings › Capabilities ends the pairing.');
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
    guard('app', () => balloon(info.title + ' is ready', 'Made just now. It’s in the dock.'))();
    guard('cascade', () => { const c = UI.stable().cascadeWindow; if (c) c(info.el); })();
  }) : (console.warn('kernel has no AppEvents (a fork of kernel/agent.js older than the tray): no app balloons'), () => {});

  return () => {
    offMachine(); offAgent(); offApps();
    clearTimeout(pendingIn); clearTimeout(pendingOut);
    if (mine.current) mine.current.el.remove();
    if (tray === mine) tray = null;
  };
}

/* ---------- the research ask ----------------------------------------------

   User research, not a feature (2026-10-03, approved by vibeos-yc: we had
   never talked to a user). A small card, bottom-left above the dock, asking
   for an email so we can ask a couple of questions; it promises no call.
   At most once per browser,
   ever: `vibeos-research-ask` is written before the card is painted, and a
   browser whose storage throws never sees it. Two groups:

   - returner: this is not the browser's first visit. `vibeos-first-seen`
     (epoch ms) is written on the first page that runs this, and a page at
     least ASK_TIMING.returnGapMs (1 h) later is a return — a reload is not.
     A browser that predates the stamp counts as returning when its machine
     comes back restored from a snapshot (VM.restored, the existing signal):
     that snapshot was written on an earlier visit. Asked once the desktop
     has been up deskMs.
   - silent: this page's machine reached 'ready' and the chat has had no
     prompt (Chat.asked, the flag behind first_prompt) for silentMs (60 s)
     since — not while an agent drives the desktop through vibeos-mcp.
   - agent (2026-10-09, beads-tavc.2.3): an agent has DONE something on this
     device — a pasted key's or a ChatGPT login's built-in agent, or a remote
     one through vibeos-mcp, made a doing call (Agent.DOING_TOOLS, the same
     line as agent_did) that did not fail (kernel AgentActivity, stamped in
     localStorage). Asked agentMs (2 min)
     after that first call, never mid-turn: not while Chat.running, and not
     until no agent call has landed for quietMs. The card asks one line,
     "What did you have your agent do here?", with an optional email, and
     says we read the answers; the answer is redacted here (redactPrompt, the
     first_prompt redactor) and again by the route, and kept in the vault
     only. Tracked: ask_answered {group, has_email} — never the text.
   Agent wins over returner, returner over silent. Never over the key modal or the pairing dialog
   (.key-modal-overlay), the recovery or fork bar, or the winxp boot splash:
   it waits until they are gone. Never on ?safe=1 / ?stock=1 / a recovery
   boot, and never where HexEvents.hosted() is false — the static mirror
   (its insights tag 404s) and the docker image (the tag is stripped) have
   no /api, so nothing is probed there.
   The email goes to /api/waitlist (source 'in-app-ask' + the group), which
   keeps it in the Hexclave data vault and copies it to getwaitlist. Tracked:
   ask_shown / ask_dismissed / ask_email with {group} — never the email.
   Every string is textContent. window.__vibeosAskTiming overrides
   ASK_TIMING field by field (scripts/e2e/research-ask.mjs shortens them).
   One decision per page (__vibeosAskDecided, like the splash): a reload_ui
   retires a card on screen and the new ui does not ask again. */
// A calendar link for the thank-you state; empty, so no link (2026-10-03:
// the operator chose not to share a calendar).
export const RESEARCH_BOOKING_URL = '';
const ASK_KEY = 'vibeos-research-ask', FIRST_SEEN_KEY = 'vibeos-first-seen';
const ASK_TIMING = { deskMs: 5000, silentMs: 60000, returnGapMs: 3600000, pollMs: 1000, agentMs: 120000, quietMs: 15000 };
const ASK_BLOCKERS = '.key-modal-overlay, #recoveryBar, #forkBar, #bootSplash, #bootCard';
const ASK_COPY = {
  returner: "What brought you back to vibeOS? Leave your email and we'll ask you a couple of questions.",
  agent: 'What did you have your agent do here? (one line)',
  silent: "Not sure what to do here? Tell us what you were hoping for: leave your email and we'll ask you a couple of questions.",
};
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function askStorage() {
  try {
    localStorage.setItem('vibeos-ask-probe', '1');
    localStorage.removeItem('vibeos-ask-probe');
    return localStorage;
  } catch { return null; }
}

function startAsk() {
  if (window.__vibeosAskDecided) return () => {};
  window.__vibeosAskDecided = true;
  const boot = window.__vibeosBoot || {};
  if (boot.safe || boot.stock || boot.recovering) return () => {};
  if (typeof HexEvents === 'undefined' || typeof Chat === 'undefined') {
    console.warn('research ask: the kernel has no HexEvents/Chat (an older fork), so it is not shown');
    return () => {};
  }
  const store = askStorage();
  if (!store) return () => {};
  const now = Date.now();
  const raw = store.getItem(FIRST_SEEN_KEY);
  let seen = raw === null ? null : Number(raw);
  if (seen !== null && !Number.isFinite(seen)) {
    console.warn('research ask: ' + FIRST_SEEN_KEY + ' is not a timestamp (' + raw.slice(0, 40) + '); restamped as a first visit');
    seen = null;
  }
  if (seen === null) {
    try { store.setItem(FIRST_SEEN_KEY, String(now)); } catch { return () => {}; }
  }
  if (store.getItem(ASK_KEY) !== null) return () => {};

  const t = { ...ASK_TIMING, ...(window.__vibeosAskTiming || {}) };
  const legacy = raw === null;
  const returning = () => (seen !== null && now - seen >= t.returnGapMs) || (legacy && VM.state === 'ready' && !!VM.restored);
  let deskUp = false, silentDue = false, silentTimer = null, card = null, ended = false;

  // An older kernel fork has no AgentActivity: no agent cohort there.
  const agentKnown = typeof AgentActivity !== 'undefined';
  const agentDue = () => {
    if (!agentKnown) return false;
    const did = AgentActivity.first();
    const at = Date.now();
    return !!did && at - did.at >= t.agentMs && !Chat.running && at - AgentActivity.lastAt >= t.quietMs;
  };
  const pick = () => {
    if (deskUp && agentDue()) return 'agent';
    if (deskUp && returning()) return 'returner';
    if (silentDue && !Chat.asked && RemoteBridge.state !== 'connected') return 'silent';
    return null;
  };
  // Nothing left that could still come true: the returner check has had its
  // chance (a legacy browser's machine may yet come back restored), and the
  // silent one has fired empty or the person has typed. An agent can start
  // working at any moment, so with AgentActivity the page never settles.
  const settled = () => !agentKnown && deskUp && !returning() && !(legacy && VM.state !== 'ready')
    && (Chat.asked || silentDue);
  const consider = () => {
    if (ended || card) return;
    if (document.readyState !== 'complete') return;
    if (!HexEvents.hosted()) return end();
    if (document.querySelector(ASK_BLOCKERS)) return;
    const group = pick();
    if (group) return show(group);
    if (settled()) end();
  };
  const armSilent = () => {
    if (silentTimer || VM.state !== 'ready') return;
    silentTimer = setTimeout(() => { silentDue = true; consider(); }, t.silentMs);
  };
  const offVM = VM.on(() => { armSilent(); consider(); });
  armSilent();
  const deskTimer = setTimeout(() => { deskUp = true; consider(); }, t.deskMs);
  const poll = setInterval(consider, t.pollMs);

  function end() {
    if (ended) return;
    ended = true;
    offVM(); clearTimeout(deskTimer); clearTimeout(silentTimer); clearInterval(poll);
  }

  function show(group) {
    try { store.setItem(ASK_KEY, group + ' ' + new Date().toISOString()); } catch { return end(); }
    end();
    card = paintAsk(group);
    track('ask_shown', { group });
  }

  return () => { end(); if (card) card.remove(); };
}

function paintAsk(group) {
  const el = document.createElement('div');
  el.id = 'researchAsk';
  el.className = 'ask-card';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'A question from the maker of vibeOS');
  el.dataset.group = group;
  el.style.cssText = 'position:fixed;left:14px;z-index:8000';
  const head = document.createElement('div');
  head.className = 'ask-head';
  const line = document.createElement('p');
  line.className = 'ask-line';
  line.textContent = ASK_COPY[group];
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'ask-x';
  x.title = 'Close';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '×';
  head.append(line, x);
  if (group === 'agent') return paintAgentAsk(el, head, x);
  const form = document.createElement('form');
  form.className = 'ask-form';
  form.noValidate = true;
  const input = document.createElement('input');
  input.type = 'email';
  input.className = 'ask-email';
  input.placeholder = 'you@example.com';
  input.autocomplete = 'email';
  input.maxLength = 320;
  input.setAttribute('aria-label', 'Your email');
  const send = document.createElement('button');
  send.type = 'submit';
  send.className = 'btn p ask-send';
  send.textContent = 'Send';
  form.append(input, send);
  // The other way to answer: the /talk interviewer, in a new tab, now.
  const talk = document.createElement('a');
  talk.className = 'ask-talk';
  talk.href = new URL('/talk?from=in-app&group=' + encodeURIComponent(group), location.origin).href;
  talk.target = '_blank';
  talk.rel = 'noopener';
  talk.textContent = 'or answer 5 quick questions now';
  talk.onclick = () => track('ask_talk_click', { group });
  const note = document.createElement('p');
  note.className = 'ask-note';
  note.hidden = true;
  el.append(head, form, talk, note);
  document.body.appendChild(el);
  placeAsk(el);

  let sent = false;
  const say = (text, err) => { note.hidden = false; note.className = 'ask-note' + (err ? ' err' : ''); note.textContent = text; };
  x.onclick = () => {
    if (!sent) track('ask_dismissed', { group });
    el.remove();
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const email = input.value.trim();
    if (!EMAIL_SHAPE.test(email) || email.length > 320) return say("That doesn't look like an email address.", true);
    input.disabled = send.disabled = true;
    say('Sending…');
    let res = null, body = {};
    try {
      res = await fetch('/api/waitlist', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, source: 'in-app-ask', group, path: location.pathname }),
      });
      body = await res.json().catch(() => ({}));
    } catch (err) { console.warn('research ask: send failed', err); }
    if (!res || !res.ok) {
      input.disabled = send.disabled = false;
      return say(typeof body.error === 'string' ? body.error : "Couldn't send that. Try again in a moment.", true);
    }
    sent = true;
    track('ask_email', { group });
    form.remove();
    say('Thanks. We will write to ' + email + ' soon.');
    if (RESEARCH_BOOKING_URL) {
      const book = document.createElement('a');
      book.className = 'ask-book';
      book.href = RESEARCH_BOOKING_URL;
      book.target = '_blank';
      book.rel = 'noopener';
      book.textContent = 'Book 15 minutes';
      el.appendChild(book);
    }
  };
  return el;
}

// Place the card above whatever sits at the bottom, as the balloons are.
function placeAsk(el) {
  const tops = [document.getElementById('dock'), document.getElementById('analyticsBar')]
    .map(n => n && n.getBoundingClientRect()).filter(r => r && r.height > 0).map(r => r.top);
  el.style.bottom = (innerHeight - Math.min(innerHeight, ...tops) + 16) + 'px';
}

const AGENT_ANSWER_MAX = 200;
// The first_prompt redactor (kernel/machine.js) when the kernel has it; the
// route redacts again whatever arrives.
const redactAnswer = text => typeof redactPrompt === 'function' ? redactPrompt(text) : String(text).replace(/\s+/g, ' ').trim().slice(0, AGENT_ANSWER_MAX);

function paintAgentAsk(el, head, x) {
  const group = 'agent';
  const form = document.createElement('form');
  form.className = 'ask-form ask-agent';
  form.noValidate = true;
  const answer = document.createElement('input');
  answer.type = 'text';
  answer.className = 'ask-answer';
  answer.placeholder = 'e.g. had it build a calorie tracker';
  answer.maxLength = AGENT_ANSWER_MAX;
  answer.setAttribute('aria-label', 'What you had your agent do');
  const email = document.createElement('input');
  email.type = 'email';
  email.className = 'ask-email';
  email.placeholder = 'email, if we can ask a follow-up (optional)';
  email.autocomplete = 'email';
  email.maxLength = 320;
  email.setAttribute('aria-label', 'Your email (optional)');
  const send = document.createElement('button');
  send.type = 'submit';
  send.className = 'btn p ask-send';
  send.textContent = 'Send';
  form.append(answer, email, send);
  const notice = document.createElement('p');
  notice.className = 'ask-notice';
  notice.textContent = 'We read these to decide what to build.';
  const note = document.createElement('p');
  note.className = 'ask-note';
  note.hidden = true;
  el.append(head, form, notice, note);
  document.body.appendChild(el);
  placeAsk(el);

  let sent = false;
  const say = (text, err) => { note.hidden = false; note.className = 'ask-note' + (err ? ' err' : ''); note.textContent = text; };
  x.onclick = () => {
    if (!sent) track('ask_dismissed', { group });
    el.remove();
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const text = redactAnswer(answer.value);
    if (!text) return say('Tell us in a few words, or close this.', true);
    const mail = email.value.trim();
    if (mail && (!EMAIL_SHAPE.test(mail) || mail.length > 320)) return say("That doesn't look like an email address. Leave it empty if you like.", true);
    answer.disabled = email.disabled = send.disabled = true;
    say('Sending…');
    let res = null, body = {};
    try {
      res = await fetch('/api/waitlist', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ source: 'in-app-ask', group, answer: text, path: location.pathname }, mail ? { email: mail } : {})),
      });
      body = await res.json().catch(() => ({}));
    } catch (err) { console.warn('research ask: send failed', err); }
    if (!res || !res.ok) {
      answer.disabled = email.disabled = send.disabled = false;
      return say(typeof body.error === 'string' ? body.error : "Couldn't send that. Try again in a moment.", true);
    }
    sent = true;
    track('ask_answered', { group, has_email: !!mail });
    form.remove();
    notice.remove();
    say(mail ? 'Thanks. We may write to ' + mail + ' with a follow-up.' : 'Thanks, that helps.');
  };
  return el;
}
