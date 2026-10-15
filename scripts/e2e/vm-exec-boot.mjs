// e2e for beads-tavc.2.17.1.2: vm_exec called while the machine is booting must
// WAIT for 'ready' and return the command's output, not refuse with "do not
// poll". Fails on the pre-fix kernel (which refuses the moment VM.state !== 'ready').
//
// It serves web/ statically and drives the REAL Agent.executeTool + VM.waitFor-
// Ready in a headless browser. Boot timing is controlled by VM.set('booting')
// then VM.set('ready') (the states a held-then-released libv86 boot produces),
// with VM.exec stubbed to a canned result — so the test is fast and
// deterministic and does not boot a real v86.
//
// Run: needs Playwright (bundled Chromium). `npm i -D playwright@1.62.1` here,
// or run from a tree that already has it. `node scripts/e2e/vm-exec-boot.mjs`.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("../../web", import.meta.url));
const PORT = Number(process.env.PORT || 4899);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); if (!ok) fails++; };

const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: WEB, stdio: "ignore" });
await sleep(1200);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof Agent !== "undefined" && typeof VM !== "undefined", null, { timeout: 30000 });

  const r = await page.evaluate(async () => {
    const origExec = VM.exec, origBoot = VM.boot;
    VM.boot = async () => {};                       // the auto-boot must not clobber our controlled state
    VM.exec = async () => "i686-canary";            // canned command output
    VM.set("booting");                              // the held-boot state
    let settled = null;
    const p = Agent.executeTool({ toolName: "vm_exec", input: { command: "uname -m" } }, null).then((x) => { settled = x; return x; });
    await new Promise((r) => setTimeout(r, 1800));   // let the handler wait a beat (real boots are 60-90s)
    const settledDuringBoot = settled !== null;      // new code waits (false); the pre-fix kernel refuses now (true)
    const refusedDuringBoot = settledDuringBoot && settled.ok === false && /do not poll|is booting/i.test(settled.error || "");
    VM.set("ready");                                // boot finishes (libv86 HEAD released)
    const final = await p;
    VM.exec = origExec; VM.boot = origBoot;
    return { settledDuringBoot, refusedDuringBoot, final };
  });

  console.log("result:", JSON.stringify(r));
  check("vm_exec did NOT refuse during boot (it waited)", r.settledDuringBoot === false, r.refusedDuringBoot ? "refused immediately: " + (r.final?.error || "") : "settled early");
  check("vm_exec returned the command output after boot", r.final?.ok === true && r.final?.output === "i686-canary", JSON.stringify(r.final));
  check("vm_exec reports that it waited for the machine", /waited \d+s/.test(r.final?.note || ""), r.final?.note || "(no note)");
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
