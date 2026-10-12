/* vibeOS session replay — the hosted page only (beads-tavc.3.2).
 *
 * Loaded by kernel/boot.js (startReplayWhenIdle) after the desktop painted,
 * the page loaded and the browser went idle, and only after the server said
 * yes (GET /api/events/replay: not a bot, not a team browser, the month under
 * Hexclave's replay quota). Records with rrweb's record-only build — the same
 * rrweb and event format the Hexclave SDK's SessionRecorder uses, so the
 * dashboard's player reads it — and posts batches to /api/events/replay,
 * which forwards them under this browser's Hexclave user.
 *
 * What a replay can show is decided HERE, before anything leaves the page:
 * - every text node is masked (maskTextSelector '*'): chat turns, the
 *   Terminal, files, Settings › Model, whatever an app paints. A key pasted
 *   into the chat must not be readable in a replay; layout, windows, clicks
 *   and timing are what a replay is for.
 * - every input is masked (maskAllInputs) to a fixed '***', so not even a
 *   key's length is kept;
 * - blocked outright (a grey box, no content, no mutations): the machine's
 *   screen, the Terminal, every password input, the key modal's input, and
 *   every iframe;
 * - no canvas, no fonts, no inlined images.
 * The served file only: never in OS_FILES, so a forked kernel cannot change
 * what is masked. The mirror and the image never load it (HexEvents.hosted()).
 */
(function () {
  'use strict';
  if (window.__vibeosReplay) return;
  const ROUTE = '/api/events/replay';
  const SESSION_KEY = 'vibeos-replay-session';
  const IDLE_MS = 3 * 60 * 1000;        // a new replay after 3 min of nothing, as the SDK does
  const FLUSH_MS = 5000;
  const MAX_EVENTS = 200;
  const MAX_BYTES = 512 * 1024;         // uncompressed, per batch
  const KEEPALIVE_MAX = 60 * 1024;      // fetch keepalive bodies are capped at 64 KB
  const segment = crypto.randomUUID();
  const SELF = document.currentScript ? document.currentScript.src : '';

  const status = window.__vibeosReplay = { state: 'starting', batches: 0, events: 0, error: '' };
  let stop = null, timer = null, buffer = [], bytes = 0, session = null, flushing = null;

  const maskWord = s => s.replace(/\S+/g, w => '*'.repeat(Math.min(w.length, 6)));
  const OPTIONS = {
    maskAllInputs: true,
    maskInputFn: () => '***',
    maskTextSelector: '*',
    maskTextFn: maskWord,
    blockSelector: '.vm-screen, .tty, input[type="password"], #keyInput, iframe',
    recordCanvas: false,
    collectFonts: false,
    inlineImages: false,
    sampling: { mousemove: 100, scroll: 150, input: 'last' },
  };

  function currentSession(now) {
    if (session && now - session.last <= IDLE_MS) { session.last = now; return session; }
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch {}
    if (!s || typeof s.id !== 'string' || typeof s.started !== 'number' || now - s.last > IDLE_MS) {
      s = { id: crypto.randomUUID(), started: now, last: now };
    }
    s.last = now;
    session = s;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
    return s;
  }

  function halt(why) {
    status.state = 'stopped';
    status.error = why;
    if (stop) { try { stop(); } catch {} stop = null; }
    if (timer) { clearInterval(timer); timer = null; }
    buffer = []; bytes = 0;
    removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onHide);
  }

  async function gzip(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function send(events, keepalive) {
    const now = Date.now();
    const s = currentSession(now);
    const json = JSON.stringify({
      browser_session_id: s.id, session_replay_segment_id: segment, batch_id: crypto.randomUUID(),
      started_at_ms: s.started, sent_at_ms: now, events,
    });
    // On pagehide there is no time to compress: plain JSON under the keepalive cap, or nothing.
    if (keepalive && json.length > KEEPALIVE_MAX) return;
    const gz = !keepalive && typeof CompressionStream === 'function';
    const res = await fetch(ROUTE, {
      method: 'POST', credentials: 'same-origin', keepalive,
      headers: { 'content-type': gz ? 'application/octet-stream' : 'application/json' },
      body: gz ? await gzip(json) : json,
    });
    if (res.status === 403) {
      const why = await res.json().then(j => j.reason, () => 'refused');
      halt('server stopped recording: ' + why);
      return;
    }
    if (!res.ok) throw new Error('replay batch: ' + res.status);
    status.batches++;
    status.events += events.length;
  }

  function flush(keepalive) {
    if (!buffer.length || status.state === 'stopped') return flushing;
    const events = buffer; buffer = []; bytes = 0;
    const run = (flushing || Promise.resolve()).then(() => send(events, keepalive)).catch(e => {
      status.error = e.message;
      console.warn('vibeOS replay:', e.message);
    });
    flushing = run;
    return run;
  }

  function onHide(e) {
    if (e.type === 'pagehide' || document.visibilityState === 'hidden') flush(true);
  }

  function load(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('could not load ' + src));
      document.head.appendChild(s);
    });
  }

  async function start() {
    const gate = await fetch(ROUTE, { credentials: 'same-origin', cache: 'no-store' });
    if (!gate.ok) throw new Error('replay gate: ' + gate.status);
    const answer = await gate.json();
    if (!answer.record) { halt('not recorded: ' + answer.reason); return; }
    if (!SELF) throw new Error('replay.js cannot tell where it was served from');
    await load(new URL('vendor/rrweb-record.min.js', SELF).href);
    if (typeof window.rrwebRecord !== 'function') throw new Error('rrweb-record did not define rrwebRecord');
    stop = window.rrwebRecord({
      ...OPTIONS,
      emit(event) {
        const size = JSON.stringify(event).length;
        buffer.push(event); bytes += size;
        currentSession(Date.now());
        if (buffer.length >= MAX_EVENTS || bytes >= MAX_BYTES) flush(false);
      },
    });
    timer = setInterval(() => flush(false), FLUSH_MS);
    addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    status.state = 'recording';
    if (typeof track === 'function') track('replay_started');
  }

  status.options = OPTIONS;
  start().catch(e => { halt(e.message); console.warn('vibeOS replay did not start:', e.message); });
})();
