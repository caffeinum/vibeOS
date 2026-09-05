/* ui/settings.js — every Settings tab. A ui module (see ui/windows.js). */

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

export function ConsoleApp(body, win) {
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
  Windows.onDispose(win, () => {
    off();
    if (VM.screen && VM.screen.parentNode === body) body.removeChild(VM.screen);
  });
}

/* ---------- the Terminal: a small vt100 over VM.tty -------------------- */

// Enough of a terminal for busybox top and vi and GNU nano to be legible:
// a cell grid with a cursor, a scroll region, the CSI moves/erases/inserts
// those three use, SGR colour and inverse, the alternate screen, and the
// two queries they send (cursor position `\e[6n` — vi and ash ask it to
// size the screen and wait for the answer, eating the next keys as the
// reply; device attributes `\e[c`). Written rather than vendored: xterm.js is
// ~300 KB the open-source mirror would have to carry, and busybox's programs
// use this subset. Every byte from the guest lands as textContent.
const VT_ESC = 0x1b;
function createVt(el, respond) {
  const vt = { cols: 80, rows: 24, x: 0, y: 0, attr: 0, wrapNext: false, top: 0, bottom: 23,
               cursorVisible: true, autowrap: true, grid: null, alt: null, saved: null, scrollback: [], dirty: false };
  const blank = () => [' ', 0];
  const row = () => Array.from({ length: vt.cols }, blank);
  vt.grid = Array.from({ length: vt.rows }, row);
  let state = 'normal', params = '', collect = '', osc = '';
  const dec = new TextDecoder();
  // a sequence that never ends is dropped past 4 KB, not held in memory
  const grow = (acc, ch) => acc.length < 4096 ? acc + ch : acc;

  const clampCursor = () => { vt.x = Math.max(0, Math.min(vt.x, vt.cols - 1)); vt.y = Math.max(0, Math.min(vt.y, vt.rows - 1)); };
  // n comes off the wire: `\e[1000000@` hung the tab (and the machine on
  // the same thread) for 30 s+ before the loops were clamped to the region.
  const scrollUp = (n, top = vt.top, bottom = vt.bottom) => {
    n = Math.min(n, bottom - top + 1);
    for (let i = 0; i < n; i++) {
      const gone = vt.grid.splice(top, 1)[0];
      if (top === 0 && bottom === vt.rows - 1 && !vt.alt) { vt.scrollback.push(gone); if (vt.scrollback.length > 1000) vt.scrollback.shift(); }
      vt.grid.splice(bottom, 0, row());
    }
  };
  const scrollDown = (n, top = vt.top, bottom = vt.bottom) => {
    n = Math.min(n, bottom - top + 1);
    for (let i = 0; i < n; i++) { vt.grid.splice(bottom, 1); vt.grid.splice(top, 0, row()); }
  };
  const linefeed = () => {
    if (vt.y === vt.bottom) scrollUp(1);
    else if (vt.y < vt.rows - 1) vt.y++;
  };
  const put = ch => {
    if (vt.wrapNext) {
      if (vt.autowrap) { vt.x = 0; linefeed(); }
      vt.wrapNext = false;
    }
    vt.grid[vt.y][vt.x] = [ch, vt.attr];
    if (vt.x === vt.cols - 1) vt.wrapNext = true; else vt.x++;
  };
  const erase = (r, from, to) => { for (let i = from; i < to; i++) vt.grid[r][i] = [' ', vt.attr & 0x3ff]; };
  const sgr = list => {
    if (!list.length) list = [0];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n === 0) vt.attr = 0;
      else if (n === 1) vt.attr |= 0x400;
      else if (n === 4) vt.attr |= 0x800;
      else if (n === 7) vt.attr |= 0x1000;
      else if (n === 22) vt.attr &= ~0x400;
      else if (n === 24) vt.attr &= ~0x800;
      else if (n === 27) vt.attr &= ~0x1000;
      else if (n >= 30 && n <= 37) vt.attr = (vt.attr & ~0x1f) | (n - 30 + 1);
      else if (n === 39) vt.attr &= ~0x1f;
      else if (n >= 40 && n <= 47) vt.attr = (vt.attr & ~0x3e0) | ((n - 40 + 1) << 5);
      else if (n === 49) vt.attr &= ~0x3e0;
      else if (n >= 90 && n <= 97) vt.attr = (vt.attr & ~0x1f) | (n - 90 + 9);
      else if (n >= 100 && n <= 107) vt.attr = (vt.attr & ~0x3e0) | ((n - 100 + 9) << 5);
      else if ((n === 38 || n === 48) && list[i + 1] === 5) {
        const c = list[i + 2] < 16 ? list[i + 2] + 1 : 0;
        vt.attr = n === 38 ? (vt.attr & ~0x1f) | c : (vt.attr & ~0x3e0) | (c << 5);
        i += 2;
      } else if ((n === 38 || n === 48) && list[i + 1] === 2) i += 4;
    }
  };
  const csi = final => {
    const priv = collect.includes('?');
    const p = params.split(';').map(v => v === '' ? 0 : parseInt(v, 10));
    const n = Math.max(1, p[0] || 0);
    switch (final) {
      case 'A': vt.y = Math.max(vt.top <= vt.y ? vt.top : 0, vt.y - n); break;
      case 'B': vt.y = Math.min(vt.y <= vt.bottom ? vt.bottom : vt.rows - 1, vt.y + n); break;
      case 'C': vt.x = Math.min(vt.cols - 1, vt.x + n); break;
      case 'D': vt.x = Math.max(0, vt.x - n); break;
      case 'E': vt.x = 0; vt.y = Math.min(vt.rows - 1, vt.y + n); break;
      case 'F': vt.x = 0; vt.y = Math.max(0, vt.y - n); break;
      case 'G': case '`': vt.x = n - 1; break;
      case 'd': vt.y = n - 1; break;
      case 'H': case 'f': vt.y = n - 1; vt.x = Math.max(1, p[1] || 0) - 1; break;
      case 'J': {
        const m = p[0] || 0;
        if (m === 0) { erase(vt.y, vt.x, vt.cols); for (let r = vt.y + 1; r < vt.rows; r++) erase(r, 0, vt.cols); }
        else if (m === 1) { erase(vt.y, 0, vt.x + 1); for (let r = 0; r < vt.y; r++) erase(r, 0, vt.cols); }
        else for (let r = 0; r < vt.rows; r++) erase(r, 0, vt.cols);
        break;
      }
      case 'K': {
        const m = p[0] || 0;
        if (m === 0) erase(vt.y, vt.x, vt.cols); else if (m === 1) erase(vt.y, 0, vt.x + 1); else erase(vt.y, 0, vt.cols);
        break;
      }
      case 'L': if (vt.y >= vt.top && vt.y <= vt.bottom) scrollDown(n, vt.y, vt.bottom); break;
      case 'M': if (vt.y >= vt.top && vt.y <= vt.bottom) scrollUp(n, vt.y, vt.bottom); break;
      case 'P': { const r = vt.grid[vt.y]; r.splice(vt.x, Math.min(n, vt.cols - vt.x)); while (r.length < vt.cols) r.push(blank()); break; }
      case '@': { const r = vt.grid[vt.y]; r.splice(vt.x, 0, ...Array.from({ length: Math.min(n, vt.cols - vt.x) }, blank)); r.length = vt.cols; break; }
      case 'X': erase(vt.y, vt.x, Math.min(vt.cols, vt.x + n)); break;
      case 'S': scrollUp(n); break;
      case 'T': scrollDown(n); break;
      case 'r': vt.top = Math.max(0, (p[0] || 1) - 1); vt.bottom = Math.min(vt.rows - 1, (p[1] || vt.rows) - 1); vt.x = 0; vt.y = 0; break;
      case 'm': sgr(params === '' ? [] : p); break;
      case 'h': case 'l': {
        const on = final === 'h';
        if (!priv) break;
        for (const m of p) {
          if (m === 25) vt.cursorVisible = on;
          else if (m === 7) vt.autowrap = on;
          else if (m === 1049 || m === 47 || m === 1047) {
            if (on && !vt.alt) { vt.alt = { grid: vt.grid, x: vt.x, y: vt.y }; vt.grid = Array.from({ length: vt.rows }, row); vt.x = 0; vt.y = 0; }
            else if (!on && vt.alt) { vt.grid = vt.alt.grid; vt.x = vt.alt.x; vt.y = vt.alt.y; vt.alt = null; }
          }
        }
        break;
      }
      case 's': vt.saved = { x: vt.x, y: vt.y, attr: vt.attr }; break;
      case 'u': if (vt.saved) { vt.x = vt.saved.x; vt.y = vt.saved.y; vt.attr = vt.saved.attr; } break;
      case 'n': if (p[0] === 6) respond(`\x1b[${vt.y + 1};${vt.x + 1}R`); else if (p[0] === 5) respond('\x1b[0n'); break;
      case 'c': respond('\x1b[?1;2c'); break;
    }
    clampCursor();
    vt.wrapNext = false;
  };
  const esc = ch => {
    switch (ch) {
      case '[': state = 'csi'; params = ''; collect = ''; return;
      case ']': state = 'osc'; osc = ''; return;
      case '(': case ')': case '#': case '%': state = 'skip1'; return;
      case '7': vt.saved = { x: vt.x, y: vt.y, attr: vt.attr }; break;
      case '8': if (vt.saved) { vt.x = vt.saved.x; vt.y = vt.saved.y; vt.attr = vt.saved.attr; } break;
      case 'D': linefeed(); break;
      case 'E': vt.x = 0; linefeed(); break;
      case 'M': if (vt.y === vt.top) scrollDown(1); else if (vt.y > 0) vt.y--; break;
      case 'c': vt.grid = Array.from({ length: vt.rows }, row); vt.x = vt.y = 0; vt.attr = 0; vt.top = 0; vt.bottom = vt.rows - 1; vt.alt = null; break;
    }
    state = 'normal';
  };
  const control = code => {
    switch (code) {
      case 0x0d: vt.x = 0; vt.wrapNext = false; return true;
      case 0x0a: case 0x0b: case 0x0c: linefeed(); vt.wrapNext = false; return true;
      case 0x08: if (vt.x > 0) vt.x--; vt.wrapNext = false; return true;
      case 0x09: vt.x = Math.min(vt.cols - 1, (Math.floor(vt.x / 8) + 1) * 8); vt.wrapNext = false; return true;
      case 0x07: case 0x00: case 0x0e: case 0x0f: return true;
    }
    return false;
  };
  vt.feed = bytes => {
    const text = dec.decode(bytes, { stream: true });
    for (const ch of text) {
      const code = ch.codePointAt(0);
      if (state === 'normal') {
        if (code === VT_ESC) state = 'esc';
        else if (code < 0x20) control(code);
        else if (code !== 0x7f) put(ch);
      } else if (state === 'esc') esc(ch);
      else if (state === 'csi') {
        if (code >= 0x40 && code <= 0x7e) { csi(ch); state = 'normal'; }
        else if (code >= 0x30 && code <= 0x3f) { if (ch === '?' || ch === '>' || ch === '<' || ch === '=') collect = grow(collect, ch); else params = grow(params, ch); }
        else if (code >= 0x20 && code <= 0x2f) collect = grow(collect, ch);
        else if (code === VT_ESC) state = 'esc';
        else if (code < 0x20) control(code);
      } else if (state === 'osc') {
        if (code === 0x07) state = 'normal';
        else if (code === VT_ESC) state = 'osc-esc';
        else osc = grow(osc, ch);
      } else if (state === 'osc-esc') state = 'normal';
      else if (state === 'skip1') state = 'normal';
    }
    vt.dirty = true;
    paint();
  };
  vt.resize = (cols, rows) => {
    if (cols === vt.cols && rows === vt.rows) return;
    const fit = g => { g.length = Math.min(g.length, rows); while (g.length < rows) g.push(row()); for (const r of g) { r.length = Math.min(r.length, cols); while (r.length < cols) r.push(blank()); } return g; };
    vt.cols = cols; vt.rows = rows;
    fit(vt.grid); if (vt.alt) fit(vt.alt.grid);
    vt.top = 0; vt.bottom = rows - 1;
    clampCursor(); vt.wrapNext = false;
    vt.dirty = true; paint();
  };
  let frame = 0;
  const paintRow = (cells, cursorX) => {
    const div = document.createElement('div');
    let span = null, last = -1;
    cells.forEach(([ch, attr], i) => {
      const a = i === cursorX ? attr | 0x2000 : attr;
      if (a !== last || span === null) {
        span = document.createElement('span');
        if (a) span.className = attrClass(a);
        div.appendChild(span); last = a;
      }
      span.textContent += ch;
    });
    return div;
  };
  const attrClass = a => {
    const c = [];
    if (a & 0x1f) c.push('f' + ((a & 0x1f) - 1));
    if (a & 0x3e0) c.push('b' + (((a >> 5) & 0x1f) - 1));
    if (a & 0x400) c.push('bo'); if (a & 0x800) c.push('ul'); if (a & 0x1000) c.push('inv'); if (a & 0x2000) c.push('cur');
    return c.join(' ');
  };
  function paint() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!vt.dirty) return;
      vt.dirty = false;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
      el.textContent = '';
      const frag = document.createDocumentFragment();
      if (!vt.alt) for (const r of vt.scrollback) frag.appendChild(paintRow(r, -1));
      vt.grid.forEach((r, y) => frag.appendChild(paintRow(r, vt.cursorVisible && y === vt.y ? vt.x : -1)));
      el.appendChild(frag);
      if (atBottom) el.scrollTop = el.scrollHeight;
    });
  }
  vt.text = () => vt.grid.map(r => r.map(c => c[0]).join('').replace(/\s+$/, '')).join('\n');
  return vt;
}

