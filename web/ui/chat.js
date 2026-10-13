/* ui/chat.js — the agent window. A ui module (see ui/windows.js). */

// Two chat windows were two copies of one log, and the last writer won. The
// dock raises the one that is open instead of opening another.
// The agent answers in light markdown — code spans, fences, bullets, bold —
// and it was painted as raw text with the backticks showing. This builds DOM
// nodes for that subset and nothing else: no innerHTML, so a reply that
// quotes a fetched page cannot carry markup into the desktop's origin.
export function renderMd(el, text) {
  el.textContent = '';
  const inline = (parent, line) => {
    const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)/g; let last = 0, m;
    while ((m = re.exec(line))) {
      if (m.index > last) parent.appendChild(document.createTextNode(line.slice(last, m.index)));
      const node = document.createElement(m[1] ? 'code' : 'b');
      node.textContent = m[1] ? m[1].slice(1, -1) : m[2].slice(2, -2);
      parent.appendChild(node); last = m.index + m[0].length;
    }
    if (last < line.length) parent.appendChild(document.createTextNode(line.slice(last)));
  };
  const lines = String(text).split('\n');
  let i = 0, list = null, para = null;
  const closeAll = () => { list = null; para = null; };
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      closeAll(); const pre = document.createElement('pre'); const buf = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) buf.push(lines[i]);
      pre.textContent = buf.join('\n'); el.appendChild(pre); i++; continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      para = null;
      if (!list) { list = document.createElement('ul'); el.appendChild(list); }
      const item = document.createElement('li'); inline(item, li[1]); list.appendChild(item); i++; continue;
    }
    if (!line.trim()) { closeAll(); i++; continue; }
    list = null;
    if (!para) { para = document.createElement('p'); el.appendChild(para); }
    else para.appendChild(document.createElement('br'));
    inline(para, line); i++;
  }
}

