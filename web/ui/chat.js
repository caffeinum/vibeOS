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
// comes from Chat.turns, Chat.running, Chat.notes and Chat.offer, so a
// reload_ui — or a close and reopen — paints the same conversation back,
// turn in flight included. Every model, tool or guest string lands through
// textContent or renderMd: a refused title, a card, a reply are never markup.
export function ChatApp(body, win) {
  body.style.padding = '0';
  body.innerHTML = `
    <div id="log" style="padding:12px;display:flex;flex-direction:column;gap:10px"></div>
    <div style="position:sticky;bottom:0;border-top:1px solid var(--barline);background:var(--panel)">
      <div id="chips" class="row" hidden style="flex-wrap:wrap;gap:6px;padding:8px 10px 0"></div>
      <div class="row" style="gap:6px;padding:8px 10px">
        <input type="text" id="msg" placeholder="ask for a window, or a script for the VM — paste a screenshot too"
               style="flex:1;border:1px solid var(--line);border-radius:var(--radius-ctl);background:var(--panel2);padding:7px 10px;font-size:13px" />
        <button class="btn p sm" id="send">Send</button>
      </div>
    </div>`;
  const log = body.querySelector('#log'), input = body.querySelector('#msg'), chips = body.querySelector('#chips');

  const bubble = (who, html, before = null) => {
    const d = document.createElement('div');
    d.style.cssText = who === 'you'
      ? 'align-self:flex-end;max-width:85%;background:var(--sel);color:var(--seltext);border:1px solid var(--line2);border-radius:var(--radius-win) 10px 2px 10px;padding:8px 11px;font-size:13px'
      : 'align-self:flex-start;max-width:92%;background:var(--panel2);border:1px solid var(--line);border-radius:var(--radius-win) 10px 10px 2px;padding:8px 11px;font-size:13px';
    d.innerHTML = html;
    log.insertBefore(d, before);
    return d;
  };
  const line = (text, error = false) => {
    const d = bubble('vibeos', error ? '<span class="no"></span>' : '<span class="tiny dimmer"></span>');
    d.firstChild.textContent = text;
    return d;
  };

  // The old copy here told you to run server.py, which is the local python demo
  // and does not exist on vibeos.sh — it read as an error on the hosted build.
  // Offer the two things that actually work, as a button rather than a chore.
  const readyLine = () =>
    `Ask for anything. I build a <b>window</b> for the desktop, or a <b>script</b> that runs inside the VM — whichever fits.<br><span class="tiny dimmer" id="model"></span>`;
  // Three shapes: a model is connected; no model but an agent drives the
  // desktop through vibeos-mcp (then this box is optional, not missing); or
  // nothing yet. The agent's name is the MCP client's own string: textContent.
  let introEl = null;
  const paintIntro = () => {
    const agent = RemoteBridge.state === 'connected';
    const html = Gen.available ? readyLine()
      : agent ? `<b class="part yes"></b> is connected through vibeos-mcp and drives this desktop — talk to it in its own window.<br>
         <span class="tiny dimmer">This box can run a second model beside it.</span> <span class="row" style="margin-top:8px"><button class="btn sm" id="chatConnect">Connect a model here too</button></span>`
      : `<b class="part">No model connected yet.</b> Prompts fall back to stock modules until one is.<br>
         <span class="row" style="margin-top:8px"><button class="btn p sm" id="chatConnect">Connect a model</button></span>`;
    if (introEl && introEl.isConnected) { introEl.innerHTML = html; }
    else introEl = bubble('vibeos', html);
    // The id is whatever the pane stored: text, like every model string.
    const model = introEl.querySelector('#model');
    if (model) model.textContent = Gen.model;
    if (agent && !Gen.available) introEl.querySelector('b').textContent = RemoteBridge.detail || 'your agent';
    const connectBtn = introEl.querySelector('#chatConnect');
    if (connectBtn) connectBtn.onclick = async () => { await Gen.askForKey(); paintIntro(); };
  };
  // The intro follows the bridge: the onboarding modal closes itself when an
  // agent connects, and the chat behind it must not keep saying "no model".
  Windows.onDispose(win, RemoteBridge.on(() => { if (introEl) paintIntro(); agentMode(); }));

  // With an agent connected and no model here, this window is the activity
  // view: every tool call the agent makes lands as a card, and the input says
  // where to talk. MCP is agent→tools; nothing typed here can reach the agent.
  const paintActivity = (e) => {
    const d = document.createElement('div');
    d.className = 'agent-act';
    d.style.cssText = 'align-self:flex-start;max-width:92%;padding:6px 10px;font-size:12px;border-left:2px solid var(--line2);opacity:.9';
    const tool = document.createElement('b'); tool.textContent = e.tool;
    const what = document.createElement('span'); what.textContent = e.what ? ' ' + e.what : '';
    const st = document.createElement('span'); st.className = 'tiny ' + (e.ok === false ? 'no' : 'dimmer');
    st.textContent = e.ok === false ? ' — refused: ' + e.error : ` — ${e.ms} ms`;
    d.append(tool, what, st); log.appendChild(d); body.scrollTop = body.scrollHeight;
  };
  let agentOnly = false;
  const agentMode = () => {
    const on = RemoteBridge.state === 'connected' && !Gen.available;
    if (on === agentOnly) return;
    agentOnly = on;
    if (on) { input.disabled = true; input.placeholder = `${RemoteBridge.detail || 'your agent'} drives this desktop — talk to it in its own window`; }
    else if (Chat.ready) { input.disabled = false; input.placeholder = placeholder; }
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
    const b = bubble('vibeos', `<b></b> <span class="req">${c.kind === 'vm' ? 'vm script' : 'window'}</span><br>
      <span class="tiny dimmer"></span>
      <div class="row" style="margin-top:8px"><button class="btn sm" id="act"></button>${c.src ? '<button class="btn sm" id="src">Source</button>' : ''}</div>
      <pre class="out" id="res" style="display:none;margin-top:8px"></pre>`, before);
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
        if (c.src) return launchApp({ title: c.title, source: c.src, requires: parseRequires(c.src) });
        const app = (await Apps.list()).apps.find(a => a.title === c.title);
        if (!app) return show('no app titled "' + c.title + '" in the workspace or the VM now');
        launchApp(app);
      };
    }
  };
  const paintOffer = () => {
    const b = bubble('vibeos', `
      <span class="part">That was a stock module — no model is configured yet.</span>
      <p class="tiny dimmer" style="margin:6px 0 8px">Add a key and I'll build this for real.</p>
      <button class="btn p sm" id="addKeyNow">Add a key</button>`);
    b.querySelector('#addKeyNow').onclick = () => Chat.retryWithKey();
    return b;
  };
  const paintTurn = t => {
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
    if (Chat.offer && Chat.offer.reply === t) paintOffer();
    else if (t.failure === 'no model configured') line('that was a stock module — no model was configured');
    // The message may carry a slice of a proxy's HTML error page (a
    // Cloudflare 502, an interstitial) — text, never markup.
    else if (t.failure) { const b = bubble('vibeos', '<span class="no"></span> — fell back to a stock module.'); b.querySelector('.no').textContent = t.failure; }
    else if (!t.text) line('the page was closed before this turn finished');
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
      chip.onclick = () => { input.value = text; send(); };
      row.appendChild(chip);
    }
    log.appendChild(row);
  };

  // The whole log from the kernel's state, in order: the intro, then each
  // turn with the restore line and the notes that landed after it.
  const paint = () => {
    log.textContent = '';
    paintIntro();
    paintExamples();
    if (Chat.loadError) line(Chat.loadError, true);
    const notesAt = i => Chat.notes.filter(n => n.at === i).forEach(n => line(n.text, n.error));
    for (let i = 0; i <= Chat.turns.length; i++) {
      if (Chat.restored && i === Chat.restored) {
        line(`restored from ${ChatLog.PATH} · ${Chat.restored} turns`);
        if (Chat.note) paintReload(Chat.note);
      }
      notesAt(i);
      if (i < Chat.turns.length) paintTurn(Chat.turns[i]);
    }
    if (!Chat.restored && Chat.note) paintReload(Chat.note);
    // The agent's activity is kernel state like the turns: a repaint (the
    // intro following the bridge, a restore) draws it again, newest last.
    if (RemoteBridge.state === 'connected') for (const e of RemoteBridge.activity) paintActivity(e);
    body.scrollTop = body.scrollHeight;
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

  const send = () => {
    const text = input.value;
    if (!text.trim() && !Chat.pending.length) return;
    input.value = '';
    Chat.send(text);
  };
  body.querySelector('#send').onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  const placeholder = input.placeholder;
  const enable = () => { if (agentOnly) return; input.disabled = false; input.placeholder = placeholder; };
  agentMode();
  if (!Chat.ready) { input.disabled = true; input.placeholder = 'loading chat…'; }
  const off = Chat.on((type, data) => {
    if (type === 'chips') return paintChips();
    if (type === 'status') return status(data.text);
    if (type === 'loaded') enable();
    paint();
    // A stock module opens in its own window, on top of this chat — so the
    // key offer can end up buried under the very thing it is offering to
    // improve. Raise the chat and scroll the offer into view.
    if (type === 'done' && Chat.offer && Chat.offer.reply === data.reply) {
      UI.live().raise(win);
      const offer = log.querySelector('#addKeyNow');
      if (offer) offer.scrollIntoView({ block: 'nearest' });
    }
  });
  Windows.onDispose(win, off);
  Windows.onDispose(win, RemoteBridge.on(paint));
  paint();
  paintChips();
  setTimeout(() => input.focus(), 50);
}