// What a keypress is on the wire. Ctrl-<letter> is the byte, Enter is \r
// (the tty turns it into the newline), Backspace is DEL — busybox's line
// editor and vi both erase on it. Cmd-combinations are the browser's.
function keyBytes(e) {
  if (e.metaKey) return null;
  if (e.ctrlKey && !e.altKey && e.key.length === 1) {
    const c = e.key.toUpperCase().charCodeAt(0);
    if (c >= 64 && c <= 95) return String.fromCharCode(c - 64);
    if (e.key === ' ') return '\x00';
    return null;
  }
  const named = { Enter: '\r', Backspace: '\x7f', Tab: '\t', Escape: '\x1b',
    ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
    Home: '\x1b[H', End: '\x1b[F', Delete: '\x1b[3~', Insert: '\x1b[2~', PageUp: '\x1b[5~', PageDown: '\x1b[6~' };
  if (named[e.key]) return named[e.key];
  if (e.key.length === 1 && !e.ctrlKey) return e.key;
  return null;
}

export function TerminalApp(body, win) {
  // A real terminal on the machine's second serial line: VM.tty(1) is bytes
  // both ways, so Ctrl-C, top, vi and a password prompt all work, and its
  // shell is not the one api.shell and the agent share. One holder per line:
  // while an app holds it this pane says so and offers to try again.
  body.style.padding = '0';
  body.textContent = '';
  const screen = document.createElement('div');
  screen.className = 'tty';
  screen.tabIndex = 0;
  const input = document.createElement('textarea');
  input.className = 'tty-input';
  input.setAttribute('aria-label', 'terminal input');
  input.autocomplete = 'off'; input.spellcheck = false;
  const note = document.createElement('div');
  note.className = 'tty-note small';
  body.append(screen, input, note);
  const vt = createVt(screen, s => { if (tty) tty.write(s); });
  let tty = null, ro = null, resizeTimer = 0, sized = false;

  const say = (text, cls) => { note.textContent = text; note.className = 'tty-note small' + (cls ? ' ' + cls : ''); note.hidden = !text; };
  const focus = () => input.focus();
  screen.addEventListener('mousedown', e => { if (!window.getSelection().toString()) { e.preventDefault(); focus(); } });
  screen.addEventListener('mouseup', () => { if (!window.getSelection().toString()) focus(); });
  input.addEventListener('keydown', e => {
    if (!tty) return;
    const bytes = keyBytes(e);
    if (bytes === null) return;
    e.preventDefault();
    tty.write(bytes);
  });
  input.addEventListener('paste', e => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (tty && text) tty.write(text.replace(/\r?\n/g, '\r'));
  });
  input.addEventListener('input', () => { input.value = ''; });

  // Cells from a probe glyph, so cols/rows are what fits, not a guess.
  const cell = () => {
    const probe = document.createElement('span');
    probe.textContent = 'W'.repeat(20);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    screen.appendChild(probe);
    const r = probe.getBoundingClientRect();
    probe.remove();
    return { w: r.width / 20, h: r.height };
  };
  // The shell gets the size once per handle (`sized`), then on every change.
  // A trial paint (reload_ui) measures 0×0 in detached chrome: nothing is
  // sent, and the observer calls back once the chrome is in the document.
  const fit = () => {
    const c = cell();
    if (!(c.w > 0 && c.h > 0)) return;
    const style = getComputedStyle(screen);
    const w = screen.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const h = screen.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const cols = Math.max(2, Math.floor(w / c.w)), rows = Math.max(2, Math.floor(h / c.h));
    if (sized && cols === vt.cols && rows === vt.rows) return;
    vt.resize(cols, rows);
    if (tty) { tty.resize(cols, rows); sized = true; }
  };
  const scheduleFit = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fit, 150); };

  const attach = () => {
    try { tty = VM.tty(1, 'the built-in Terminal'); }
    catch (e) {
      say(e.message + ' — ', 'no');
      const retry = document.createElement('button');
      retry.className = 'btn sm'; retry.textContent = 'try again';
      retry.onclick = settle;
      note.appendChild(retry);
      return;
    }
    say('');
    sized = false;
    tty.onData(bytes => vt.feed(bytes));
    fit();
    focus();
  };
  // Subscribed for the life of the window, not until the first attach: a
  // VM.restart replaces the tty records under the handle (its onData never
  // fired again, its writes went to a record nobody held), and during a
  // reload_ui trial the live window still holds the line — the handle is
  // dropped the moment the tty is not live, and the line is taken the
  // moment it is free (a close() in the kernel emits).
  const settle = () => {
    const live = VM.state === 'ready' && VM.ttyState === 'ready';
    if (tty && !live) { const stale = tty; tty = null; stale.close(); }
    if (live) { if (!tty) attach(); return; }
    if (VM.ttyState === 'failed') say('the machine has no terminal line: ' + VM.ttyError, 'no');
    else if (VM.state === 'failed' || VM.state === 'unavailable') say('the machine is not available', 'no');
    else say('waiting for the machine…', 'dimmer');
  };
  Windows.onDispose(win, VM.on(settle));
  settle();
  ro = new ResizeObserver(scheduleFit);
  ro.observe(screen);
  Windows.onDispose(win, () => {
    ro.disconnect();
    clearTimeout(resizeTimer);
    if (tty) tty.close();
  });
}

