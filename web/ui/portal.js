/* ui/portal.js — Continuum-style portals: generated stills you can step through.
   A ui module (see ui/windows.js). Images come from Gen.askImage (a pasted
   OpenAI key, or a ChatGPT login through /api/openai/images); click-to-explore
   uses Gen.ask for the next-scene prompt, then another image. An image takes
   a minute or two either way, so the status counts the seconds. */

const costHint = () => Gen.imageCostHint();
const RESIZE_MS = 800;

export function portalTopicFromContext() {
  const sel = String(window.getSelection?.()?.toString() || '').replace(/\s+/g, ' ').trim();
  if (sel.length >= 2 && sel.length <= 200) return sel;
  const win = document.activeElement?.closest?.('.win') || document.querySelector('.win:not(.min)');
  if (win) {
    const t = win.querySelector('.title');
    if (t?.textContent) return t.textContent.trim().slice(0, 200);
  }
  return '';
}

export function openPortalPrompt(seed = '') {
  const topic = portalTopicFromContext() || seed;
  const overlay = document.createElement('div');
  overlay.className = 'portal-prompt-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const card = document.createElement('div');
  card.className = 'portal-prompt';
  const h = document.createElement('h2');
  h.textContent = 'Open portal';
  const p = document.createElement('p');
  p.className = 'small dimmer';
  p.textContent = 'A soft-edged window of generated art about a topic. Each image takes a minute or two and ' + (Gen.forImageGen ? costHint() : 'needs a ChatGPT sign-in or an OpenAI API key') + '.';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'What should this portal explore?';
  input.value = topic;
  input.spellcheck = true;
  const row = document.createElement('div');
  row.className = 'row';
  row.style.gap = '8px';
  row.style.marginTop = '10px';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = 'Cancel';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn p';
  go.textContent = 'Open';
  row.append(cancel, go);
  card.append(h, p, input, row);
  overlay.append(card);
  document.body.append(overlay);
  const close = () => overlay.remove();
  cancel.onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  const submit = () => {
    const t = input.value.trim();
    if (!t) { input.focus(); return; }
    close();
    openPortal(t, 'prompt');
  };
  go.onclick = submit;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(); });
  input.focus();
  input.select();
}

export function openPortal(topic, via = 'open') {
  const t = String(topic || '').trim();
  if (!t) return openPortalPrompt();
  const ui = UI.live();
  const spec = ui.SHELL.portal;
  const open = ui.openWindowFor('portal');
  if (open?.rec) {
    open.rec.state.pendingTopic = t;
    open.classList.remove('min');
    Windows.raise(open);
    open.rec.state.onTopic?.(t);
    return open;
  }
  try { track('portal_open', { via }); } catch {}
  return ui.focusOrOpen(Object.assign({}, spec, { opts: { topic: t } }));
}

export function startPortalMenu() {
  const desktop = document.getElementById('desktop');
  if (!desktop || desktop.dataset.portalMenu) return () => {};
  desktop.dataset.portalMenu = '1';
  const onCtx = e => {
    if (!e.target.closest('#desktop') && !e.target.closest('.win .body')) return;
    if (e.target.closest('#dock, #menubar, .key-modal-overlay, #recoveryBar')) return;
    const topic = portalTopicFromContext();
    if (!topic) return;
    e.preventDefault();
    const menu = document.createElement('div');
    menu.className = 'portal-ctx';
    menu.style.left = Math.min(e.clientX, innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, innerHeight - 48) + 'px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Open portal on selection';
    btn.onclick = () => {
      menu.remove();
      openPortal(topic, 'context');
    };
    menu.append(btn);
    document.body.append(menu);
    const off = () => { menu.remove(); document.removeEventListener('pointerdown', off, true); };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  };
  desktop.addEventListener('contextmenu', onCtx);
  return () => desktop.removeEventListener('contextmenu', onCtx);
}

function themeHint() {
  const id = Theme.id || document.documentElement.getAttribute('data-theme') || 'default';
  return 'vibeOS desktop theme "' + id + '" (match window chrome: Win95, Vista/winxp, or default)';
}

function buildImagePrompt(topic, kind) {
  const hint = themeHint();
  if (kind === 'resize') {
    return 'Regenerate this portal scene about "' + topic + '" for a new window shape. Style hint: ' + hint + '. Soft cinematic lighting, no text or UI chrome, immersive environment.';
  }
  return 'A dreamlike portal view about: ' + topic + '. Style hint: ' + hint + '. Soft edges, rich color, no text, no logos, no window frames — only the scene.';
}

