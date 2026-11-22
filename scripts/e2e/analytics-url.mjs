// e2e for beads-tavc.3.16: what Vercel's insights script is told about the address.
// Runs the real script (downloaded, or INSIGHTS_SCRIPT=<file>) with its bot guard off.
// Every beacon is read and answered in the browser; nothing is reported anywhere.
//
// Run: needs Playwright (bundled Chromium), like vm-exec-boot.mjs. `node scripts/e2e/analytics-url.mjs`.
// VIBEOS_WEB=<dir> runs it against another tree (the negative control: main's web/).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WEB = process.env.VIBEOS_WEB || fileURLToPath(new URL("../../web", import.meta.url));
const PORT = Number(process.env.PORT || 5433);
const BASE = `http://127.0.0.1:${PORT}`;
const real = process.env.INSIGHTS_SCRIPT ? readFileSync(process.env.INSIGHTS_SCRIPT, "utf8") : await (await fetch("https://vibeos.sh/_vercel/insights/script.js")).text();
const script = real.replaceAll("navigator.webdriver", "false").replaceAll('navigator.userAgent.includes("Headless")', "false");
if (script === real) throw new Error("the script's bot guard was not found: this test would see nothing");
const FRAGMENT = "ab".repeat(32);
let fails = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(detail).slice(0, 300)}`); if (!ok) fails++; };

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: WEB, stdio: "ignore" });
for (let i = 0; i < 300; i++) {
  try { await fetch(BASE); break; } catch { if (i === 299) throw new Error(`no server on ${PORT}`); await new Promise((r) => setTimeout(r, 100)); }
}
const browser = await chromium.launch();

async function visit(suffix, act, referer) {
  const ctx = await browser.newContext();
  const beacons = [];
  await ctx.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE || url.pathname.endsWith("/v86/libv86.js")) return route.abort();
    if (url.pathname === "/_vercel/insights/script.js") return route.fulfill({ status: 200, contentType: "application/javascript", body: script });
    if (url.pathname.startsWith("/_vercel/insights/")) { beacons.push(JSON.parse(route.request().postData() || "{}")); return route.fulfill({ status: 200, body: "OK" }); }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 404, body: "" });
    return route.continue();
  });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html${suffix}`, { waitUntil: "load", ...(referer ? { referer } : {}) });
  await page.waitForFunction(() => typeof track === "function" && typeof UI !== "undefined", null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  if (act) await act(page);
  await page.waitForTimeout(1500);
  await ctx.close();
  return beacons;
}

try {
  console.log("— a fragment");
  let b = await visit(`#x=${FRAGMENT}&y=${encodeURIComponent("wss://planted.example/relay")}`);
  check("beacons are seen at all", b.some((x) => !x.en) && b.some((x) => x.en), b.map((x) => x.en || "pageview"));
  check("its value is in none", !JSON.stringify(b).includes(FRAGMENT));
  check("the fragment is in none", !/planted\.example|#/.test(JSON.stringify(b)));

  console.log("— query values");
  b = await visit("?a=PLANTEDA&b=PLANTEDB&c=PLANTEDC&d=%2Fplanted&utm_source=hn&ref=news");
  check("beacons are seen at all", b.length > 0);
  check("unlisted values are in none", !/planted/i.test(JSON.stringify(b)), b.map((x) => x.o));
  check("campaign tags are kept", b.length > 0 && b.every((x) => x.o === `${BASE}/index.html?utm_source=hn&ref=news`), b.map((x) => x.o));

  console.log("— an address that changes after load");
  b = await visit("", (page) => page.evaluate(() => {
    history.replaceState(null, "", "#x=" + "cd".repeat(32));
    track("chip_click", { i: 0 });
    history.pushState(null, "", "/later?a=PLANTEDLATE");
  }));
  check("the event and the navigation are seen", b.some((x) => x.en === "chip_click") && b.some((x) => !x.en && x.o.includes("/later")), b.map((x) => [x.en, x.o]));
  check("neither value is in any", !/PLANTEDLATE|cdcdcdcd/.test(JSON.stringify(b)), b.map((x) => x.o));

  console.log("— a campaign key is no way through");
  b = await visit(`?ref=${"e".repeat(90)}&utm_source=${encodeURIComponent("someone@example.com")}&utm_id=PLANTEDID`);
  check("beacons are seen at all", b.length > 0);
  check("a long value, an email and an unlisted tag are in none", !/eeeeeeee|example\.com|PLANTEDID/.test(JSON.stringify(b)), b.map((x) => x.o));

  console.log("— the referrer");
  b = await visit("", null, "https://elsewhere.example/plantedpath?a=PLANTEDREF");
  check("the referrer is reported", b.some((x) => x.r), b.map((x) => x.r));
  check("as an origin and nothing more", b.filter((x) => x.r).every((x) => x.r === "https://elsewhere.example/"), b.map((x) => x.r));

  console.log("— the hook cannot read the address");
  b = await visit("", (page) => page.evaluate(() => { window.URL = function () { throw new Error("broken"); }; track("chip_click", { i: 1 }); }));
  check("then it sends nothing", !b.some((x) => x.en === "chip_click"), b.map((x) => x.en));

  console.log("— plain");
  b = await visit("");
  check("the page is reported as before", b.some((x) => !x.en && x.o === `${BASE}/index.html`), b.map((x) => x.o));
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? `\n${fails} FAIL` : "\nALL PASS");
process.exit(fails ? 1 : 0);