/* ---------- apps ------------------------------------------------------ */

export function WorkspaceApp(body) {
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

export function FilesApp(body) {
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

export function CapsApp(body, win) {
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
    </p>
    <h3 style="margin:18px 0 6px">Bring your own agent</h3>
    <p class="small muted" style="margin:0 0 8px">
      Claude Code, Cursor or Codex can drive this desktop through <b>vibeos-mcp</b> with their own
      model and subscription, instead of a pasted key. Pair, then add the command to your agent.
    </p>
    <p class="small" id="mcpState" style="margin:0 0 8px"></p>
    <div class="row" id="mcpCmd" hidden style="gap:6px;align-items:center;margin:0 0 8px;flex-wrap:wrap">
      <code id="mcpCommand" style="font-size:11px;word-break:break-all;user-select:all"></code>
      <button class="btn sm" id="mcpCopy">copy</button>
    </div>
    <p class="note" id="mcpTrust" style="margin:0 0 10px"></p>
    <div class="row" style="gap:6px">
      <button class="btn p sm" id="mcpPair">Pair an agent</button>
      <button class="btn sm" id="mcpRetry" hidden>Retry</button>
      <button class="btn sm" id="mcpTakeOver" hidden>Take over here</button>
      <button class="btn sm" id="mcpRevoke" hidden>Forget this agent</button>
    </div>`;
  mcpPane(body, win);
}

// The relay sees every call and the token is root: the pane says both in
// plain words. Every string here — the state, the agent's name, an error,
// the command — lands through textContent, never markup: the agent's name
// is whatever the MCP client called itself.
function mcpPane(body, win) {
  const state = body.querySelector('#mcpState'), cmd = body.querySelector('#mcpCmd'), code = body.querySelector('#mcpCommand');
  const trust = body.querySelector('#mcpTrust'), pair = body.querySelector('#mcpPair'), retry = body.querySelector('#mcpRetry'), revoke = body.querySelector('#mcpRevoke'), copy = body.querySelector('#mcpCopy');
  trust.textContent = 'An agent with this token has root on this desktop: it can edit the OS source and run commands in the machine; the relay sees the calls. The token is remembered in this browser for seven days — Forget this agent ends it, closing the tab does not.';
  const refusal = RemoteBridge.refusal();
  let probe = null;
  // Which relay this tab is on, and the instance that answered. On the
  // durable relay the instance is the region; on the vercel route it is the
  // function instance, and an agent on another one never sees this tab.
  const inst = () => ' Via ' + RemoteBridge.relayLabel() + '.';
  const paint = () => {
    const st = RemoteBridge.state, d = RemoteBridge.detail;
    state.className = 'small ' + (st === 'connected' ? 'yes' : st === 'error' ? 'no' : st === 'off' ? 'dimmer' : 'part');
    state.textContent =
      refusal ? 'Pairing is refused here — ' + refusal
      : st === 'off' && probe && !probe.ok ? probe.reason
      : st === 'off' ? 'No agent paired. Pairing mints a token for this tab.'
      : st === 'pairing' ? 'Pairing — ' + d + '…'
      : st === 'waiting' ? 'Waiting for an agent: paste the command into your MCP client. Talk to your agent in its own window; it drives this desktop, and the built-in chat keeps working alongside it.' + inst()
      : st === 'connected' ? d + ' is connected and driving this desktop (' + RemoteBridge.calls + ' call' + (RemoteBridge.calls === 1 ? '' : 's') + '). Talk to it in its own window.' + inst()
      : 'Not connected — ' + d;
    const hasToken = !!RemoteBridge.token;
    cmd.hidden = !hasToken;
    if (hasToken) code.textContent = RemoteBridge.command();
    pair.hidden = hasToken || !!refusal;
    pair.disabled = !!refusal || (probe !== null && !probe.ok);
    revoke.hidden = !hasToken;
    takeOver.hidden = !RemoteBridge.heldElsewhere;
    retry.hidden = !(st === 'error' && hasToken && !RemoteBridge.socket);
  };
  pair.onclick = async () => { pair.disabled = true; await RemoteBridge.pair(); paint(); };
  retry.onclick = () => { RemoteBridge.retry(); paint(); };
  revoke.onclick = () => { RemoteBridge.revoke(); paint(); };
  const takeOver = body.querySelector('#mcpTakeOver');
  takeOver.onclick = () => { RemoteBridge.takeOver(); paint(); };
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(RemoteBridge.command()); copy.textContent = 'copied'; }
    catch (e) { copy.textContent = 'select the line and copy it (' + e.message + ')'; }
  };
  Windows.onDispose(win, RemoteBridge.on(paint));
  paint();
  // The static mirror has no /api: say so up front rather than after a
  // click that dials nothing. A refused pane skips the probe.
  if (!refusal && !RemoteBridge.token) RemoteBridge.available().then(r => { probe = r; paint(); });
}

export function SyncApp(body, win) {
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
  Windows.onDispose(win, Sync.onRun(() => { paint(); stamp(); }));

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

export function AboutApp(body) {
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

/* ---------- settings ---------------------------------------------------
   Workspace, files, the machine, sync, capabilities: none of these are apps.
   They are how the system is configured, so they live in one window with
   tabs. The dock is for actual apps — vibeOS itself, and whatever it builds.
   -------------------------------------------------------------------- */

export const SETTINGS_TABS = [
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

export function SettingsApp(body, win, opts) {
  body.style.padding = '0';
  body.style.display = 'flex';
  body.innerHTML = `
    <nav id="tabs" style="flex:0 0 132px;border-right:1px solid var(--line);padding:8px;display:flex;flex-direction:column;gap:2px"></nav>
    <div id="pane" style="flex:1;overflow:auto;min-width:0"></div>`;
  const nav = body.querySelector('#tabs'), pane = body.querySelector('#pane');

  // A pane's subscriptions are the window's (Windows.onDispose); a tab
  // switch runs them before the next pane subscribes, or a pane painted into
  // a detached node kept repainting until the window closed.
  const show = (tab) => {
    Windows.dispose(win);
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

export function NetworkApp(body, win) {
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
  // The state line follows the link while the pane is open — the window's
  // disposers let it go — and stays out of the way while the relay URL has
  // focus or has been edited: a failed probe emits every 10 s while
  // 'disconnected', and a re-render replaces the input, so a focused one
  // lost its caret on every probe.
  Windows.onDispose(win, VM.on(() => {
    const input = body.querySelector('#relay');
    if (document.activeElement === input || input.value !== (VM.relay || '')) return;
    render();
  }));
}

export function DesignApp(body) {
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
    <p class="tiny dimmer" style="margin-top:0" id="whoseCopy"></p>
    ${forkVersionHtml()}
    <p class="note">The agent can change this itself &mdash; ask it for light mode. Apps mount inside this document, so the tokens above are inherited &mdash;
    a generated app using <code>var(--text)</code> follows the desktop instead of drifting from it.</p>`;

  body.querySelector('#whoseCopy').textContent = whoseCopyText();
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

// Which files boot from the workspace this session: the loader's decision
// for os.css and the kernel, the registry's for the ui.
function storedFiles() {
  const b = window.__vibeosBoot;
  const loader = Object.entries(b.files || {}).filter(([, src]) => src === 'stored').map(([f]) => f);
  const ui = Object.entries(UI.source).filter(([, src]) => src === 'stored').map(([f]) => f);
  return [...loader, ...ui];
}
function whoseCopyText() {
  const stored = storedFiles();
  if (!stored.length) return 'Running the served desktop. The agent\'s first edit_file on a system/ file forks it into your workspace, and yours boots from then on. The OS is system/kernel/*.js (reload_os to apply) and system/ui/*.js (reload_ui applies live), styled by system/os.css.';
  return 'This desktop is running your copy of: ' + stored.map(f => 'system/' + f).join(', ') + '. The agent edits them with edit_file; delete a file (or write it empty) to go back to the served one.';
}

// A fork pins the OS to a version. The loader (index.html) compares the
// version the fork was taken from with the one vibeos.sh serves now, and
// this is where that answer lives in the UI, with the same three actions as
// the loader's bar. Text goes in through textContent: the record and its
// parse errors are guest strings, and a JSON.parse message quotes the file.
function forkVersionHtml() {
  const b = window.__vibeosBoot;
  if (!b || !b.stored) return '';
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
    ? 'The version check could not run this boot (a served file was unreachable), so whether the served vibeOS has moved on is unknown. "Take the update" still sets your copy aside and boots the served one.'
    : 'Running the served desktop; nothing is forked.');
  if (fork.error) return 'Its version record could not be read: ' + fork.error + '. The served files are ' + fork.files.map(f => f + '=' + fork.served[f]).join(', ') + ' now; which version this copy came from is unknown.';
  const from = fork.files.map(f => f + ' from version ' + fork.base[f] + (fork.at[f] ? ' (' + fork.at[f].slice(0, 10) + ')' : '')).join(', ');
  if (!fork.moved) return 'Forked: ' + from + '. That is still what vibeos.sh serves, so this copy is up to date with it.';
  const now = fork.files.filter(f => fork.base[f] !== fork.served[f]).map(f => f + ' is ' + fork.served[f]).join(', ');
  return 'Forked: ' + from + '. vibeOS has moved since: ' + now + ' now' + (fork.dismissed ? ' (you chose to keep yours for this version)' : '') +
    '. Keep mine hides the notice until the next served change; Take the update sets each of your copies aside as system/<file>.bak and boots the served ones; Show diff lists what changed between them.';
}

export function ModelApp(body) {
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
