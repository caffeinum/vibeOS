// e2e for beads-tavc.3.10: analytics never gets error text, only fixed codes.
// Plants a key echo, a token, prompt text and terminal output in every failure that
// used to carry free text, then reads BOTH sinks: window.va (Vercel) and /api/events
// (Hexclave). The person still sees the full error. Every planted value is made up.
//
// Run: needs Playwright (bundled Chromium), like vm-exec-boot.mjs. `node scripts/e2e/no-error-text.mjs`.
// VIBEOS_WEB=<dir> runs it against another tree (the negative control: main's web/).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const WEB = process.env.VIBEOS_WEB || fileURLToPath(new URL("../../web", import.meta.url));
const PORT = Number(process.env.PORT || 5432);
const BASE = `http://127.0.0.1:${PORT}`;
const PLANTED = /planted|abcd\*|wxyz|eyJwbGFu/;
const ECHO_WHOLE = "Incorrect API key provided: planted-pw1. You can find your API key at https://platform.openai.com/account/api-keys.";
const ECHO_MASKED = "Incorrect API key provided: abcd****wxyz. You can find your API key at https://platform.openai.com/account/api-keys.";
let fails = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(detail).slice(0, 330)}`); if (!ok) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const reply = (status, body) => ({ status, contentType: typeof body === "string" ? "text/plain" : "application/json", body: typeof body === "string" ? body : JSON.stringify(body) });

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: WEB, stdio: "ignore" });
for (let i = 0; i < 100; i++) {
  try { await fetch(BASE); break; } catch { if (i === 99) throw new Error(`no server on ${PORT}`); await new Promise((r) => setTimeout(r, 100)); }
}
const browser = await chromium.launch();

async function step(name, provider, event, fn) {
  console.log(`\n— ${name}`);
  const ctx = await browser.newContext();
  try {
    await ctx.addInitScript(() => {
      window.__ev = [];
      window.va = (_, e) => window.__ev.push({ name: e.name, data: e.data || {} });
      localStorage.setItem("vibeos-key", "sk-test-no-error-text-000000000000");
    });
    const posted = [];
    await ctx.route("**/*", (route) => {
      const req = route.request(), url = new URL(req.url());
      if (url.hostname === "api.openai.com") return route.fulfill(provider || reply(500, {}));
      if (url.origin !== BASE || url.pathname.endsWith("/v86/libv86.js")) return route.abort();
      if (url.pathname === "/_vercel/insights/script.js") return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
      if (url.pathname === "/api/events") { posted.push(JSON.parse(req.postData())); return route.fulfill(reply(200, { recorded: true })); }
      if (url.pathname === "/api/agent/prompt") return route.fulfill(reply(200, { prompt: "test prompt" }));
      if (url.pathname.startsWith("/api/")) return route.fulfill(reply(404, ""));
      return route.continue();
    });
    await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await page.waitForFunction(() => typeof __vibeosOpenChat === "function" && typeof VM !== "undefined" && VM.state === "unavailable", null, { timeout: 60000 });
    await fn(page);
    await page.waitForFunction((n) => window.__ev.some((e) => e.name === n), event, { timeout: 30000 });
    await page.waitForTimeout(600);
    const va = await page.evaluate(() => window.__ev);
    const of = (list) => list.filter((e) => e.name === event).map((e) => e.data);
    check("window.va carries nothing planted", !PLANTED.test(JSON.stringify(va)), of(va));
    check("/api/events got the event", of(posted).length > 0, posted.map((e) => e.name));
    check("/api/events carries nothing planted", !PLANTED.test(JSON.stringify(posted)), of(posted));
    return { data: of(va)[0] };
  } catch (e) {
    check("the step ran to its end", false, e.message.split("\n")[0]);
    return null;
  } finally { await ctx.close(); }
}

const turn = async (page, shown) => {
  await page.evaluate(() => __vibeosOpenChat());
  await page.waitForSelector("#msg");
  await page.evaluate(() => { Chat.send("make me a clock"); });
  await page.waitForSelector("#failure", { timeout: 30000 });
  check("the person still sees the full error", (await page.textContent("#failure")).includes(shown), await page.textContent("#failure"));
};

try {
  for (const [name, status, body, shown, want] of [
    ["gen_failed: a typed value echoed whole", 401, { error: { message: ECHO_WHOLE, code: "invalid_api_key" } }, "planted-pw1", { bucket: "auth", provider: "openai", status: "401", code: "invalid_api_key" }],
    ["gen_failed: a masked key echo", 401, { error: { message: ECHO_MASKED, code: "invalid_api_key" } }, "abcd****wxyz", { bucket: "auth", provider: "openai", status: "401", code: "invalid_api_key" }],
    ["gen_failed: a token in a text body", 500, "eyJwbGFudGVkIjoxfQ.planted.sig", "eyJwbGFu", null],
    ["gen_failed: prompt text, and in the provider's code", 400, { error: { message: "planted prompt text about my family", code: "planted_code" } }, "planted prompt text", { bucket: "other", provider: "openai", status: "400", code: "other" }],
  ]) {
    const r = await step(name, reply(status, body), "gen_failed", (page) => turn(page, shown));
    if (r && want) check("bucket, provider, status and a listed code, nothing else", same(r.data, want), r.data);
    if (r && !want) check("no error key", !("error" in r.data) && typeof r.data.bucket === "string", r.data);
  }

  let r = await step("portal_failed: the images API echoes the key", reply(401, { error: { message: ECHO_WHOLE } }), "portal_failed", async (page) => {
    await page.evaluate(() => { UI.live().openPortal("cats"); });
    await page.waitForFunction(() => document.body.textContent.includes("planted-pw1"), null, { timeout: 30000 });
  });
  if (r) check("portal_failed is a code and a status", same(r.data, { code: "auth", status: "401" }), r.data);

  for (const [planted, code] of [
    ['the restored machine did not answer on the serial line: "planted terminal output"', "no-answer"],
    ["the snapshot did not restore within 120s", "timeout"],
    ["exec timed out: cat planted-file", "exec-timeout"],
    ["planted something unknown", "other"],
  ]) {
    r = await step(`vm_restore_failed: ${code}`, null, "vm_restore_failed", (page) => page.evaluate((message) => {
      window.loadScriptOnce = async () => {};
      VM.available = async () => true;
      VM.watchRelay = () => {};
      VM.discard = async () => {};
      VM.restore = async () => { throw new Error(message); };
      VM.construct = () => { throw new Error("stop before a cold boot"); };
      Snapshots.current = async () => ({ where: "test" });
      Snapshots.stat = async () => ({ bytes: 1, savedAt: 1 });
      Snapshots.forget = async () => {};
      VM.set("off");
      void VM.boot("busybox");
    }, planted));
    if (r) check("vm_restore_failed is image and code", same(r.data, { image: "busybox", code }), r.data);
  }

  r = await step("vm_snapshot: a caller's own words as the reason", null, "vm_snapshot", (page) => page.evaluate(async () => {
    VM.ready = () => true;
    VM.bootedImage = "busybox";
    VM.emu = { save_state: async () => new ArrayBuffer(8) };
    VM.snapshotStore = async () => ({});
    Snapshots.write = async () => ({ bytes: 8 });
    await VM.snapshot("planted note to self");
  }));
  if (r) check("vm_snapshot reason is listed or other", r.data.reason === "other", r.data);

  r = await step("browser_open: typed text that is no URL", null, "browser_open", async (page) => {
    await page.evaluate(() => { openWindow(Object.assign({}, UI.live().SHELL.browser)); });
    const box = page.locator('.win[data-app="browser"] input').first();
    await box.fill("https://planted words typed here");
    await box.press("Enter");
  });
  if (r) check("browser_open host is invalid", r.data.host === "invalid", r.data);

  for (const [event, key] of [["gen_failed", "error"], ["portal_failed", "reason"], ["vm_restore_failed", "error"]]) {
    await step(`a forked caller still sending ${event}.${key}`, null, event, (page) => page.evaluate(([name, k]) => { track(name, { [k]: "planted text from an old fork" }); }, [event, key]));
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? `\n${fails} FAIL` : "\nALL PASS");
process.exit(fails ? 1 : 0);
