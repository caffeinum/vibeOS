/**
 * Client-side OpenAI Codex OAuth helpers for vibeOS /app.
 * Vanilla JS — no bundler. Loaded via <script src="/app/oauth.js">.
 */
var VibeOSOAuth = (function () {
  const OAUTH_STORAGE_KEY = 'vibeos-oauth';
  const CODEX_MODEL = 'gpt-5.6-terra';
  const REFRESH_MARGIN_MS = 5 * 60 * 1000;

  function loadOAuthSession() {
    try {
      const raw = localStorage.getItem(OAUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.accessToken || !parsed?.accountId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveOAuthSession(session) {
    if (!session?.accessToken) {
      try { localStorage.removeItem(OAUTH_STORAGE_KEY); } catch {}
      return null;
    }
    try { localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(session)); } catch {}
    return session;
  }

  function clearOAuthSession() {
    try { localStorage.removeItem(OAUTH_STORAGE_KEY); } catch {}
  }

  function oauthAuthHeaders(session) {
    if (!session?.accessToken || !session?.accountId) return null;
    return {
      authorization: 'Bearer ' + session.accessToken,
      'chatgpt-account-id': session.accountId,
    };
  }

  function needsOAuthRefresh(session, now) {
    if (now === undefined) now = Date.now();
    if (!session?.refreshToken || !session?.expiresAt) return false;
    return now >= session.expiresAt - REFRESH_MARGIN_MS;
  }

  async function refreshOAuthSession(session, fetchImpl) {
    if (!fetchImpl) fetchImpl = fetch;
    if (!session?.refreshToken) throw new Error('no refresh token');
    const r = await fetchImpl('/api/openai/oauth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('refresh failed ' + r.status));
    return saveOAuthSession(j.tokens);
  }

  async function ensureFreshOAuthSession(session, fetchImpl) {
    if (!fetchImpl) fetchImpl = fetch;
    if (!session) return null;
    if (!needsOAuthRefresh(session)) return session;
    return refreshOAuthSession(session, fetchImpl);
  }

  async function startOAuthDeviceFlow(fetchImpl) {
    if (!fetchImpl) fetchImpl = fetch;
    const r = await fetchImpl('/api/openai/oauth/start', { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('start failed ' + r.status));
    if (!j.url || !j.code || !j.id) throw new Error('invalid start response');
    return j;
  }

  async function pollOAuthDeviceFlow(id, fetchImpl) {
    if (!fetchImpl) fetchImpl = fetch;
    const r = await fetchImpl('/api/openai/oauth/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    if (!r.ok && j.status !== 'denied') throw new Error(j.error || ('poll failed ' + r.status));
    return j;
  }

  async function pollOAuthUntilComplete(id, options) {
    const fetchImpl = (options && options.fetchImpl) || fetch;
    const sleep = (options && options.sleep) || function (ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    };
    const intervalMs = (options && options.intervalMs) || 5000;
    const maxAttempts = (options && options.maxAttempts) || 120;
    const onPoll = options && options.onPoll;
    for (let i = 0; i < maxAttempts; i++) {
      const result = await pollOAuthDeviceFlow(id, fetchImpl);
      if (onPoll) onPoll(result);
      if (result.status === 'complete') return saveOAuthSession(result.tokens);
      if (result.status === 'denied') throw new Error(result.error || 'authorization denied');
      await sleep(intervalMs);
    }
    throw new Error('authorization timed out');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  function renderOAuthPanelHtml(opts) {
    const code = opts.code;
    const url = opts.url;
    const status = opts.status || 'waiting';
    if (status === 'complete') {
      return (
        '<div class="oauth-panel col" id="oauthPanel">' +
          '<p class="small yes" style="margin:0">signed in with chatgpt</p>' +
        '</div>'
      );
    }
    const statusText = status === 'waiting'
      ? 'waiting for you to authorize at openai…'
      : status === 'polling'
        ? 'checking authorization…'
        : status;
    // Almost nobody finishes this flow, and the fiddly part is the code: select
    // it, copy it, find the tab. So do all three for them — it is on the
    // clipboard the moment it appears, and openai opens on a short countdown
    // they can skip or ignore.
    return (
      '<div class="oauth-panel col" id="oauthPanel">' +
        '<p class="small dimmer oauth-instruction" style="margin:0">your code — copying it for you:</p>' +
        '<div class="oauth-code mono" id="oauthCode">' + escapeHtml(code) + '</div>' +
        '<div class="row" style="gap:6px">' +
          '<button type="button" class="btn sm" id="oauthCopy">Copy code</button>' +
          '<button type="button" class="btn p sm" id="oauthOpen">Open OpenAI now</button>' +
        '</div>' +
        '<p class="tiny dimmer" id="oauthCountdown" style="margin:0"></p>' +
        '<p class="small" style="margin:0"><a href="' + escapeAttr(url) + '" target="_blank" rel="noopener">' + escapeHtml(url) + '</a></p>' +
        '<p class="tiny dimmer oauth-status" style="margin:0">' + escapeHtml(statusText) + '</p>' +
      '</div>'
    );
  }

  // Call once, right after inserting the panel above.
  function wireOAuthPanel(slot, flow) {
    if (!slot) return;
    const code = flow.code;
    const url = flow.url;
    const copyBtn = slot.querySelector('#oauthCopy');
    const openBtn = slot.querySelector('#oauthOpen');
    const countEl = slot.querySelector('#oauthCountdown');
    const label = slot.querySelector('.oauth-instruction');
    function note(msg) { if (countEl) countEl.textContent = msg; }

    function copy() {
      if (!navigator.clipboard) {
        if (label) label.textContent = 'your code — select and copy it:';
        return;
      }
      navigator.clipboard.writeText(code).then(function () {
        if (copyBtn) copyBtn.textContent = 'Copied ✓';
        if (label) label.textContent = 'your code — copied to your clipboard:';
      }, function () {
        // Clipboard writes can be refused when the page isn't focused. Say so
        // rather than leaving a "copied" claim that isn't true.
        if (label) label.textContent = 'your code — copy it yourself, the browser refused:';
      });
    }
    copy();
    if (copyBtn) copyBtn.onclick = copy;

    let opened = false;
    function go() {
      if (opened) return;
      opened = true;
      clearInterval(tick);
      const w = window.open(url, '_blank', 'noopener');
      // A timer-driven window.open is often popup-blocked; the link below still
      // works, so point at it instead of looking like nothing happened.
      note(w ? 'opened openai in a new tab — paste the code there'
             : 'your browser blocked the popup — use the link below');
    }
    if (openBtn) openBtn.onclick = go;

    let left = 3;
    note('opening openai in ' + left + '…');
    var tick = setInterval(function () {
      left -= 1;
      if (left > 0) { note('opening openai in ' + left + '…'); return; }
      go();
    }, 1000);
    slot.__oauthTimer = tick;
  }

  function updateOAuthPanelStatus(slot, flow, status) {
    if (!slot) return;
    if (status === 'complete') {
      if (slot.__oauthTimer) { clearInterval(slot.__oauthTimer); slot.__oauthTimer = null; }
      slot.innerHTML = renderOAuthPanelHtml({ code: flow.code, url: flow.url, status: 'complete' });
      return;
    }
    const statusEl = slot.querySelector('.oauth-status');
    if (!statusEl) return;
    statusEl.textContent = status === 'polling'
      ? 'checking authorization…'
      : 'waiting for you to authorize at openai…';
  }

  const api = {
    OAUTH_STORAGE_KEY: OAUTH_STORAGE_KEY,
    CODEX_MODEL: CODEX_MODEL,
    loadOAuthSession: loadOAuthSession,
    saveOAuthSession: saveOAuthSession,
    clearOAuthSession: clearOAuthSession,
    oauthAuthHeaders: oauthAuthHeaders,
    needsOAuthRefresh: needsOAuthRefresh,
    refreshOAuthSession: refreshOAuthSession,
    ensureFreshOAuthSession: ensureFreshOAuthSession,
    startOAuthDeviceFlow: startOAuthDeviceFlow,
    pollOAuthDeviceFlow: pollOAuthDeviceFlow,
    pollOAuthUntilComplete: pollOAuthUntilComplete,
    renderOAuthPanelHtml: renderOAuthPanelHtml,
    wireOAuthPanel: wireOAuthPanel,
    updateOAuthPanelStatus: updateOAuthPanelStatus,
  };

  return api;
})();
