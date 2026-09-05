/* ui/browser.js — a browser, without a browser engine. A ui module (see
   ui/windows.js).

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
   origin is only worth something to code, and no code runs here. The fetch
   itself — the proxy, and guestFetch for the machine's own localhost — is
   the kernel's (kernel/agent.js).
   -------------------------------------------------------------------- */

export function BrowserApp(body) {
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
  // A search, whoever it was typed for. Google's results page — and the
  // "Turn on JavaScript to keep searching" page it redirects to with scripts
  // off (measured 2026-09-04, gbv=1 too) — Bing's, DuckDuckGo's and our own
  // Marginalia url all yield the query, and the Browser answers it itself.
  const searchQuery = (url) => {
    let u; try { u = new URL(url); } catch { return null; }
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'old-search.marginalia.nu' && u.pathname === '/search') return u.searchParams.get('query');
    if (/(^|\.)google\.[a-z.]+$/.test(h) && (u.pathname === '/search' || u.pathname.startsWith('/httpservice/retry/enablejs'))) return u.searchParams.get('q') || sessionStorage.getItem('vibeos-last-search');
    if (h === 'bing.com' && u.pathname === '/search') return u.searchParams.get('q');
    if (/(^|\.)duckduckgo\.com$/.test(h)) return u.searchParams.get('q');
    return null;
  };
  // Measured 2026-09-04 through this proxy: bing (rss and html alike, with
  // or without mkt/cc) answers a datacenter address with results for the
  // FIRST WORD of a multi-word query — "best pizza in lisbon" gave Best Buy
  // and three dictionaries; yahoo 500s, qwant lite renders results with
  // scripts, yandex is a captcha. marginalia's results are real, so every
  // search shape lands on its page, and the status says so.
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

  let searchedFor = '';
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
    const query = guest ? null : searchQuery(url);
    const kind = guest ? 'localhost' : query !== null ? 'search' : 'site';
    const t0 = Date.now();
    try {
      track('browser_open', { kind, host: kind === 'search' ? 'search' : host, guest, how: push ? 'nav' : 'history' });
      if (query !== null && !url.startsWith(SEARCH)) {
        // A google, bing or duckduckgo search (or google's "turn on
        // JavaScript" page) is answered by the engine that answers: the
        // address bar shows where the results came from.
        try { sessionStorage.setItem('vibeos-last-search', query); } catch {}
        const via = SEARCH + encodeURIComponent(query);
        input.value = via;
        searchedFor = host;
        return open(via, push);
      }
      let r = await (guest ? guestFetch(url) : proxyFetch(url));
      // Marginalia throttles softly: a 1 KB "Wait For A Moment" page instead
      // of results, and the same query answers a second later. One retry,
      // then the status says what happened rather than showing a blank wait.
      let throttled = false;
      if (kind === 'search' && r.ok && /Wait For A Moment/i.test(r.text)) {
        status.textContent = 'the search engine asked to wait a moment — retrying…';
        await new Promise(res => setTimeout(res, 1500));
        r = await proxyFetch(url);
        throttled = /Wait For A Moment/i.test(r.text);
      }
      track('browser_result', { kind, ok: r.ok, status: r.status, seconds: Math.round((Date.now() - t0) / 1000), throttled });
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
        + (guest ? `served from inside the machine (${r.via}) · scripts off · assets not loaded` : 'scripts disabled')
        + (searchedFor && kind === 'search' ? ` · ${searchedFor} needs JavaScript, so this search ran on marginalia` : '')
        + (throttled ? ' · marginalia is throttling this address right now: wait a few seconds and search again' : '');
      searchedFor = '';
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
