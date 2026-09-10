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
export function loginLine() {
  const agent = RemoteBridge.state === 'connected' ? (RemoteBridge.agentName || RemoteBridge.detail || 'an agent') : '';
  const via = agent ? ' + mcp' : '';
  if (Gen.viaServer) return { text: 'Server · ' + (Gen.model || 'local') + via, on: true, title: 'A local vibeOS server holds the model.' + (agent ? ' ' + agent + ' also drives this desktop through vibeos-mcp.' : '') };
  if (Gen.provider === 'openai-codex') return { text: 'Codex · ' + Gen.model + via, on: true, title: 'Signed in with ChatGPT; the model is ' + Gen.model + (Gen.codexModel ? ' (set in Settings › Model)' : ' (the default)') + '. Tokens stay in this browser.' + (agent ? ' ' + agent + ' also drives this desktop through vibeos-mcp.' : '') };
  if (Gen.key && Gen.provider) return { text: 'API key · ' + Gen.provider + ' ' + Gen.model + via, on: true, title: 'A pasted ' + Gen.provider + ' key, kept in this browser; the model is ' + Gen.model + '.' + (agent ? ' ' + agent + ' also drives this desktop through vibeos-mcp.' : '') };
  if (agent) return { text: 'Agent · ' + agent + ' (mcp)', on: true, title: agent + ' drives this desktop through vibeos-mcp with its own model; no model is connected here.' };
  return { text: 'no model', on: false, title: 'No model connected. Click to connect one.' };
}

export function paintLogin() {
  const txt = document.getElementById('loginText'), dot = document.getElementById('loginDot'), pill = document.getElementById('loginPill');
  if (!txt) return;
  const { text, on, title } = loginLine();
  txt.textContent = text;
  dot.className = 'dot' + (on ? '' : ' off');
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
  const { SHELL, ICONS } = UI.live();
  dock.innerHTML = '';
  const add = (html, title, onclick, cls) => {
    const b = document.createElement('button');
    b.innerHTML = html; b.title = title; b.onclick = onclick;
    if (cls) b.className = cls;
    dock.appendChild(b);
    return b;
  };

  // Every entry raises the window that is open for it, restored if it was
  // minimised, and opens one only when none is — the shell's three and
  // every generated app alike (focusOrLaunch, by apps/<file>).
  // focusOrLaunch is new here; a desktop whose agent forked ui/windows.js
  // before it has no such export, and a dock click on a generated app then
  // did nothing but a console error. Fall back to the fork's own launchApp,
  // loudly: focusing is the feature, launching is the old behaviour.
  const ui = UI.live();
  const focusOrOpen = ui.focusOrOpen;
  const focusOrLaunch = ui.focusOrLaunch || (app => {
    console.warn('your system/ui/windows.js has no focusOrLaunch — launching a second window; Settings › Design › Take the update');
    return ui.launchApp(app);
  });
  add(ICONS.vibeos, 'vibeOS — ask for an app', () => focusOrOpen(SHELL.chat));
  add('🌐', 'Browser', () => focusOrOpen(SHELL.browser));

  const live = dock.isConnected;
  let apps = [];
  try { apps = (await Apps.list()).apps; } catch {}
  if (live && !dock.isConnected) return;
  if (apps.length) {
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;background:rgba(0,0,0,.18);margin:4px 2px';
    dock.appendChild(sep);
  }
  apps.slice(0, 8).forEach(a => {
    const missing = missingCaps(a.requires);
    // The title is a header line in a file the guest can write: text, not html.
    const b = add('', a.title + (missing.length ? ' (needs ' + missing.join(', ') + ')' : ''), () => focusOrLaunch(a));
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
  return () => { offVM(); offWs(); offGen(); offBridge(); clearInterval(clock); };
}
