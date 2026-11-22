// e2e for beads-tavc.16.40: the wall's "Use my own key or agent" says what came of it.
//   opened     hosted_own_key_opened {code}, once per click, never on a repaint
//   failed     hosted_own_key_failed {at: open|codex|agent, reason}: a bucket, never text
//   connected  from: 'wall' on key_added (paste, codex, the pane's agent) and on mcp_paired reached from it
//
// The wall is prod's of 2026-11-22: signed in, 402 out-of-credits, buying closed. Nothing leaves the
// browser: /api, the relay's sockets and every other origin are answered here. No real account.
//
// Run: needs Playwright (bundled Chromium), like vm-exec-boot.mjs. `node scripts/e2e/own-key-pane.mjs`.
// VIBEOS_WEB=<dir> runs it against another tree (the negative control: main's web/).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const WEB = process.env.VIBEOS_WEB || fileURLToPath(new URL("../../web", import.meta.url));
const PORT = Number(process.env.PORT || 5431);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "someone@example.com";
const KEY = "sk-test-own-key-pane-0000000000000000";
let fails = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(detail).slice(0, 380)}`); if (!ok) fails++; };
const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

const HOSTED = {
  enabled: true, signedIn: true, purchases: false, pro: false, trial: null, byoLocked: false, paused: false, grantPaused: false, granted: false, firstTurn: false,
  models: [{ provider: "openai", id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol" }], defaultProvider: "openai",
  balance: { "credits-grant": 46, "credits-pro": 0, "credits-topup": 0, total: 46, spendable: 46 },
};
const REFUSAL = {
  "out-of-credits": json({ code: "out-of-credits", needed: 49, spendable: 46, grantPaused: false, timings: {}, error: "You're out of hosted AI credits for now: a step needs up to 49 credits of headroom and you have 46. You can keep going with your own key or agent." }, 402),
  paused: json({ code: "paused", timings: {}, error: "Hosted AI is paused for now. Your own key or agent keeps working." }, 503),
};

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: WEB, stdio: "ignore" });
for (let i = 0; i < 100; i++) {
  try { await fetch(BASE); break; } catch { if (i === 99) throw new Error(`no server on ${PORT}`); await new Promise((r) => setTimeout(r, 100)); }
}
const browser = await chromium.launch();

// A desktop stopped at the wall. opts: code, oauth (start | poll answers), relayDown.
async function wall(opts = {}) {
  const code = opts.code || "out-of-credits";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await ctx.addInitScript(() => {
    window.__ev = [];
    window.va = (_, e) => window.__ev.push({ name: e.name, data: e.data || {} });
  });
  await ctx.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE) return route.abort();
    if (url.pathname.endsWith("/v86/libv86.js")) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/hosted") return route.fulfill(json(HOSTED));
    if (url.pathname === "/api/hosted/generate") return route.fulfill(JSON.parse(route.request().postData() || "{}").release ? json({ released: true }) : REFUSAL[code]);
    if (url.pathname === "/api/agent/prompt") return route.fulfill(json({ prompt: "test prompt" }));
    if (url.pathname === "/api/billing") return route.fulfill(json({ usage: [] }));
    if (url.pathname === "/api/account/me") return route.fulfill(json({ signedIn: true, email: SECRET, displayName: "Test" }));
    if (url.pathname === "/api/openai/oauth/start") return route.fulfill(opts.oauth?.start || json({ id: "flow", code: "ABCD-EFGH", url: "https://auth.invalid/device" }));
    if (url.pathname === "/api/openai/oauth/poll") return route.fulfill(opts.oauth?.poll || json({ status: "complete", tokens: { accessToken: "at", refreshToken: "rt", accountId: "acct-private", expiresAt: Date.now() + 864e5 } }));
    return route.fulfill({ status: 404, body: "" });
  });
  const sockets = [];
  await ctx.routeWebSocket(/.*/, (ws) => {
    if (opts.relayDown) return void ws.close();
    sockets.push(ws);
    ws.onMessage((m) => { if (String(m).includes('"hello"')) ws.send(JSON.stringify({ paired: false })); });
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof Hosted !== "undefined" && Hosted.active && typeof __vibeosOpenChat === "function", null, { timeout: 60000 });
  await page.evaluate(() => __vibeosOpenChat());
  await page.waitForSelector("#msg");
  await page.evaluate(() => { Chat.send("make me a clock"); });
  await page.waitForSelector("#hostedOwnKey", { timeout: 30000 });

  const d = {
    page, errors,
    async dismissPaywall() { if (await page.locator("#paywallNotNow").count()) await page.click("#paywallNotNow"); },
    // The DOM's own click: the Settings window may lie over the wall in the next step.
    async clickOwn() { await d.dismissPaywall(); await page.evaluate(() => document.querySelector("#hostedOwnKey").click()); await page.waitForTimeout(150); },
    async modelPane() { await d.dismissPaywall(); await page.evaluate(() => openSettings("model")); await page.waitForSelector("#setkey"); },
    async options() { await page.evaluate(() => document.querySelector('.win[data-app="settings"] #setkey').click()); await page.waitForSelector("#modelOptions #keyInput"); },
    async paste() {
      await page.evaluate((key) => { document.querySelector("#modelOptions #keyInput").value = key; document.querySelector("#modelOptions #keySaveBtn").click(); }, KEY);
      await page.waitForTimeout(150);
    },
    async click(sel) { await page.evaluate((s) => document.querySelector(s).click(), sel); },
    async tab(id) { await d.click(`.win[data-app="settings"] #tabs button[data-id="${id}"]`); },
    async closeSettings() { await page.evaluate(() => Windows.close(document.querySelector('.win[data-app="settings"]'))); },
    async reloadUi() { await page.evaluate(() => UI.reload()); await page.waitForTimeout(150); },
    events: (name) => page.evaluate((n) => window.__ev.filter((e) => !n || e.name === n).map((e) => (n ? e.data : e)), name),
    async until(name) { try { await page.waitForFunction((n) => window.__ev.some((e) => e.name === n), name, { timeout: 25000 }); } catch { /* the check that follows reports it */ } return d.events(name); },
    async agentArrives() {
      try { await page.waitForFunction(() => RemoteBridge.state === "waiting", null, { timeout: 15000 }); } catch { /* reported by the check */ }
      const ws = sockets.at(-1);
      if (!ws) return;
      ws.send(JSON.stringify({ paired: true }));
      ws.send(JSON.stringify({ want: "tools", agent: "e2e-agent", sampling: false }));
    },
    close: () => ctx.close(),
  };
  return d;
}