export function PortalApp(body, el, opts = {}) {
  body.style.padding = '0';
  body.classList.add('portal-shell');
  const st = el.rec.state;
  st.topic = opts.topic || st.topic || 'the vibeOS desktop';
  st.history = st.history || [];
  st.index = st.index ?? -1;
  st.busy = false;
  st.resizeTimer = null;
  st.tick = null;

  body.innerHTML = '';
  const toolbar = document.createElement('div');
  toolbar.className = 'portal-toolbar';
  const topicInput = document.createElement('input');
  topicInput.type = 'text';
  topicInput.className = 'portal-topic';
  topicInput.value = st.topic;
  topicInput.spellcheck = true;
  const hint = document.createElement('span');
  hint.className = 'tiny dimmer portal-cost';
  hint.textContent = Gen.forImageGen ? costHint() : '';
  const nav = document.createElement('div');
  nav.className = 'row portal-nav';
  nav.style.gap = '6px';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn sm';
  back.textContent = '←';
  back.title = 'Back';
  const fwd = document.createElement('button');
  fwd.type = 'button';
  fwd.className = 'btn sm';
  fwd.textContent = '→';
  fwd.title = 'Forward';
  const regen = document.createElement('button');
  regen.type = 'button';
  regen.className = 'btn sm p';
  regen.textContent = 'Redraw';
  nav.append(back, fwd, regen);
  toolbar.append(topicInput, hint, nav);

  const frame = document.createElement('div');
  frame.className = 'portal-frame';
  const img = document.createElement('img');
  img.className = 'portal-img';
  img.alt = '';
  const veil = document.createElement('div');
  veil.className = 'portal-veil';
  veil.hidden = true;
  const status = document.createElement('div');
  status.className = 'portal-status tiny';
  frame.append(img, veil, status);
  body.append(toolbar, frame);

  const drawer = document.createElement('details');
  drawer.className = 'portal-drawer tiny';
  const sum = document.createElement('summary');
  sum.textContent = 'Recent portals';
  const list = document.createElement('ul');
  list.className = 'portal-recent';
  drawer.append(sum, list);
  body.append(drawer);
  paintRecent(list);

  const setStatus = (text, err) => {
    status.textContent = text || '';
    status.style.color = err ? 'var(--no)' : '';
  };
  const setBusy = on => {
    st.busy = on;
    veil.hidden = !on;
    regen.disabled = back.disabled = fwd.disabled = on;
    topicInput.disabled = on;
  };
  const showImage = dataUrl => {
    img.src = dataUrl;
    img.hidden = false;
  };
  const pushHistory = entry => {
    st.history = st.history.slice(0, st.index + 1);
    st.history.push(entry);
    st.index = st.history.length - 1;
    showImage(entry.dataUrl);
    back.disabled = st.index <= 0;
    fwd.disabled = true;
  };

  // Elapsed seconds against what to expect: a minute-long wait behind a
  // spinner reads as hung.
  const startProgress = label => {
    const t0 = Date.now();
    const paint = () => setStatus(label + ' ' + Math.round((Date.now() - t0) / 1000) + ' s · ' + Gen.IMAGE_ETA);
    clearInterval(st.tick);
    paint();
    st.tick = setInterval(paint, 1000);
  };
  const stopProgress = () => { clearInterval(st.tick); st.tick = null; };
  Windows.onDispose(el, stopProgress);

  async function generateImage({ prompt, size, inputImage, reason }) {
    if (st.busy) return;
    if (!Gen.forImageGen) {
      setStatus(Gen.imageRefusal(), true);
      try { track('portal_failed', { reason: 'no_key' }); } catch {}
      return;
    }
    hint.textContent = costHint();
    setBusy(true);
    startProgress(reason === 'resize' ? 'Redrawing for the new size…' : 'Generating…');
    try {
      const out = await Gen.askImage({ prompt, size, inputImage, width: frame.clientWidth, height: frame.clientHeight });
      stopProgress();
      try { track('portal_generate', { reason: reason || 'open', size: out.size || size, ok: true }); } catch {}
      // `asked` is what a resize compares: the codex backend answers its own size.
      pushHistory({ dataUrl: out.dataUrl, topic: st.topic, prompt, size: out.size || size, asked: out.asked || size });
      const used = Number.isFinite(out.allowanceUsedPercent) ? ' · ' + out.allowanceUsedPercent + '% of today’s image allowance used' : '';
      setStatus('Tap the image to explore' + used);
      rememberTopic(st.topic);
      paintRecent(list);
    } catch (e) {
      stopProgress();
      const msg = e.message || String(e);
      setStatus(msg, true);
      try { track('portal_failed', { reason: msg.slice(0, 80) }); } catch {}
      try { track('portal_generate', { reason: reason || 'open', ok: false }); } catch {}
    } finally {
      stopProgress();
      setBusy(false);
    }
  }

  async function initialDraw() {
    const size = Gen.closestImageSize(frame.clientWidth, frame.clientHeight);
    await generateImage({ prompt: buildImagePrompt(st.topic, 'open'), size, reason: 'open' });
  }

  regen.onclick = () => {
    const size = Gen.closestImageSize(frame.clientWidth, frame.clientHeight);
    generateImage({ prompt: buildImagePrompt(st.topic, 'resize'), size, inputImage: img.src || null, reason: 'manual' });
  };

  back.onclick = () => {
    if (st.index <= 0) return;
    st.index--;
    showImage(st.history[st.index].dataUrl);
    back.disabled = st.index <= 0;
    fwd.disabled = false;
  };
  fwd.onclick = () => {
    if (st.index >= st.history.length - 1) return;
    st.index++;
    showImage(st.history[st.index].dataUrl);
    fwd.disabled = st.index >= st.history.length - 1;
    back.disabled = false;
  };

  topicInput.addEventListener('change', () => {
    const t = topicInput.value.trim();
    if (t && t !== st.topic) {
      st.topic = t;
      initialDraw();
    }
  });

  const onResize = () => {
    clearTimeout(st.resizeTimer);
    st.resizeTimer = setTimeout(() => {
      if (!img.src || st.busy) return;
      const size = Gen.closestImageSize(frame.clientWidth, frame.clientHeight);
      const cur = st.history[st.index];
      if ((cur?.asked || cur?.size) === size) return;
      generateImage({
        prompt: buildImagePrompt(st.topic, 'resize'),
        size,
        inputImage: img.src,
        reason: 'resize',
      });
    }, RESIZE_MS);
  };

  const ro = new ResizeObserver(onResize);
  ro.observe(frame);
  Windows.onDispose(el, () => ro.disconnect());

  img.addEventListener('click', async ev => {
    if (st.busy || !img.src) return;
    const rect = img.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / rect.width).toFixed(3);
    const ny = ((ev.clientY - rect.top) / rect.height).toFixed(3);
    if (!Gen.forApps && !Gen.viaAgent) {
      setStatus(Gen.available ? Gen.imageRefusal() : 'Connect a model in Settings to explore by click.', true);
      return;
    }
    setStatus('Imagining what is at (' + nx + ', ' + ny + ')…');
    try {
      const scenePrompt = await Gen.ask({
        prompt: 'Topic: "' + st.topic + '". The viewer clicked at normalized coordinates x=' + nx + ', y=' + ny + ' on the current portal image. Write ONE short image-generation prompt (max 40 words) for the next scene — what they are zooming into or discovering. Reply with only the prompt, no quotes.',
        images: [img.src],
        maxTokens: 120,
      });
      const size = Gen.closestImageSize(frame.clientWidth, frame.clientHeight);
      await generateImage({ prompt: String(scenePrompt).trim(), size, inputImage: img.src, reason: 'click' });
    } catch (e) {
      setStatus(e.message || String(e), true);
      try { track('portal_failed', { reason: 'click' }); } catch {}
    }
  });

  st.onTopic = t => {
    st.topic = t;
    topicInput.value = t;
    initialDraw();
  };

  if (st.pendingTopic) {
    st.topic = st.pendingTopic;
    topicInput.value = st.topic;
    delete st.pendingTopic;
  }

  requestAnimationFrame(() => initialDraw());
}

function rememberTopic(topic) {
  try {
    const key = 'vibeos-portal-recent';
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    const next = [topic, ...prev.filter(t => t !== topic)].slice(0, 6);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

function paintRecent(ul) {
  ul.textContent = '';
  let items = [];
  try { items = JSON.parse(localStorage.getItem('vibeos-portal-recent') || '[]'); } catch {}
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'dimmer';
    li.textContent = 'None yet';
    ul.append(li);
    return;
  }
  for (const t of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'linkish';
    b.textContent = t;
    b.onclick = () => openPortal(t);
    li.append(b);
    ul.append(li);
  }
}