// The window paints Chat (kernel/agent.js) and nothing else: every bubble
// comes from Chat.turns, Chat.running and Chat.notes, so a
// reload_ui — or a close and reopen — paints the same conversation back,
// turn in flight included. Every model, tool or guest string lands through
// textContent or renderMd: a refused title, a card, a reply are never markup.
export function ChatApp(body, win) {
  // The body is a column: the log scrolls, the footer with the input is
  // pinned to the window's bottom. A sticky footer inside the scrolling
  // body sat right under the last bubble while the log was short — "the
  // input glues to the end of content". The input is a two-line textarea:
  // Enter sends, Shift+Enter is a newline.
  body.className = 'chat-app';
  body.innerHTML = `
    <div id="log" class="chat-log"></div>
    <div id="composer" class="chat-composer">
      <div id="connectCard" class="connect-card col" hidden></div>
      <div id="zeroLine" class="chat-zero row" hidden></div>
      <div id="privateNote" class="chat-first-note" hidden></div>
      <div id="chips" class="chat-chips row" hidden></div>
      <div class="chat-composer-row row">
        <button class="btn sm chat-attach" id="attach" type="button" title="attach an image" aria-label="attach an image"></button>
        <input type="file" id="pick" accept="image/*" multiple hidden>
        <textarea id="msg" class="chat-input" rows="2" placeholder="ask for a window, or a script for the VM — attach or paste an image"></textarea>
        <button class="btn p sm chat-send" id="send">Send</button>
      </div>
      <div id="firstNote" class="chat-first-note" hidden></div>
    </div>`;
  const log = body.querySelector('#log'), input = body.querySelector('#msg'), chips = body.querySelector('#chips');
  // A picked file lands exactly like a pasted or dropped one: Chat.attach,
  // the chip row, the next message. Nothing said pictures were welcome
  // before; the paperclip and the placeholder do now.
  const attachBtn = body.querySelector('#attach'), pick = body.querySelector('#pick');
  attachBtn.textContent = '📎';
  attachBtn.onclick = () => pick.click();
  pick.addEventListener('change', () => {
    const files = [...pick.files];
    pick.value = '';
    if (files.length) Chat.attach(files).then(() => input.focus());
  });

  const bubble = (who, html, before = null, extraClass = '') => {
    const d = document.createElement('div');
    d.className = 'chat-bubble ' + (who === 'you' ? 'chat-bubble-you' : 'chat-bubble-vibeos') + (extraClass ? ' ' + extraClass : '');
    d.innerHTML = html;
    log.insertBefore(d, before);
    return d;
  };
  const cardIcon = (src, title) => {
    const img = document.createElement('img');
    img.className = 'chat-card-icon';
    img.src = src || Apps.synthesizeIcon(title);
    img.alt = '';
    return img;
  };
  const line = (text, error = false, extraClass = '') => {
    const d = bubble('vibeos', error ? '<span class="no"></span>' : '<span class="tiny dimmer"></span>', null, extraClass + (error ? ' chat-line-error' : ' chat-line-meta'));
    d.firstChild.textContent = text;
    return d;
  };

  // The old copy here told you to run server.py, which is the local python demo
  // and does not exist on vibeos.sh — it read as an error on the hosted build.
  // Offer the two things that actually work, as a button rather than a chore.
  const readyLine = () =>
    `Ask for anything. I’ll build a <b>window</b> for the desktop, or a <b>script</b> that runs inside the VM, whichever makes sense.<br><span class="tiny dimmer" id="model"></span>`;
  // Three shapes: a model is connected; no model but an agent drives the
  // desktop through vibeos-mcp (then this box is optional, not missing); or
  // nothing yet. The agent's name is the MCP client's own string: textContent.
  let introEl = null;
  const paintIntro = () => {
    const agent = RemoteBridge.state === 'connected';
    const html = Gen.available ? readyLine()
      : agent ? `<b class="part yes"></b> is connected through vibeos-mcp and can drive this desktop.<br>
         <span class="tiny dimmer">Type here and your messages get to the agent on its next tool call (get_mailbox). This box can also run a second model alongside it.</span> <span class="row" style="margin-top:8px"><button class="btn sm" id="chatConnect">Connect a model here too</button></span>`
      : `Ask for anything. I’ll build a <b>window</b> for the desktop, or a <b>script</b> that runs inside the VM. <span class="tiny dimmer">Connect a model below to start.</span>`;
    if (introEl && introEl.isConnected) { introEl.innerHTML = html; }
    else introEl = bubble('vibeos', html);
    // The id is whatever the pane stored: text, like every model string.
    const model = introEl.querySelector('#model');
    if (model) model.textContent = Gen.model;
    if (agent && !Gen.available) introEl.querySelector('b').textContent = RemoteBridge.detail || 'your agent';
    const connectBtn = introEl.querySelector('#chatConnect');
    // An agent is connected, so there is no card: a second model is a
    // Settings › Model choice (its Add a key opens the same options inline).
    if (connectBtn) connectBtn.onclick = () => UI.live().openSettings('model');
  };
  // The intro follows the bridge: the onboarding modal closes itself when an
  // agent connects, and the chat behind it must not keep saying "no model".
  Windows.onDispose(win, RemoteBridge.on(() => { if (introEl) paintIntro(); agentMode(); }));

  // With an agent connected and no model here, this window is the activity
  // view: every tool call lands as a card, and the composer feeds the mailbox.
  const paintActivity = (e) => {
    const d = document.createElement('div');
    d.className = 'agent-act';
    d.style.cssText = 'align-self:flex-start;max-width:92%;padding:6px 10px;font-size:12px;border-left:2px solid var(--line2);opacity:.9';
    const tool = document.createElement('b'); tool.textContent = e.tool;
    const what = document.createElement('span'); what.textContent = e.what ? ' ' + e.what : '';
    const st = document.createElement('span'); st.className = 'tiny ' + (e.ok === false ? 'no' : 'dimmer');
    st.textContent = e.ok === false ? ' — refused: ' + e.error : ` — ${e.ms} ms`;
    const stick = atEnd();
    d.append(tool, what, st); log.appendChild(d);
    if (stick) log.scrollTop = log.scrollHeight;
  };
  let agentOnly = false;
  const agentMode = () => {
    agentOnly = RemoteBridge.state === 'connected' && !Gen.available;
    if (!Chat.ready) return;
    if (RemoteBridge.state === 'connected') {
      input.disabled = false;
      input.placeholder = agentOnly
        ? `message ${RemoteBridge.detail || 'your agent'} — it’ll get this on its next tool call`
        : placeholder;
    }
  };
  Windows.onDispose(win, RemoteBridge.onActivity(e => { if (RemoteBridge.state === 'connected') paintActivity(e); }));

  const paintReload = ({ note, files, source }) => {
    const b = bubble('vibeos', `<b>reloaded</b> <span class="tiny dimmer">${source === 'stored' ? 'running your copy' : 'running the stock desktop'}</span><span class="tiny dimmer" id="files"></span><div id="note"></div>`);
    b.querySelector('#files').textContent = ' · ' + (files || []).join(', ');
    if (note) b.querySelector('#note').textContent = note; else b.querySelector('#note').remove();
  };
  // A card, live or painted back from the log. The source is in memory only
  // (card.src): with it, Open launches that source and Source shows it;
  // without it, a window opens from what the workspace holds under that
  // title, and says so when nothing does.
  const paintCard = (c, before) => {
    if (c.kind === 'refused') {
      const b = bubble('vibeos', '<b></b> <span class="no">refused</span><br><span class="tiny dimmer"></span>', before);
      b.querySelector('b').textContent = c.title; b.querySelector('.dimmer').textContent = c.error;
      return;
    }
    const b = bubble('vibeos', `<div class="chat-card-head row"><span class="chat-card-icon-wrap"></span><div class="chat-card-titles"><b></b> <span class="req">${c.kind === 'vm' ? 'vm script' : 'window'}</span><br>
      <span class="tiny dimmer"></span></div></div>
      <div class="row chat-card-actions"><button class="btn sm" id="act"></button>${c.src ? '<button class="btn sm" id="src">Source</button>' : ''}</div>
      <pre class="out" id="res" style="display:none;margin-top:8px"></pre>`, before, 'chat-card');
    b.querySelector('.chat-card-icon-wrap').appendChild(cardIcon(c.icon, c.title));
    b.querySelector('b').textContent = c.title;
    b.querySelector('.dimmer').textContent = c.where;
    const act = b.querySelector('#act'), res = b.querySelector('#res');
    const show = t => { res.style.display = 'block'; res.textContent = t; };
    const src = b.querySelector('#src');
    if (src) src.onclick = () => show(c.src);
    if (c.kind === 'vm') {
      act.textContent = 'Run it';
      if (c.src && !c.installed) act.disabled = true;
      act.onclick = async () => {
        if (VM.state !== 'ready') return show('the VM is not running');
        show('running…');
        try { show((await VM.exec('sh /mnt/' + c.file)) || '(no output)'); } catch (e) { show(e.message); }
      };
    } else {
      act.textContent = 'Open';
      act.onclick = async () => {
        // A stock module has no file, so it has no identity to reuse; a saved
        // app does, and Open must not open a second window on it.
        if (c.src) return launchApp({ title: c.title, source: c.src, requires: parseRequires(c.src) });
        const app = (await Apps.list()).apps.find(a => a.title === c.title);
        if (!app) return show('no app titled "' + c.title + '" in the workspace or the VM now');
        (UI.live().openOrRerun || launchApp)(app);
      };
    }
  };
  // A model reply that failed: the provider's words (a slice of a proxy's
  // HTML error page, an interstitial — text, never markup), nothing built,
  // and a button that clears Settings › Model and sends the same prompt as
  // the default (Chat.defaultModel says which). The button rides the LAST
  // failed turn in the log, not the last turn: a bad Settings › Model
  // override survives a reload and any turn after it, and gating on the
  // last turn left the desktop with Settings by hand as the only way back.
  const lastFailure = () => {
    for (let i = Chat.turns.length - 1; i >= 0; i--) {
      const f = Chat.turns[i].failure;
      if (f && f !== 'no model configured') return i;
    }
    return -1;
  };
  const paintFailure = (t, i) => {
    const last = i === lastFailure() && !Chat.running;
    const to = Chat.defaultModel();
    // Hosted AI out of credits or paused: the ways out, on the last failure
    // only — top up or subscribe on /account, or bring your own model.
    // Out of credits, or bring-your-own locked at 0 (needs-pro): the paywall
    // has the price and the terms; this line only points at it. Paused (the
    // month's budget) keeps "your own key or agent" as the way on.
    const billing = last && Hosted.purchases && (t.hosted === 'out-of-credits' || t.hosted === 'needs-pro');
    const ownKey = last && (t.hosted === 'out-of-credits' || t.hosted === 'paused');
    const b = bubble('vibeos', '<span class="no" id="failure"></span>'
      + (last && to ? '<div class="row chat-failure-actions"><button class="btn sm" id="resetModel"></button></div>' : '')
      + (billing || ownKey ? '<div class="row chat-failure-actions">'
        + (billing ? '<button class="btn sm p" id="hostedPro">Subscribe</button>' : '')
        + (ownKey ? '<button class="btn sm" id="hostedOwnKey">Use my own key or agent</button>' : '') + '</div>' : ''), null, 'chat-failure');
    b.querySelector('#failure').textContent = t.failure;
    const pro = b.querySelector('#hostedPro');
    if (pro) pro.onclick = () => Paywall.open('zero_credits');
    const own = b.querySelector('#hostedOwnKey');
    if (own) own.onclick = () => { track('hosted_own_key_click', { code: t.hosted }); openSettings('model'); };
    const btn = b.querySelector('#resetModel');
    if (!btn) return;
    btn.textContent = 'Reset model to ' + to + ' and retry';
    btn.onclick = () => { btn.disabled = true; Chat.resetModelAndRetry(Chat.turns[i - 1].text).catch(e => Chat.line(e.message, true)); };
  };
  const paintTurn = (t, i) => {
    if (t.role === 'user') {
      const b = bubble('you', '<span id="t"></span>' + (t.images && !t.shots ? '<span class="tiny dimmer" id="i"></span>' : ''));
      b.querySelector('#t').textContent = t.text;
      if (t.images && !t.shots) b.querySelector('#i').textContent = (t.text ? ' · ' : '') + t.images + (t.images === 1 ? ' screenshot' : ' screenshots') + ', not kept';
      for (const url of t.shots || []) { const img = document.createElement('img'); img.className = 'shot'; img.alt = ''; img.src = url; b.appendChild(img); }
      return;
    }
    if (t.reload) return paintReload(t.reload);
    (t.cards || []).forEach(c => paintCard(c));
    const running = Chat.running && Chat.running.reply === t;
    if (running) {
      const d = bubble('vibeos', '<span class="dimmer" id="thinking"></span>');
      d.firstChild.textContent = Chat.running.status;
      return;
    }
    if (t.said) renderMd(bubble('vibeos', '<span></span>').querySelector('span'), t.said);
    if (t.failure === 'no model configured') {
      const d = bubble('vibeos', '<span class="no" id="failure"></span>');
      d.querySelector('#failure').textContent = 'no model connected — connect a model to generate';
      return;
    }
    // The message may carry a slice of a proxy's HTML error page (a
    // Cloudflare 502, an interstitial) — text, never markup.
    else if (t.failure) paintFailure(t, i);
    else if (!t.text) line('the page was closed before this turn finished');
  };

  // A message typed while a turn runs: sent as far as the person is
  // concerned, waiting for the agent's next step. Its own class, its text
  // and its pictures through textContent like any user turn.
  // A waiting message can be taken back until a step drains it: steering is
  // for the moment you realise the agent is doing the wrong thing, and half
  // that moment is realising your correction was wrong too. The text goes
  // back to the composer with its pictures, so it can be fixed and sent
  // again rather than retyped.
  const paintQueued = (e) => {
    const b = bubble('you', '<span id="t"></span><span class="tiny" id="q"></span><button class="x" id="unq" title="Take it back"></button>');
    b.className = 'queued';
    b.style.opacity = '.72';
    b.querySelector('#t').textContent = e.text;
    b.querySelector('#q').textContent = ' · waiting for the agent';
    b.querySelector('#unq').textContent = '\u00d7';
    b.querySelector('#unq').onclick = () => {
      if (!Chat.unqueue(e)) return;              // a drain won the race; it is on its way
      input.value = input.value ? e.text + '\n' + input.value : e.text;
      if (e.images && e.images.length) { Chat.pending.unshift(...e.images); Chat.emit('chips'); }
      input.focus();
    };
    for (const img of e.images || []) { const el = document.createElement('img'); el.className = 'shot'; el.alt = ''; el.src = img.dataUrl; b.appendChild(el); }
  };

  // EXAMPLE_PROMPTS (kernel/agent.js) as chips, only while there is nothing
  // in the log — a fresh desktop, or a restored log that is empty — and not
  // while an agent drives the desktop from its own window. A click sends the
  // prompt the way typing it would, and the first turn takes the chips away.
  const paintExamples = () => {
    if (Chat.turns.length || Chat.running || agentOnly) return;
    const row = document.createElement('div');
    row.id = 'examples';
    row.className = 'row';
    row.style.cssText = 'flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:92%';
    for (const text of EXAMPLE_PROMPTS) {
      const chip = document.createElement('button');
      chip.className = 'btn sm example';
      chip.type = 'button';
      chip.textContent = text;
      // Not connected: the chip fills the box and nothing sends (the card is the next step).
      chip.onclick = () => {
        track('chip_click', { i: EXAMPLE_PROMPTS.indexOf(text), model: Gen.available ? 'yes' : 'no' });
        input.value = text;
        if (Connect.connected) send(); else { Connect.keep(text); input.focus(); }
      };
      row.appendChild(chip);
    }
    log.appendChild(row);
  };

  // The whole log from the kernel's state, in order: the intro, then each
  // turn with the restore line and the notes that landed after it. The log
  // is rebuilt on every event, so where the person was reading is measured
  // first: at the end (within 8 px), or an empty log — a fresh boot, the
  // restore's first paint — it follows to the end; scrolled up, it stays
  // exactly where it was.
  const STICK_PX = 8;
  const atEnd = () => log.scrollHeight - log.scrollTop - log.clientHeight < STICK_PX;
  // The first paint runs before the chrome is in the document (build() paints
  // into a detached element), where the log is 0 px tall and "the end" is
  // 0 — a restored log used to open at its top. The observer fires once the
  // log has a size, and on every resize of the window: at the end, it stays
  // at the end.
  let stickOnResize = true;
  log.addEventListener('scroll', () => { stickOnResize = atEnd(); });
  const ro = new ResizeObserver(() => { if (stickOnResize) log.scrollTop = log.scrollHeight; });
  ro.observe(log);
  Windows.onDispose(win, () => ro.disconnect());
  const paint = () => {
    const stick = atEnd();
    const was = log.scrollTop;
    log.textContent = '';
    paintIntro();
    paintExamples();
    if (Chat.loadError) line(Chat.loadError, true);
    const notesAt = i => Chat.notes.filter(n => n.at === i).forEach(n => line(n.text, n.error));
    for (let i = 0; i <= Chat.turns.length; i++) {
      if (Chat.restored && i === Chat.restored) {
        line(`restored from ${ChatLog.PATH} · ${Chat.restored} turns`, false, 'chat-restore');
        if (Chat.note) paintReload(Chat.note);
      }
      notesAt(i);
      if (i < Chat.turns.length) paintTurn(Chat.turns[i], i);
    }
    if (!Chat.restored && Chat.note) paintReload(Chat.note);
    Chat.queue.forEach(paintQueued);
    // The agent's activity is kernel state like the turns: a repaint (the
    // intro following the bridge, a restore) draws it again, newest last.
    if (RemoteBridge.state === 'connected') for (const e of RemoteBridge.activity) paintActivity(e);
    log.scrollTop = stick ? log.scrollHeight : was;
  };
  const paintChips = () => {
    chips.innerHTML = '';
    chips.hidden = !Chat.pending.length;
    Chat.pending.forEach((img, i) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.title = `${img.name} ${img.width}×${img.height}`;
      c.innerHTML = '<img alt=""><button class="x" title="Remove">&times;</button>';
      c.querySelector('img').src = img.dataUrl;
      c.querySelector('.x').onclick = () => Chat.detach(i);
      chips.appendChild(c);
    });
  };
  const status = text => {
    const el = log.querySelector('#thinking');
    if (el) el.textContent = text; else paint();
  };

  // A paste with no file falls through, so text still lands in the input.
  body.addEventListener('paste', e => {
    const files = Attachments.filesOf(e);
    if (!files.length) return;
    e.preventDefault();
    Chat.attach(files).then(() => input.focus());
  });
  body.addEventListener('dragover', e => e.preventDefault());
  body.addEventListener('drop', e => { e.preventDefault(); Chat.attach(Attachments.filesOf(e)); });

  // The box is emptied only once the kernel has taken the text. Chat.send
  // answers with { started } (this text is the turn), { queued } (a turn was
  // running and it waits for its next step) or null — refused, the line above
  // says why, and the typed message stays exactly where it was.
  const send = () => {
    const text = input.value;
    if (!text.trim() && !Chat.pending.length) return;
    if (Chat.send(text)) input.value = '';
    else input.focus();   // refused: the text is still there, put the cursor back in it
  };
  body.querySelector('#send').onclick = send;
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    send();
  });

  const placeholder = input.placeholder;
  // While a turn runs the box still takes a message — it reaches the model at
  // the turn's next step — and says so. Send stays enabled: nothing about the
  // composer changes but this line.
  const STEERING = 'the agent is working: send anyway and it’ll pick this up at its next step';
  const hint = () => {
    if (!Chat.ready) return;
    if (RemoteBridge.state === 'connected' && !Gen.available) return agentMode();
    input.placeholder = (Chat.running || Chat.starting) ? STEERING : placeholder;
  };
  const enable = () => { input.disabled = false; hint(); };
  agentMode();
  if (!Chat.ready) { input.disabled = true; input.placeholder = 'loading chat…'; }
  else hint();   // a reload_ui mid-turn opens this window with the turn already running
  // The hosted page records the text of a browser's first prompt
  // (FirstPrompt, kernel/machine.js); this line says so until it is sent.
  const firstNote = body.querySelector('#firstNote');
  firstNote.textContent = 'We read first messages to learn what to build.';
  const paintFirstNote = () => { firstNote.hidden = !FirstPrompt.notice(); };
  paintFirstNote();
  // HexEvents decides the hosted gate once the page has loaded (the insights
  // script's own status), so a mirror that kept the tag drops the line then.
  if (document.readyState !== 'complete') {
    addEventListener('load', paintFirstNote, { once: true });
    Windows.onDispose(win, () => removeEventListener('load', paintFirstNote));
  }
  const off = Chat.on((type, data) => {
    if (type === 'first') return paintFirstNote();
    if (type === 'chips') return paintChips();
    if (type === 'status') return status(data.text);
    if (type === 'loaded') enable();
    hint();
    paint();
  });
  Windows.onDispose(win, off);
  Windows.onDispose(win, RemoteBridge.on(paint));

  /* The connect card (beads-tavc.16.11 S2): above the composer while nothing
     is connected, gone for good once something is. The words are
     Connect.COPY's (vibeos-writer's). Without hosted AI on this server (the
     mirror, the image) there is no free-credits button: the card opens on
     the other options. */
  const card = body.querySelector('#connectCard'), zero = body.querySelector('#zeroLine'), sendBtn = body.querySelector('#send');
  let optionsUndo = null;
  // Before any turn, not after a charged one (tavc.16.13): with no workspace
  // (a private window), the agent cannot change the OS here.
  const privateNote = body.querySelector('#privateNote');
  const paintConnect = () => {
    privateNote.hidden = Workspace.open;
    if (!Workspace.open) privateNote.textContent = "Private window: changes to the desktop itself won't stick here. Apps still open.";
    const on = !Connect.connected;
    sendBtn.textContent = on ? Connect.COPY.send : 'Send';
    if (!on) {
      if (optionsUndo) { optionsUndo(); optionsUndo = null; }
      card.hidden = true; card.textContent = '';
    } else if (card.hidden || !card.firstChild) {
      card.hidden = false;
      const hosted = Hosted.enabled;
      card.innerHTML = `<b class="connect-title"></b>
        ${hosted ? '<button type="button" class="btn p" id="connectFree"></button><p class="tiny dimmer connect-under" style="margin:0"></p>' : ''}
        <button type="button" class="btn sm" id="connectOther"></button>
        ${hosted ? '<p class="tiny dimmer connect-fine" style="margin:0"></p>' : ''}
        <p class="small connect-leaving" hidden style="margin:0"></p>
        <div class="connect-options-slot"></div>`;
      card.querySelector('.connect-title').textContent = Connect.COPY.title;
      card.querySelector('#connectOther').textContent = Connect.COPY.other;
      if (hosted) {
        card.querySelector('#connectFree').textContent = Connect.COPY.primary;
        card.querySelector('.connect-under').textContent = Connect.COPY.under;
        card.querySelector('.connect-fine').textContent = Connect.COPY.fine;
        card.querySelector('#connectFree').onclick = () => {
          const leaving = card.querySelector('.connect-leaving');
          leaving.textContent = Connect.COPY.leaving + (VM.state === 'ready' ? '' : ' ' + Connect.COPY.booting);
          leaving.hidden = false;
          card.querySelector('#connectFree').disabled = true;
          Connect.keep(input.value);
          setTimeout(() => Connect.signUp('card'), 600);
        };
      }
      card.querySelector('#connectOther').onclick = () => Connect.expand();
      if (!hosted || Connect.expanded) expandOptions();
    }
    const zeroOn = Hosted.active && Gen.provider === 'hosted' && !Hosted.pro && Hosted.credits <= 0 || Hosted.byoLocked;
    if (zeroOn && zero.hidden) {
      zero.innerHTML = '<span class="small"></span><button type="button" class="btn sm p" id="zeroSubscribe">Subscribe</button>';
      zero.firstChild.textContent = "You've used all your free credits. Pro adds 3,000 credits every month.";
      zero.querySelector('#zeroSubscribe').onclick = () => Paywall.open('zero_credits');
    }
    zero.hidden = !zeroOn;
  };
  const expandOptions = () => {
    const slot = card.querySelector('.connect-options-slot');
    if (!slot || slot.firstChild) return;
    optionsUndo = Connect.buildOptions(slot);
    const other = card.querySelector('#connectOther');
    if (other) other.hidden = true;
  };
  const pulse = () => {
    if (card.hidden) return;
    card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse');
    card.scrollIntoView({ block: 'nearest' });
  };
  // Confetti over this window for a new account (none under reduced motion).
  const confetti = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    const r = win.getBoundingClientRect();
    cv.width = r.width; cv.height = r.height;
    cv.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:7500`;
    document.body.appendChild(cv);
    const g = cv.getContext('2d'), colors = ['#ff5c8a', '#ffd23f', '#3ec1d3', '#7c5cff', '#4cd964'];
    const bits = Array.from({ length: 90 }, () => ({ x: Math.random() * r.width, y: -20 - Math.random() * r.height * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, s: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6 }));
    const t0 = performance.now();
    const frame = t => {
      g.clearRect(0, 0, cv.width, cv.height);
      for (const b of bits) { b.x += b.vx; b.y += b.vy; b.vy += 0.05; b.a += 0.1; g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.fillStyle = b.c; g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); g.restore(); }
      if (t - t0 < 1800) requestAnimationFrame(frame); else cv.remove();
    };
    requestAnimationFrame(frame);
  };
  Windows.onDispose(win, Connect.on(type => {
    if (type === 'expand') expandOptions();
    if (type === 'open') { paintConnect(); pulse(); }
    if (type === 'welcome' || type === 'welcome-back') {
      if (!input.value && Connect.held()) input.value = Connect.held();
      paintConnect();
      if (type === 'welcome') confetti();
    }
  }));
  Windows.onDispose(win, Gen.on(paintConnect));
  Windows.onDispose(win, RemoteBridge.on(paintConnect));
  // Typed while nothing is connected: kept across the sign-up trip.
  input.addEventListener('input', () => { if (!Connect.connected) Connect.keep(input.value); });
  if (!input.value && Connect.held()) input.value = Connect.held();
  paintConnect();
  paint();
  paintChips();
  setTimeout(() => input.focus(), 50);
}