async function step(name, opts, fn) {
  console.log(`\n— ${name}`);
  let d;
  try { d = await wall(opts); await fn(d); }
  catch (e) { check("the step ran to its end", false, e.message.split("\n")[0]); }
  finally { if (d) await d.close(); }
}

try {
  await step("prod's wall, buying closed", {}, async (d) => {
    await d.page.waitForSelector("#paywallSoon");
    check("the paywall says Pro opens soon", await d.page.isVisible("#paywallSoon"));
    check("Subscribe is not offered", !(await d.page.isVisible("#paywallSubscribe")) && !(await d.page.locator("#hostedPro").count()));
    check("nothing is counted before the click", (await d.events()).every((e) => !e.name.startsWith("hosted_own_key")));
    await d.clickOwn();
    check("the click is still tracked as it was", JSON.stringify(await d.events("hosted_own_key_click")) === JSON.stringify([{ code: "out-of-credits" }]), await d.events("hosted_own_key_click"));
    check("the Model pane is up", await d.page.isVisible('.win[data-app="settings"] #setkey'));
    check("opened, once, with the wall's code", JSON.stringify(await d.events("hosted_own_key_opened")) === JSON.stringify([{ code: "out-of-credits" }]), await d.events("hosted_own_key_opened"));
    await d.reloadUi();
    await d.tab("design"); await d.tab("model");
    check("a reload_ui and a tab switch are not opens", (await d.events("hosted_own_key_opened")).length === 1, await d.events("hosted_own_key_opened"));
    await d.clickOwn();
    check("a second click is a second open", (await d.events("hosted_own_key_opened")).length === 2, await d.events("hosted_own_key_opened"));
    check("a pane that opened is not a failure", (await d.events("hosted_own_key_failed")).length === 0);
    check("no page error", d.errors.length === 0, d.errors);
  });

  await step("the paused wall", { code: "paused" }, async (d) => {
    await d.clickOwn();
    check("opened {code: paused}", JSON.stringify(await d.events("hosted_own_key_opened")) === JSON.stringify([{ code: "paused" }]), await d.events());
  });

  await step("no layout change", {}, async (d) => {
    const pane = () => d.page.evaluate(() => document.querySelector('.win[data-app="settings"] #pane').innerHTML);
    await d.modelPane(); await d.page.waitForTimeout(300);
    const before = await pane();
    await d.clickOwn();
    check("the pane from the wall is the pane from anywhere", (await pane()) === before);
  });

  await step("door 1: a pasted key", {}, async (d) => {
    await d.clickOwn(); await d.options(); await d.paste();
    check("key_added {via: paste, from: wall}", JSON.stringify(await d.events("key_added")) === JSON.stringify([{ via: "paste", from: "wall" }]), await d.events("key_added"));
    check("the key is in no event", !JSON.stringify(await d.events()).includes(KEY));
    check("not a failure", (await d.events("hosted_own_key_failed")).length === 0);
  });

  await step("the origin survives reload_ui", {}, async (d) => {
    await d.clickOwn(); await d.reloadUi(); await d.options(); await d.paste();
    check("key_added from: wall", (await d.events("key_added"))[0]?.from === "wall", await d.events("key_added"));
  });

  await step("options already showing when the wall is clicked", {}, async (d) => {
    await d.modelPane(); await d.options(); await d.clickOwn(); await d.paste();
    check("key_added from: wall", (await d.events("key_added"))[0]?.from === "wall", await d.events("key_added"));
  });

  await step("Settings already on another tab", {}, async (d) => {
    await d.dismissPaywall();
    await d.page.evaluate(() => openSettings("design"));
    await d.clickOwn(); await d.options(); await d.paste();
    check("opened once", (await d.events("hosted_own_key_opened")).length === 1, await d.events());
    check("key_added from: wall", (await d.events("key_added"))[0]?.from === "wall", await d.events("key_added"));
  });

  await step("door 2: ChatGPT", {}, async (d) => {
    await d.clickOwn(); await d.options(); await d.click("#modelOptions #keyLoginBtn");
    const added = await d.until("key_added");
    check("login_openai_click from: wall", (await d.events("login_openai_click"))[0]?.from === "wall", await d.events("login_openai_click"));
    check("key_added {via: codex, from: wall}", JSON.stringify(added) === JSON.stringify([{ via: "codex", from: "wall" }]), added);
    check("no account id in an event", !JSON.stringify(await d.events()).includes("acct-private"));
  });

  for (const [reason, oauth] of [
    ["start", { start: json({ error: `no device flow for ${SECRET}` }, 500) }],
    ["poll", { poll: json({ error: `upstream broke for ${SECRET}` }, 500) }],
    ["denied", { poll: json({ status: "denied", error: `${SECRET} said no` }, 403) }],
  ]) {
    await step(`ChatGPT fails: ${reason}`, { oauth }, async (d) => {
      await d.clickOwn(); await d.options(); await d.click("#modelOptions #keyLoginBtn");
      const failed = await d.until("hosted_own_key_failed");
      check(`failed {at: codex, reason: ${reason}}, once`, JSON.stringify(failed) === JSON.stringify([{ at: "codex", reason }]), failed);
      check("the provider's words are in no event", !JSON.stringify(await d.events()).includes(SECRET));
      check("no key_added", (await d.events("key_added")).length === 0);
    });
  }

  await step("ChatGPT fails: timeout", {}, async (d) => {
    await d.page.evaluate(() => { VibeOSOAuth.pollOAuthUntilComplete = async () => { throw new Error("authorization timed out"); }; });
    await d.clickOwn(); await d.options(); await d.click("#modelOptions #keyLoginBtn");
    const failed = await d.until("hosted_own_key_failed");
    check("failed {at: codex, reason: timeout}", JSON.stringify(failed) === JSON.stringify([{ at: "codex", reason: "timeout" }]), failed);
  });

  await step("door 3: an agent, the pane open", {}, async (d) => {
    await d.clickOwn(); await d.options(); await d.click("#modelOptions #keyConnectBtn");
    await d.agentArrives();
    const paired = await d.until("mcp_paired");
    check("connect_agent_click from: wall", (await d.events("connect_agent_click"))[0]?.from === "wall", await d.events("connect_agent_click"));
    check("key_added {via: mcp, from: wall}", JSON.stringify(await d.events("key_added")) === JSON.stringify([{ via: "mcp", from: "wall" }]), await d.events("key_added"));
    check("mcp_paired keeps how and agent, gains from: wall", paired.length === 1 && paired[0].how === "pane" && paired[0].agent === "e2e-agent" && paired[0].from === "wall", paired);
  });

  await step("door 3: the pane closed before the agent arrived", {}, async (d) => {
    await d.clickOwn(); await d.options(); await d.click("#modelOptions #keyConnectBtn");
    await d.page.waitForTimeout(300);
    await d.closeSettings();
    await d.agentArrives();
    const paired = await d.until("mcp_paired");
    check("mcp_paired from: wall", paired[0]?.from === "wall", paired);
  });

  await step("an agent fails: pairing refused", {}, async (d) => {
    await d.page.evaluate(() => { window.__TAURI__ = {}; });
    await d.clickOwn(); await d.options(); await d.click("#modelOptions #keyConnectBtn");
    const failed = await d.until("hosted_own_key_failed");
    check("failed {at: agent, reason: pair}", JSON.stringify(failed) === JSON.stringify([{ at: "agent", reason: "pair" }]), failed);
  });

  await step("an agent fails: the relay", { relayDown: true }, async (d) => {
    await d.clickOwn(); await d.options(); await d.click("#modelOptions #keyConnectBtn");
    const failed = await d.until("hosted_own_key_failed");
    check("failed {at: agent, reason: relay}, once", JSON.stringify(failed) === JSON.stringify([{ at: "agent", reason: "relay" }]), failed);
  });

  await step("the pane throws", {}, async (d) => {
    await d.page.evaluate(() => { window.openSettings = () => { throw new Error("broken pane someone@example.com"); }; });
    await d.clickOwn();
    const failed = await d.events("hosted_own_key_failed");
    check("failed {at: open, reason: threw}", JSON.stringify(failed) === JSON.stringify([{ at: "open", reason: "threw" }]), failed);
    check("still thrown, not swallowed", d.errors.some((m) => m.includes("broken pane")), d.errors);
    check("not opened", (await d.events("hosted_own_key_opened")).length === 0);
    check("the error's words are in no event", !JSON.stringify(await d.events()).includes(SECRET));
  });

  await step("the pane paints nothing", {}, async (d) => {
    await d.page.evaluate(() => { window.openSettings = () => document.createElement("div"); });
    await d.clickOwn();
    const failed = await d.events("hosted_own_key_failed");
    check("failed {at: open, reason: not-painted}", JSON.stringify(failed) === JSON.stringify([{ at: "open", reason: "not-painted" }]), failed);
    check("not opened", (await d.events("hosted_own_key_opened")).length === 0);
  });

  console.log("\n== controls: not the wall, so never from: wall");
  await step("the Model pane from elsewhere", {}, async (d) => {
    await d.modelPane(); await d.options(); await d.paste();
    check("key_added from: card, as before", (await d.events("key_added"))[0]?.from === "card", await d.events("key_added"));
    check("no opened", (await d.events("hosted_own_key_opened")).length === 0);
  });

  await step("left the Model tab, came back", {}, async (d) => {
    await d.clickOwn(); await d.tab("design"); await d.tab("model"); await d.options(); await d.paste();
    check("key_added from: card", (await d.events("key_added"))[0]?.from === "card", await d.events("key_added"));
  });

  await step("switched tab from a pill, came back", {}, async (d) => {
    await d.clickOwn();
    await d.page.evaluate(() => { openSettings("design"); openSettings("model"); });
    await d.options(); await d.paste();
    check("key_added from: card", (await d.events("key_added"))[0]?.from === "card", await d.events("key_added"));
  });

  await step("closed Settings, opened it again", {}, async (d) => {
    await d.clickOwn(); await d.closeSettings(); await d.modelPane(); await d.options(); await d.paste();
    check("key_added from: card", (await d.events("key_added"))[0]?.from === "card", await d.events("key_added"));
  });

  await step("a failure outside the wall", { oauth: { start: json({ error: "no" }, 500) } }, async (d) => {
    await d.modelPane(); await d.options(); await d.click("#modelOptions #keyLoginBtn");
    await d.page.waitForSelector("#modelOptions #keyOAuthError:not([hidden])");
    check("no hosted_own_key_failed", (await d.events("hosted_own_key_failed")).length === 0);
  });

  await step("paired from Capabilities after a wall click", {}, async (d) => {
    await d.clickOwn();
    await d.page.evaluate(() => { openSettings("caps"); return RemoteBridge.pair(); });
    await d.agentArrives();
    const paired = await d.until("mcp_paired");
    check("mcp_paired has no from", paired.length === 1 && !("from" in paired[0]), paired);
  });

  await step("a wall pairing revoked, then paired from Capabilities", {}, async (d) => {
    await d.clickOwn(); await d.options(); await d.click("#modelOptions #keyConnectBtn");
    await d.page.waitForTimeout(300);
    await d.page.evaluate(async () => { RemoteBridge.revoke(); openSettings("caps"); await RemoteBridge.pair(); });
    await d.agentArrives();
    const paired = await d.until("mcp_paired");
    check("mcp_paired has no from", paired.length === 1 && !("from" in paired[0]), paired);
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? `\n${fails} FAIL` : "\nALL PASS");
process.exit(fails ? 1 : 0);
