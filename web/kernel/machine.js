/* vibeOS kernel — the machine. This file never hot-reloads.
 *
 * The OS is files under public/app, and the loader in index.html boots them
 * in order: os.css, then kernel/machine.js, kernel/net.js, kernel/workspace.js,
 * kernel/agent.js, kernel/boot.js as classic scripts, then the ui/*.js ES
 * modules through the registry in kernel/boot.js. Each file is the served
 * copy unless system/<same path> exists in the workspace, in which case yours
 * boots — and a copy that fails to boot is skipped on the next load. The
 * kernel is what an edit of the ui must never lose: the emulator, the relay
 * socket, the workspace handles, the chat log, an agent turn in flight.
 * Kernel edits apply on reload_os; ui edits apply on reload_ui.
 */

// Product events, so "46 people opened /app" can become "and this is what
// happened next". Deliberately coarse: no prompt text, no URLs, no key state.
function track(name, data) {
  try {
    const evt = { name };
    if (data) evt.data = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
    window.va && window.va('event', evt);
  } catch {}
}

/* ---------- capability providers ------------------------------------- */

// Chrome forbids file pickers inside a cross-origin iframe, which is exactly
// where a published artifact runs. So "can I store a workspace" and "can I
// reach the user's actual disk" are different questions, and the second one
// depends on how the page is embedded, not on the browser.
const inCrossOriginFrame = (() => {
  try { return window.self !== window.top && !window.top.location.origin; }
  catch { return true; }
})();
const canPickDirectory = ('showDirectoryPicker' in window) && !inCrossOriginFrame;
const canStoreWorkspace = canPickDirectory || !!(navigator.storage && navigator.storage.getDirectory);

// null, a string, NaN and 0 all used to run with whatever setTimeout made of
// them; a timeout that is not a number is a bug in the caller, so say so.
const checkTimeout = (timeoutMs) => {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive integer');
};

const BrowserProvider = {
  name: 'browser', label: 'Browser',
  supports: {
    files:    canStoreWorkspace,     // a workspace exists (disk or private store)
    disk:     canPickDirectory,      // it is genuinely THEIR folder
    write:    canStoreWorkspace,
    get shell() { return VM.state === 'ready'; },   // the VM's shell, not yours
    get tty() { return VM.ttyState === 'ready'; },  // a byte stream on the VM's second serial line
    process:  false,     // host processes; workers are a different thing
    get net() { return Net.available; },  // raw TCP through the relay (kernel/net.js): on whenever the relay is on, off with it
    usb:      'usb' in navigator,
    serial:   'serial' in navigator,
    hid:      'hid' in navigator,
    midi:     'requestMIDIAccess' in navigator,
    camera:   !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    clipboard:!!(navigator.clipboard && navigator.clipboard.readText),
    codegen:  true,
  },
  async list(dir) {
    const h = dir || Workspace.root;
    if (!h) throw new Error('No folder open.');
    const out = [];
    for await (const [name, handle] of h.entries()) out.push({ name, handle, dir: handle.kind === 'directory' });
    out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
    return out;
  },
  async read(handle) { return (await handle.getFile()).text(); },
  // Real, once the background Linux is up — but it is the VM's shell, on the
  // VM's disk. Never the user's machine. The capability table says so.
  async shell(cmd, timeoutMs = 600000) { checkTimeout(timeoutMs); return VM.exec(cmd, timeoutMs); },
  tty(holder) { return VM.tty(TTY_PORTS[0], holder); },
};

const NativeProvider = {
  name: 'native', label: 'Native binary',
  supports: { files:true, disk:true, write:true, shell:true, process:true, net:true, usb:true,
              serial:true, hid:true, midi:true, camera:true, clipboard:true, codegen:true, tty:false },
  base: 'http://127.0.0.1:4571',
  // Only when something says a helper is there: the helper's own page sets
  // localStorage vibeos-native, or the url carries ?native=1. A plain visit
  // used to dial 127.0.0.1:4571 on every load, and the browser logs that
  // ERR_CONNECTION_REFUSED itself — no try/catch reaches the console line.
  wanted() {
    try { if (localStorage.getItem('vibeos-native')) return true; } catch {}
    try { return new URLSearchParams(location.search).get('native') === '1'; } catch { return false; }
  },
  async probe() {
    if (!this.wanted()) return false;
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 400);
    try { return (await fetch(this.base + '/health', { signal: c.signal })).ok; }
    catch { return false; } finally { clearTimeout(t); }
  },
  async list(path='~') { return (await (await fetch(`${this.base}/fs?path=${encodeURIComponent(path)}`)).json()); },
  async shell(cmd, timeoutMs = 600000) {
    checkTimeout(timeoutMs);
    const r = await fetch(this.base + '/exec', { method:'POST',
      headers: {'content-type':'application/json'}, body: JSON.stringify({ cmd, timeoutMs }) });
    return (await r.json()).stdout;
  },
};

let CAP = BrowserProvider;
// S_IFMT classes of a 9p inode mode, named so a filter reads as what it keeps.
const INODE_TYPES = { 0x8000: 'file', 0x4000: 'dir', 0xA000: 'symlink', 0x1000: 'fifo', 0xC000: 'socket', 0x2000: 'chardev', 0x6000: 'blockdev' };
function inodeType(mode) {
  const t = INODE_TYPES[mode & 0xF000];
  if (!t) throw new Error(`unknown 9p inode mode ${mode.toString(8)}`);
  return t;
}

// Served both at the root (local dev) and at /app (vibeos.sh, no trailing
// slash). Relative URLs resolve differently in those two cases, so derive the
// directory once rather than guessing.
// BASE is defined by the loader in index.html.
const V86_ASSETS = BASE + 'v86/';

// Three machines. Alpine is the default: a 256 MB ext4 disk cut into 128 KB
// zstd chunks (91 MB on the wire, fetched as the kernel touches them), apk
// works, and it reaches a shell in 20-30 s (measured, Chrome, host load ~20:
// 27 s from localhost, 21 s from CloudFront with the boot.txt prefetch)
// because its initramfs is ours (scripts/alpine/init) and OpenRC runs four
// services. BusyBox is bundled (7 MB ISO, 5-7 s, no package manager). Debian is
// the same streaming trick on a 1 GB disk with apt, and takes minutes. Built
// by scripts/alpine/build.sh and scripts/debian/build.sh.
const DEBIAN_BASE = 'https://d3je35hqch090t.cloudfront.net/debian-3/';
// A build in progress boots from public/alpine-dev/ (git-ignored; build.sh
// copies its output there) by pointing this at new URL('../alpine-dev/', location.href).href.
const ALPINE_BASE = 'https://d3je35hqch090t.cloudfront.net/alpine-2/';
const IMAGES = {
  alpine: {
    id: 'alpine', label: 'Alpine', blurb: 'streamed 91 MB disk, apk works, usually 20-30 s to a shell — longer on a busy machine',
    // The same budget as the bundled image: 20-40 s measured, and a laptop on
    // battery with the tab in the background is slower by more than 2x.
    memoryMB: 128, bootTimeoutMs: 120000,
    preflight: ALPINE_BASE + 'bzImage',
    warm: ALPINE_BASE + 'boot.txt',
    config: () => ({
      bzimage: { url: ALPINE_BASE + 'bzImage' },
      initrd:  { url: ALPINE_BASE + 'initrd' },
      // acpi on, and GPE 1 masked, both measured on Alpine's 6.6 linux-lts:
      // without v86's ACPI tables the kernel reads the MP table and panics in
      // setup_IO_APIC (NULL deref at 0.4s); with them, v86 answers the PCI
      // hotplug GPE with "every slot ejected" and the kernel removes the IDE
      // controller, the NIC and the 9p device one by one, so /dev/sda never
      // appears. acpi_mask_gpe=0x01 keeps the devices; noapic instead hangs
      // the IDE probe waiting for IRQ 14.
      cmdline: 'root=/dev/sda rw rootfstype=ext4 modules=ext4 console=ttyS0 acpi_mask_gpe=0x01 loglevel=3',
      acpi: true,
      hda: { url: ALPINE_BASE + 'chunk.img.zst', async: true, use_parts: true,
             fixed_chunk_size: 128 * 1024, size: 256 * 1024 * 1024 },
    }),
    dhcp: 'ifconfig eth0 up; udhcpc -i eth0 -n -q 2>&1 | tail -1',
    ip: "ifconfig eth0 | grep -o 'inet addr:[0-9.]*' | cut -d: -f2",
    // The same ne2k and the same BusyBox ifconfig as the bundled image: a
    // restored card receives nothing until the driver resets it (see boot).
    netReset: 'ifconfig eth0 down; ifconfig eth0 up',
    // Measured on alpine-2: /sys/class/net/lo/flags is 0x8 after boot (no UP),
    // and a connect to 127.0.0.1 hangs until curl's --max-time, so the
    // Browser's localhost never answered on the default image.
    tty: "setsid sh -c 'TERM=xterm exec sh </dev/ttyS1 >/dev/ttyS1 2>&1' & wait $!",
    loopback: 'ifconfig lo up',
    shellLine: 'Then a POSIX shell script for Alpine Linux 3.20 (BusyBox ash, musl). apk works (run apk update first; the network is on): apk add <pkg>. Installed: busybox sh grep sed awk find, curl wget ca-certificates, git nano less — the BusyBox versions, so no GNU-only flags (no find -printf, no ls --time-style, no sed -z; list a directory with ls -1p). No bash, no glibc — a glibc binary will not run without gcompat. The workspace is at /mnt. Print results to stdout.',
  },
  busybox: {
    id: 'busybox', label: 'BusyBox', blurb: 'tiny: bundled 7 MB ISO, boots in about 10 s, no package manager',
    memoryMB: 64, bootTimeoutMs: 120000,
    config: () => ({ cdrom: { url: V86_ASSETS + 'linux4.iso' } }),
    dhcp: 'udhcpc -i eth0 -n -q 2>&1 | tail -1',
    ip: "ifconfig eth0 | grep -o 'inet addr:[0-9.]*' | cut -d: -f2",
    netReset: 'ifconfig eth0 down; ifconfig eth0 up',
    // linux4.iso boots with lo DOWN (measured: `ifconfig lo` shows no UP flag
    // and a connect to 127.0.0.1 hangs until the timeout instead of being
    // refused), so nothing on localhost — a dev server, the Browser — works
    // until someone brings it up. Debian's systemd does this itself.
    // The second serial line gets its own shell at boot, started from ttyS0.
    // setsid so it owns ttyS1 (Ctrl-C reaches what it runs). A background
    // job of the INTERACTIVE shell, never `( … & )`: a subshell has no job
    // control, so its `&` sets SIGINT to SIG_IGN, the exec'd shell keeps that
    // as "ignored at entry" and hands it to every child — measured: ^C
    // echoed, `sleep 100` stayed, `kill -INT` from ttyS0 did nothing either.
    // `wait $!` reaps the job (setsid forks and its parent exits at once), so
    // no `[1]+ Done` notice lands in the next exec's output. null when an
    // image bakes its own getty for ttyS1.
    tty: "setsid sh -c 'TERM=xterm exec sh </dev/ttyS1 >/dev/ttyS1 2>&1' & wait $!",
    loopback: 'ifconfig lo up',
    shellLine: 'Then a POSIX shell script for BusyBox ash. No bash arrays, no GNU-only flags, no package manager, no network. Available: sh ls cat grep sed awk wc sort head tail cut tr find echo test. The workspace is at /mnt. Print results to stdout.',
  },
  debian: {
    id: 'debian', label: 'Debian', blurb: 'full: streamed 1 GB disk, apt works, slow — 80 to 120 s to a shell',
    memoryMB: 256, bootTimeoutMs: 360000,
    preflight: DEBIAN_BASE + 'bzImage',
    config: () => ({
      bzimage: { url: DEBIAN_BASE + 'bzImage' },
      initrd:  { url: DEBIAN_BASE + 'initrd' },
      // console-getty races the autologin serial getty for ttyS0 and sometimes
      // wins, leaving a login: prompt the desktop cannot get past. Mask it here
      // as well as in the image so an older image still boots usably. getty@tty1
      // is the VGA console: its login: prompt sat in the Machine pane after a
      // boot that had already succeeded on ttyS0, and read as a machine stuck.
      cmdline: 'root=/dev/sda rw console=ttyS0 net.ifnames=0 loglevel=3 systemd.mask=console-getty.service systemd.mask=getty@tty1.service systemd.hostname=vibeos',
      hda: { url: DEBIAN_BASE + 'chunk.img.zst', async: true, use_parts: true,
             fixed_chunk_size: 128 * 1024, size: 1024 * 1024 * 1024 },
    }),
    // udev may rename eth0 to enp0s5 before we get here; ask for whatever is not lo.
    dhcp: 'IF=$(ls /sys/class/net | grep -v ^lo$ | head -1); dhclient -1 $IF 2>&1 | tail -1',
    ip: "ip -4 -o addr show $(ls /sys/class/net | grep -v ^lo$ | head -1) | grep -o 'inet [0-9.]*' | cut -d' ' -f2",
    netReset: 'IF=$(ls /sys/class/net | grep -v ^lo$ | head -1); ip link set $IF down; ip link set $IF up',
    tty: "setsid bash -c 'TERM=xterm exec bash </dev/ttyS1 >/dev/ttyS1 2>&1' & wait $!",
    shellLine: 'Then a bash script for Debian 12. apt-get works (run apt-get update first; the network is on). Common tools are installed: bash coreutils grep sed awk find curl wget git nano. python3 is NOT installed by default. The workspace is at /mnt. Print results to stdout.',
  },
};

// A CORS proxy is the natural fit here and it is what v86's `fetch` backend is
// designed around — but that backend is NOT in the published npm build (0.5.445
// ships wisp, ws and inbrowser only; `fetch` exists on master). So the working
// option today is WISP: a websocket protocol carrying real TCP, which is
// strictly more capable anyway — TLS and apt work over it, and they cannot over
// a CORS proxy. Off by default; a VM with no network is the safer default.
// Our own WISP server, running as a Vercel function next to the site. The
// public one stays available as a fallback while ours is in beta.
// Our own relay, verified end to end: the guest gets a lease and reaches the
// internet through it. The public one stays as a fallback.
const NET_DEFAULT = 'wisps://vibeos.sh/api/wisp';
const NET_OURS = 'wisps://wisp.mercurywork.shop/';

/* ---------- snapshots: the machine as a file ---------------------------

   v86 can serialise the whole machine — RAM, CPU, devices, the 9p mount —
   into one ArrayBuffer, and restore it into a freshly constructed emulator.
   That makes a booted machine restorable in seconds instead of re-running
   the kernel, and it is what lets an apt install outlive a reload: the
   Debian disk is streamed and its writes live only in memory.

   One snapshot per image, at system/vm-<image>.state in the workspace, or
   in private browser storage when no workspace is open. gzip on the way in:
   the state is RAM plus every device, and for BusyBox that includes the
   7.7 MB CD image v86 keeps in memory — measured 51.2 MB of state, 30.9 MB
   on disk, 1.2 s to save. The gzip trailer carries the raw size, so a stat
   reports both without reading the file back.

   Every verb takes the store to use — {root, where, private} — and none
   resolves one for itself. The store a boot looks in is pinned on the VM
   for the life of that boot (VM.store), and that is the only store a
   snapshot is ever written to: resolving it at write time meant that a
   workspace folder waiting to be re-granted at boot (so the boot looked in
   private storage, found nothing and ran the kernel) and re-granted within
   the 10 s auto-snapshot had a fresh cold machine written over the good
   snapshot in the folder.

   When the snapshot was taken is the instant BEFORE save_state, and it
   travels inside the file, in the gzip header's MTIME (bytes 4–7, seconds
   since the epoch, the field the format defines for "when the original
   was made"; CompressionStream leaves it zero). The file's own mtime is
   after save_state + gzip + write — 1.2 s on BusyBox, 4.7 s on Debian —
   so a disk edit inside that window read as newer than the machine and
   was 'differs' forever after a restore instead of being pushed in. A
   sidecar json would carry milliseconds, but it is a second file that a
   copy, a sync or a hand edit can separate from the state it describes;
   the header cannot be. The cost is one-second resolution: an edit that
   landed on disk in the same second the snapshot started counts as after
   it, and the disk is the truth in that second too.
   -------------------------------------------------------------------- */

const Snapshots = {
  path(image) { return 'system/vm-' + image + '.state'; },

  // Where a snapshot would go right now: the open workspace, else private
  // browser storage.
  async current() {
    if (Workspace.open) return { root: Workspace.root, where: Workspace.label, private: Workspace.private };
    const priv = await this.privateStore();
    if (priv) return priv;
    throw new Error('nowhere to keep a snapshot: no workspace is open and this browser has no private storage');
  },

  async privateStore() {
    if (!navigator.storage || !navigator.storage.getDirectory) return null;
    return { root: await navigator.storage.getDirectory(), where: 'private browser storage', private: true };
  },

  same(a, b) { return a.root === b.root ? Promise.resolve(true) : a.root.isSameEntry(b.root); },

  // null when there is none. Sizes are bytes: on disk, and the raw state.
  // A file too short to be gzip, or without its magic, is reported rather
  // than thrown: a 0-byte file made the trailer DataView throw RangeError,
  // which the boot read as "could not look for a snapshot" and the Machine
  // tab showed raw, with no Forget button for the file that caused it.
  async stat(image, store) {
    const st = await Workspace.statPath(this.path(image), store.root);
    if (!st) return null;
    const info = { image, bytes: st.size, rawBytes: null, savedAt: null, where: store.where, corrupt: '' };
    const head = this.header(new Uint8Array(await st.file.slice(0, 10).arrayBuffer()), st.size);
    if (head.corrupt) info.corrupt = head.corrupt;
    else {
      info.rawBytes = new DataView(await st.file.slice(-4).arrayBuffer()).getUint32(0, true);
      info.savedAt = head.takenAt;
    }
    return info;
  },

  // One verdict on the first bytes for stat and read alike: a file read()
  // would take that stat() calls unusable is a machine restored without a
  // time, and every disk file would then read as newer than it.
  header(head, size) {
    if (size === 0) return { corrupt: 'the snapshot file is empty (0 bytes)' };
    if (size < 18 || head[0] !== 0x1f || head[1] !== 0x8b) return { corrupt: `the snapshot file is not what this desktop writes (${size} bytes, no gzip header)` };
    const takenAt = new DataView(head.buffer, head.byteOffset).getUint32(4, true) * 1000;
    if (!takenAt) return { corrupt: 'the snapshot does not say when it was taken (written by an older desktop), so a disk edit since could not be told from a file it holds' };
    return { takenAt };
  },

  async read(image, store) {
    const gz = await Workspace.readBytesPath(this.path(image), store.root);
    const head = this.header(gz.subarray(0, 10), gz.length);
    if (head.corrupt) throw new Error(head.corrupt);
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  },

  async write(image, state, store, takenAt) {
    if (!Number.isInteger(takenAt) || takenAt <= 0) throw new Error('a snapshot must say when it was taken');
    const stream = new Blob([state]).stream().pipeThrough(new CompressionStream('gzip'));
    const gz = new Uint8Array(await new Response(stream).arrayBuffer());
    const seconds = Math.floor(takenAt / 1000);
    new DataView(gz.buffer, gz.byteOffset, gz.byteLength).setUint32(4, seconds, true);
    await Workspace.writeBytesPath(this.path(image), gz, store.root);
    return { image, bytes: gz.length, rawBytes: state.byteLength, savedAt: seconds * 1000, where: store.where };
  },

  async forget(image, store) {
    if (!(await Workspace.statPath(this.path(image), store.root))) return false;
    await Workspace.removePath(this.path(image), store.root);
    return true;
  },
};

// The serial ports with a shell behind VM.tty. One entry: a second port is
// another uart flag and another boot-time line.
const TTY_PORTS = [1];

const APT_INSTALL = /\bapt(-get)?\b[^|;&]*\binstall\b/;

// The shell prompt at the end of the serial line: busybox `~% ` / `~# `,
// debian `root@vibeos:~# `.
const PROMPT_TAIL = /(?:[\w.@()-]*:)?~[%#$]\s*$/;
// The ttyS1 shell reads no profile (it is exec'd, not a login shell), so on
// Alpine it prints busybox's own `~ # ` — a space before the sigil — and
// then a cursor-position query (`\e[6n`, stripped before the test).
// Any cwd, not only `~`: after `cd /tmp` busybox prints `tmp% `, alpine
// `/tmp # `, bash `root@vibeos:/tmp# ` — with the home-only shape a resize
// was queued until the shell came back to ~, and the restore probe read
// "no prompt" and started a second shell over the one in /tmp. Anchored at
// a line start so a `100% ` in a program's output is not a prompt.
const TTY_PROMPT_TAIL = /(?:^|[\r\n])(?:[\w.@()-]*:)?[\w./~-]* ?[%#$] $/;
// The same prompt where it is cut off captured output, with the hostname
// spelt out. PROMPT_TAIL's class before the colon is right for "is the shell
// back" and wrong for "where does the output end": it swallowed output that
// shares the prompt line — `printf no-trailing-newline` on Alpine came back
// "" and `printf "a\nb\nc"` came back "a\nb", because
// "no-trailing-newlinevibeos:" is all word characters. Every image we build
// is hostname vibeos; BusyBox prints no hostname.
const PROMPT = '(?:(?:root@)?vibeos:)?~ ?[%#$]';
const PROMPT_STRIP = new RegExp(PROMPT + '\\s*$');
const PROMPT_AT_START = new RegExp('^' + PROMPT + '\\s*');

// What one exec returns, from the serial bytes since it typed, or null while
// the command is still running. Pure, so scripts/e2e/exec-parse.mjs can run
// it over chunks captured verbatim from the runs that broke it.
//
// Done only when THIS exec's mark comes back as a line of its own. The shell
// echoes the sentinel command first (` echo __VOSn__`), and those bytes also
// contain `__VOSn__\r\n`; a quiet machine prints the echo and the real line
// inside one 120 ms poll, so `includes(mark)` worked by luck. Under load the
// poll saw the echo alone, the exec resolved before its command had run,
// `from` for the next exec landed before this mark's real line, and a check
// for any `__VOS\d+__` then ended that one on the spot too. Measured, 5 runs
// on a loaded laptop (cold boots 10–17 s): `echo alive` returned
// "__VOS2__\nalive"; a dhcp exec ended on the previous mark and left udhcpc
// running while the next three commands were echoed by the kernel tty, each
// returning "" — 7 checks failed per run, 3 runs of 5. The same rule is what
// keeps a timed-out command's late sentinel from ending the NEXT exec with
// the wrong output, and the typed echo (`^Cecho again`, landed while the tty
// was still cooked) from passing for the result.
//
// Output ends where the shell echoes back the sentinel command we typed. CUT
// there rather than dropping the line containing it: a command whose output
// has no trailing newline — `cat` on almost any file — leaves the prompt and
// that echo on the SAME line as the last line of output, so dropping the
// line dropped the output with it. The echo may arrive with the prompt in
// front of it: `from` is taken the instant the previous exec sees its
// sentinel, and the shell prints the next `~% ` a beat later, so a queued
// exec's chunk can start `~% printf x` rather than `printf x` (2 runs in 5
// under load returned "~% printf no-newline\nno-newline"). And cut at the
// LAST echo before the mark's own line, not the first: under load the next
// exec's bytes arrived while the shell was still leaving its line editor, so
// the kernel tty echoed both lines at once (`printf x\r\n echo __VOSn__\r\n`)
// and the shell then read and echoed them again with prompts — cutting at
// the first copy returned "" (once in 11 runs, on a 12.6 s cold boot).
function execResult(chunk, cmd, mark) {
  // On the cleaned bytes, and after a bare \r too: bash's readline answers
  // Enter with `\e[?2004l\r` before the command's first output byte.
  const clean = chunk.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');   // colour and bracketed-paste
  const done = new RegExp('(^|[\\r\\n])' + mark + '\\r?\\n');
  if (!done.test(clean)) return null;
  const body = clean.slice(0, done.exec(clean).index);
  const cut = body.lastIndexOf('echo ' + mark);
  return (cut >= 0 ? body.slice(0, cut) : body)
    .split(/\r?\n/)
    .filter(l => l.replace(PROMPT_AT_START, '').trim() !== cmd.trim())   // the terminal echoing what we typed
    .filter(l => l.trim() !== 'echo ' + mark)                             // the kernel's copy of the sentinel line
    .filter(l => !/^__VOS\d+__$/.test(l.trim()))                          // a previous mark, if `from` still landed before it
    .join('\n')
    // Strip only the prompt itself, not the line it sits on.
    .replace(PROMPT_STRIP, '')
    .trim();
}

// One socket, as far as v86 is concerned, over as many real ones as it takes.
//
// The relay is a Vercel function with maxDuration 800, so every ~13 minutes the
// WebSocket closes under a guest that is still using it. v86's WISP adapter
// does redial — libv86.js register_ws: onclose → setTimeout(register_ws, 10 s)
// — but measured with the socket closed by hand: a wget started inside those
// 10 s timed out, and nothing told the desktop the network was back, so the
// pill said "network dropped" and the pane offered a restart for a network
// that had been working again for minutes. This redials in 0.5 s instead, in
// place: v86 keeps the object it constructed, the native socket is swapped
// underneath it, and 'close' reaches v86 only once redialing has failed for
// good (five tries, 0.5/1/2/2/2 s apart).
//
// WISP semantics after a redial: the relay's stream table lived in the
// function invocation that just ended, so every guest TCP connection that was
// open at the drop is gone on the server side. Frames from CONNECT to CLOSE
// are watched here to know their ids, and once the new socket is open v86 is
// handed a CLOSE (reason 0x03, network error) for each of them, so the guest
// sees those connections fail now rather than after a TCP timeout. Frames v86
// sent during the gap are held and replayed on the new socket, minus the dead
// streams', so a connection the guest opened while this was dialing goes
// through. Open connections are dropped; new ones work. The Network pane says
// exactly that.
class RelaySocket {
  static delays = [500, 1000, 2000, 2000, 2000];

  // `probe` is for the sockets v86 itself constructs every 10 s after this has
  // given up: one dial, no backoff, so a relay that is down costs one failed
  // connection per 10 s rather than five, and a relay that comes back is found.
  // A probe that opens is the relay socket from then on, with the full
  // backoff: measured before, it kept delays = [] for its whole life, so the
  // next ~800 s expiry got no in-place redial at all and the pane said five
  // redials had failed when none had been tried.
  constructor(url, Native, { onLink, probe = false }) {
    this.url = url;
    this.Native = Native;
    this.onLink = onLink;
    this.probe = probe;
    this.delays = probe ? [] : RelaySocket.delays;
    this.__inner = null;            // the native socket of the moment; a test hook, and named so
    this.handlers = { open: new Set(), message: new Set(), close: new Set(), error: new Set() };
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
    this._binaryType = 'blob';
    this.opened = false;            // v86 has seen 'open'; from here on it is told about no close but the last
    this.ended = false;             // closed by v86, or given up: nothing dials again
    this.attempt = 0;
    this.redials = 0;
    this.timer = null;
    this.lastError = null;
    this.streams = new Set();       // WISP stream ids with a CONNECT sent and no CLOSE either way
    this.dropped = new Set();       // the streams open when the current gap began
    this.held = [];                 // frames v86 sent during the gap
    // A probe says nothing until it knows: 'connecting' every 10 s would turn
    // a dead relay into a pill that flickers.
    if (!probe) this.onLink('connecting');
    this.dial();
  }

  dial() {
    const inner = new this.Native(this.url);
    inner.binaryType = this._binaryType;
    this.__inner = inner;
    inner.addEventListener('open', e => { if (inner === this.__inner) this.opened_(inner, e); });
    inner.addEventListener('message', e => {
      if (inner !== this.__inner) return;
      this.watch(e.data, true);
      this.dispatch('message', e);
    });
    inner.addEventListener('error', e => {
      if (inner !== this.__inner) return;
      if (this.ended) this.dispatch('error', e); else this.lastError = e;
    });
    inner.addEventListener('close', e => { if (inner === this.__inner) this.closed_(e); });
  }

  opened_(inner, e) {
    this.attempt = 0;
    this.lastError = null;
    if (this.probe) { this.probe = false; this.delays = RelaySocket.delays; }
    if (!this.opened) {
      this.opened = true;
      this.onLink('open');
      this.dispatch('open', e);
      return;
    }
    this.redials++;
    // Fail the streams the relay forgot before anything else moves, then let
    // through what the guest did while we were dialing.
    const dropped = this.dropped; this.dropped = new Set();
    for (const id of dropped) {
      this.streams.delete(id);
      this.dispatch('message', new MessageEvent('message', { data: RelaySocket.closeFrame(id, 3).buffer }));
    }
    const held = this.held; this.held = [];
    for (const frame of held) {
      if (!dropped.has(RelaySocket.streamId(frame))) inner.send(frame);
    }
    this.onLink('open');
  }

  closed_(e) {
    if (this.ended) { this.dispatch('close', e); return; }
    const delay = this.delays[this.attempt];
    if (delay === undefined) {
      this.ended = true;
      // v86's onclose only schedules its own redial and keeps its connection
      // table, so guest connections open at the drop would hang until a TCP
      // timeout. We know their ids: fail them now, then say the link died.
      for (const id of new Set([...this.dropped, ...this.streams])) {
        this.dispatch('message', new MessageEvent('message', { data: RelaySocket.closeFrame(id, 3).buffer }));
      }
      this.dropped = new Set(); this.streams.clear();
      this.onLink('dead');
      if (this.lastError) this.dispatch('error', this.lastError);
      this.dispatch('close', e);
      return;
    }
    // A socket that has never opened is still connecting, not reconnecting:
    // the desktop must not say the link was lost when there was none, nor
    // that open connections were dropped.
    if (this.attempt === 0 && this.opened) {
      this.dropped = new Set(this.streams);
      this.onLink('reconnecting');
    }
    this.attempt++;
    this.timer = setTimeout(() => { this.timer = null; this.dial(); }, delay);
  }

  // Between real sockets v86 has been told nothing, so this answers what v86
  // has been told: OPEN. Not for v86's sake — its wisps adapter never reads
  // readyState (send_packet calls wispws.send whatever the state, and it
  // redials from onclose alone) — but for whoever else asks, and it is
  // send() below, not this, that holds frames across the gap.
  get readyState() {
    if (this.opened && !this.ended) return 1;
    return this.__inner.readyState;
  }
  get bufferedAmount() {
    return this.__inner.bufferedAmount + this.held.reduce((n, f) => n + f.byteLength, 0);
  }
  get binaryType() { return this._binaryType; }
  set binaryType(v) { this._binaryType = v; this.__inner.binaryType = v; }
  get protocol() { return this.__inner.protocol; }
  get extensions() { return this.__inner.extensions; }

  send(data) {
    this.watch(data, false);
    const gap = this.opened && !this.ended && this.__inner.readyState !== 1;
    if (gap) this.held.push(data); else this.__inner.send(data);
  }

  close(code, reason) {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    this.held = [];
    // A dial timer was pending: nothing is open, so there is nothing to close
    // and no close event will come. Say so ourselves, as a real socket would.
    if (this.__inner.readyState === 3) { this.dispatch('close', { code: code || 1000, reason: reason || '', wasClean: true }); return; }
    this.__inner.close(code, reason);
  }

  addEventListener(type, fn) {
    if (!this.handlers[type]) throw new Error('RelaySocket: no such event: ' + type);
    this.handlers[type].add(fn);
  }
  removeEventListener(type, fn) {
    if (!this.handlers[type]) throw new Error('RelaySocket: no such event: ' + type);
    this.handlers[type].delete(fn);
  }
  dispatch(type, e) {
    const h = this['on' + type];
    if (typeof h === 'function') h.call(this, e);
    this.handlers[type].forEach(fn => fn.call(this, e));
  }

  // The host a relay URL names, as the URL parser sees it — the only thing
  // that decides whether a dial is the relay. v86 hands the string through
  // verbatim but for the scheme (register_ws: replace 'wisps://' → 'wss://'),
  // so 'wisps://VIBEOS.sh/api/wisp' is dialed as 'wss://VIBEOS.sh/…' while
  // new URL() lowercases; a substring match on the lowercased host missed it
  // and the guest got a native socket nobody watched. wisps: is not a special
  // scheme, so its host would come back verbatim too: everything is parsed as
  // https:. null for a string that is not a URL.
  static host(url) {
    try { return new URL(String(url).replace(/^(wisps?|wss?):/, 'https:')).host; } catch { return null; }
  }

  // WISP frames: byte 0 is the type, bytes 1-4 the stream id, little-endian.
  // 1 CONNECT, 2 DATA, 3 CONTINUE, 4 CLOSE.
  static streamId(frame) {
    const u8 = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
    return u8.length >= 5 ? new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(1, true) : null;
  }
  static closeFrame(id, reason) {
    const f = new Uint8Array(6);
    const v = new DataView(f.buffer);
    v.setUint8(0, 4); v.setUint32(1, id, true); v.setUint8(5, reason);
    return f;
  }
  watch(frame, incoming) {
    const u8 = frame instanceof Uint8Array ? frame : frame instanceof ArrayBuffer ? new Uint8Array(frame) : null;
    if (!u8 || u8.length < 5) return;
    const id = RelaySocket.streamId(u8);
    if (u8[0] === 1 && !incoming) this.streams.add(id);
    else if (u8[0] === 4) this.streams.delete(id);
  }
}

const VM = {
  state: 'off',
  net: '',                 // '' = no relay, 'connecting' (lease or relay dial pending), 'no lease', then the link: connected | reconnecting | disconnected | unwatched
  ip: '',                  // the guest's lease, once it has one
  leased: false,           // dhcp has answered, one way or the other; net follows the link from here
  link: '',                // what the relay socket reports: connecting | open | reconnecting | dead
  linkWasOpen: false,      // the relay has been open at least once this boot; 'reconnected' means something only then
  netNote: '',             // shown next to the state once a redial has happened
  relaySocket: null,       // the RelaySocket v86 holds; .__inner is the native socket of the moment
  bootedRelay: '',         // the relay URL this boot gave v86; the setting can change under a running machine
  // Networking is on by default now. An absent setting means "use the default
  // relay"; the explicit string 'off' is how someone turns it off, so that is
  // distinguishable from never having chosen.
  get relay() {
    let stored = null;
    try { stored = localStorage.getItem('vibeos-net'); } catch {}
    if (stored === 'off') return '';
    return stored || NET_DEFAULT;
  },
  setRelay(url) {
    try { localStorage.setItem('vibeos-net', url || 'off'); } catch {}
  },
  // Which Linux boots. Persisted like the relay; takes effect on restart.
  get image() {
    const chosen = this.chosenImage;
    return chosen || 'alpine';
  },
  // The image someone picked in Settings, or null for the default. The default
  // may fall back when it cannot boot; a choice never silently does.
  get chosenImage() {
    let stored = null;
    try { stored = localStorage.getItem('vibeos-image'); } catch {}
    return IMAGES[stored] ? stored : null;
  },
  setImage(id) {
    if (!IMAGES[id]) throw new Error('unknown image: ' + id);
    try { localStorage.setItem('vibeos-image', id); } catch {}
  },            // off | unavailable | booting | ready | failed
  emu: null,
  screen: null,            // created once, moved between windows
  serial: '',
  seq: 0,
  listeners: new Set(),

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  // No paintVM() here any more: the machine announces its state and does not
  // know a DOM exists. The menu-bar painter subscribes like any other listener.
  // Listeners get (state, transition): emit() is a repaint — the lease, a
  // snapshot — and only set() to a different state is a transition. A boot
  // used to announce 'ready' three times (set, set again, emit after the
  // lease), and every listener that did work on 'ready' — the guest CLI
  // install, the first sync — did it three times, queuing execs ahead of the
  // lease and in the window where a kernel line can land inside one.
  emit(transition = false) { this.listeners.forEach(fn => { try { fn(this.state, transition); } catch {} }); },
  set(state, detail) {
    const changed = state !== this.state;
    this.state = state; this.detail = detail || '';
    this.emit(changed);
  },

  async available() {
    try { return (await fetch(V86_ASSETS + 'libv86.js', { method: 'HEAD' })).ok; }
    catch { return false; }
  },

  // v86 owns the relay WebSocket internally and exposes no event for it, so
  // the constructor is wrapped: a dial to the relay's host gets a RelaySocket,
  // which redials under v86 and reports the link here; everything else gets
  // the native socket. Wrapped once per page — a restart used to reset the
  // flag and wrap the wrapper — and the host is read per dial from the URL
  // this boot gave v86, not the setting: that can be edited while the machine
  // runs, and v86 dials what it was given. Hosts are compared parsed and
  // equal, not by substring of the lowercased setting in the verbatim dial —
  // 'wisps://VIBEOS.sh/api/wisp' got a native socket that way.
  watchRelay() {
    if (window.__wsWrapped) return;
    window.__wsWrapped = true;
    const Native = window.WebSocket;
    const self = this;
    window.WebSocket = function (url, protocols) {
      const host = self.bootedRelay && RelaySocket.host(self.bootedRelay);
      if (!host || RelaySocket.host(url) !== host || protocols !== undefined) {
        return protocols === undefined ? new Native(url) : new Native(url, protocols);
      }
      self.relaySocket = new RelaySocket(String(url), Native, {
        probe: self.link === 'dead',
        onLink: link => self.setLink(link),
      });
      return self.relaySocket;
    };
    window.WebSocket.prototype = Native.prototype;
    Object.assign(window.WebSocket, Native);
  },

  setLink(link) {
    const was = this.link;
    this.link = link;
    // Only a link that was open has connections to drop: a first dial that
    // failed and then opened is a connection, not a reconnection.
    if (link === 'open' && this.linkWasOpen && (was === 'reconnecting' || was === 'dead')) {
      this.netNote = 'reconnected; open connections were dropped';
    }
    if (link === 'open') this.linkWasOpen = true;
    this.syncNet();
  },

  // net is what the pill and the Network pane show. Boot owns it until dhcp
  // has answered; from then on it follows the link. The link comes first: a
  // dead relay is 'disconnected' whether or not the guest holds a lease (v86
  // answers DHCP itself, so a lease says nothing about the relay), and 'no
  // lease' is only for a relay that is up with nothing to route to.
  //
  // No link at all means v86 dialed a socket the wrapper did not claim. That
  // was a throw here, which landed in boot()'s try after set('ready') and
  // flipped a running, networked machine to 'failed' — with the emulator still
  // running and boot()'s guard ready to build a second one over it. It is a
  // state now: the guest may well have the internet, and nothing here will
  // notice when it loses it.
  syncNet() {
    if (this.state !== 'ready' || !this.leased) return;
    const byLink = { connecting: 'connecting', reconnecting: 'reconnecting', dead: 'disconnected' };
    if (byLink[this.link]) this.net = byLink[this.link];
    else if (this.link === 'open') this.net = this.ip ? 'connected' : 'no lease';
    else if (this.link === '') {
      this.net = 'unwatched';
      console.error(new Error('relay ' + JSON.stringify(this.bootedRelay) + ' is configured but v86 dialed no socket the wrapper claimed; the link cannot be watched'));
    }
    else throw new Error('unknown relay link state: ' + JSON.stringify(this.link));
    this.emit();
  },

  // Five redials have failed, or the image is being switched: the machine has
  // to come back. Apps survive because they are files on disk; VM state does
  // not.
  async teardown() {
    // v86's network adapter arms a 10 s redial in onclose (register_ws) that
    // destroy() never clears, and destroy() is async. Left alone, the dead
    // emulator kept dialing through the wrapper and the desktop showed the
    // zombie's link instead of the new guest's. Measured: two open relay
    // sockets after a restart. discard() disarms it before tearing down.
    // The machine is 'off' the moment it is detached, not once destroy() has
    // finished: destroy waits for the CPU loop (up to 5 s for a wedged one),
    // and a retry clicked in that window read 'ready' from the machine it
    // had just torn down. The wait stays: the next boot must not build a
    // second emulator over one that is still stopping.
    const destroyed = this.discard();
    this.screen = null; this.serial = '';
    this.net = ''; this.ip = ''; this.leased = false; this.link = ''; this.linkWasOpen = false; this.netNote = '';
    this.relaySocket = null; this.bootedRelay = '';
    window.__v86loaded = null;
    this.set('off');
    await destroyed;
  },
  // No image named while the default's fallback is running: reboot the
  // BusyBox that works, not the Alpine that just failed — retryFallback is
  // the one path that retries it. A choice made in Settings still wins.
  async restart(imageId) {
    const stayOnFallback = !imageId && !!this.fallback && !this.chosenImage;
    const id = stayOnFallback ? this.bootedImage : (imageId || this.image);
    await this.teardown();
    if (!stayOnFallback) this.fallback = null;
    await this.boot(id);
  },
  // The Machine pane's "retry Alpine" after a fallback. Not setImage: the
  // person did not choose Alpine, the default is still the default.
  retryFallback() {
    if (!this.fallback) throw new Error('nothing fell back');
    return this.restart(this.fallback.from);
  },

  // destroy() waits for the CPU loop to notice it should stop; a machine that
  // is wedged never gets there, and a restart must not hang on it.
  async discard() {
    const emu = this.emu;
    this.emu = null;
    if (!emu) return;
    // The adapter's onclose arms a 10 s setTimeout(register_ws) that destroy()
    // never clears; a discarded machine kept dialing through the wrapper.
    try { if (emu.network_adapter) emu.network_adapter.register_ws = () => {}; } catch {}
    // And the RelaySocket that machine dialed: closed, it neither redials nor
    // reports a link, so a machine discarded after a failed restore cannot
    // paint 'reconnecting' over the cold boot's socket.
    const rs = this.relaySocket; this.relaySocket = null;
    try { if (rs) rs.close(); } catch {}
    try { emu.stop(); } catch {}
    try { await Promise.race([emu.destroy(), new Promise(r => setTimeout(r, 5000))]); } catch {}
  },

  // Snapshot bookkeeping, all per boot: where the boot looked, whether this
  // machine came from a snapshot and how old it was, why a restore was
  // refused, what the last snapshot did.
  store: null,          // {root, where, private} the boot consulted; the only store this boot writes
  storeError: '',       // why store is null
  restored: false,
  restoredFrom: null,   // {savedAt} of the snapshot this machine came from
  keptSnapshot: false,  // the boot found a snapshot and left it alone (?safe=1, recovering): nothing this boot may write over it
  restoreError: '',
  snapshotInfo: null,   // {image, bytes, rawBytes, savedAt, where, reason, ms}
  snapshotError: '',
  AUTO_SNAPSHOT_MS: 10000,
  _written: new Set(),  // /mnt names the guest, or an app save, wrote this boot

  construct(image, autostart) {
    this.emu = new V86({
      wasm_path: V86_ASSETS + 'v86.wasm',
      memory_size: image.memoryMB * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      bios:     { url: V86_ASSETS + 'seabios.bin' },
      vga_bios: { url: V86_ASSETS + 'vgabios.bin' },
      ...image.config(),
      ...(this.bootedRelay ? { net_device: { type: 'ne2k', relay_url: this.bootedRelay } } : {}),
      filesystem: {},        // the 9p mount at /mnt — the file bridge
      uart1: true,           // ttyS1: the tty apps and the Terminal attach to (VM.tty)
      screen_container: this.screen,
      autostart,
      disable_speaker: true,
    });
    window.__v86 = this.emu;
    this.emu.add_listener('serial0-output-byte', b => {
      this.serial += String.fromCharCode(b);
      // Not while an exec is reading: its `from` is an index into this
      // string, and a trim under it either cut the output silently (350 KB
      // came back as its last 150 KB) or left `from` past the end, so the
      // exec never saw its mark and timed out.
      if (this._execFrom === null && this.serial.length > 200000) this.serial = this.serial.slice(-100000);
    });
    this._tty = {};
    for (const port of TTY_PORTS) {
      this._tty[port] = { tail: '', chunk: [], listeners: new Set(), holder: null, pendingResize: null, flush: 0, resizeTimer: 0 };
      this.emu.add_listener(`serial${port}-output-byte`, b => this._ttyByte(port, b));
    }
  },

  // Cold: run the kernel and wait for the shell prompt on the serial console.
  async coldBoot(image) {
    this.construct(image, true);
    await new Promise((res, rej) => {
      const t0 = Date.now();
      const tick = setInterval(() => {
        if (/~[%#$] $/.test(this.serial) || /~[%#$] /.test(this.serial.slice(-40))) {
          clearInterval(tick); res();
        } else if (Date.now() - t0 > image.bootTimeoutMs) {
          clearInterval(tick); rej(Object.assign(new Error('the VM never reached a shell prompt'), { fallbackReason: 'timeout' }));
        }
      }, 500);
    });
  },

  // Warm: the same machine config, the CPU held until the state is in, then
  // run. The prompt was printed before the snapshot, so there is nothing to
  // wait for on the serial line; instead the sentinel protocol exec relies on
  // is exercised once, with a real command, and "ready" means it answered.
  // The guest's clock stopped at the snapshot, so it is set from the host's.
  // A machine that restores but cannot run a command is not restored.
  // The whole thing is under the image's boot timeout, like coldBoot: a
  // restore measures 0.3–0.5 s (BusyBox) and 4.7 s (Debian), but neither
  // emulator-loaded nor restore_state has a timeout of its own, so a state
  // that never loaded sat at 'vm starting…' forever, with Forget unreachable
  // behind it. Now it is a refused snapshot like any other: discarded, cold
  // boot, and the reason in the pill.
  async restore(image, snap) {
    const t0 = Date.now();
    const state = await Snapshots.read(image.id, this.store);
    this.construct(image, false);
    // Pinned: once the timeout below has won, this.emu is null and then the
    // cold boot's machine, and a restore_state that resolves late must not
    // run that one or send its probe down that one's serial line.
    const emu = this.emu;
    const work = (async () => {
      await new Promise(res => emu.add_listener('emulator-loaded', res));
      await emu.restore_state(state);
      if (this.emu !== emu) throw new Error('superseded by a cold boot');
      await emu.run();
      this._restoring = true;
      try { return await this._exec(`date -s @${Math.floor(Date.now() / 1000)} >/dev/null 2>&1; echo restored-ok`, 20000); }
      finally { this._restoring = false; }
    })();
    work.catch(() => {});   // a late failure after the timeout has already won is not unhandled
    let timer;
    const out = await Promise.race([work, new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`the snapshot did not restore within ${image.bootTimeoutMs / 1000}s`)), image.bootTimeoutMs);
    })]).finally(() => clearTimeout(timer));
    if (!/restored-ok/.test(out)) throw new Error('the restored machine did not answer on the serial line: ' + JSON.stringify(out.slice(0, 80)));
    this.restored = true;
    this.restoredFrom = { savedAt: snap.savedAt };
    track('vm_restored', { image: image.id, seconds: Math.round((Date.now() - t0) / 1000), mb: Math.round(snap.bytes / 1048576) });
  },

  // The default image lives on a CDN. A network that blocks it, or a host too
  // loaded to reach a prompt inside the budget, used to end at 'vm failed'
  // where the bundled BusyBox always worked. So the default — never an image
  // someone chose in Settings — falls back to BusyBox once, and says so.
  fallback: null,          // { from, reason } while a fallback is booting or running
  fellBack: false,         // once per page: the retry after a fallback shows 'failed'
  _execFrom: null,         // where the running exec's output starts in `serial`; the buffer is not trimmed under it
  async boot(imageId) {
    if (this.state === 'booting' || this.state === 'ready') return;
    if (!(await this.available())) return this.set('unavailable');
    const id = imageId || this.image;
    if (!IMAGES[id]) throw new Error('unknown image: ' + id);
    // The image is named BEFORE the state is announced: 'booting' listeners
    // read IMAGES[VM.bootedImage].label for the pill, and between the two
    // the read was of undefined — a 1-in-4 page error in machine.mjs that
    // only a listener running inside that gap could see.
    this.bootedImage = id;
    this.set('booting');
    this.bootStarted = Date.now();
    this.store = null; this.storeError = ''; this.restored = false; this.restoredFrom = null;
    this.keptSnapshot = false; this.restoreError = ''; this.snapshotError = ''; this._written = new Set();
    this.ttyState = ''; this.ttyError = ''; this.ttyMs = 0; this.ttyRestore = '';
    try {
      await loadScriptOnce(V86_ASSETS + 'libv86.js');
      this.watchRelay();

      this.screen = document.createElement('div');
      this.screen.tabIndex = 0;
      this.screen.style.cssText = 'background:#000;height:100%;overflow:auto;outline:none';
      this.screen.innerHTML = `<div style="white-space:pre;font:14px/1.15 'JetBrains Mono',monospace;color:var(--titletext);padding:6px"></div><canvas style="display:none"></canvas>`;
      this.screen.addEventListener('click', () => this.screen.focus());

      const image = IMAGES[id];
      this.bootedRelay = this.relay;
      // v86 retries a missing disk forever; check the CDN once so a bad URL or
      // a blocked network fails in a second with a reason, not in six minutes.
      if (image.preflight) {
        const ok = await fetch(image.preflight, { method: 'HEAD' }).then(r => r.ok, () => false);
        if (!ok) throw Object.assign(new Error(`${image.label} image is not reachable at ${image.preflight}`), { fallbackReason: 'unreachable' });
      }
      // v86 fetches a streamed disk one chunk at a time, when the kernel asks
      // and not before, so a boot is ~100 round trips in a row: the same build
      // booted in 27 s from localhost and 55 s from CloudFront. boot.txt is
      // the list a boot touches (scripts/alpine/warm.mjs); fetching them all
      // at once lands them in the HTTP cache, where v86's own requests find
      // them. Not awaited: v86 asks for whatever is missing anyway.
      if (image.warm) {
        const base = image.warm.slice(0, image.warm.lastIndexOf('/') + 1);
        fetch(image.warm).then(r => r.ok ? r.text() : Promise.reject(new Error(r.status + ' for ' + image.warm)))
          .then(list => Promise.all(list.trim().split('\n').map(name =>
            fetch(base + name).then(r => r.arrayBuffer(), () => null))))
          .catch(e => console.warn('warm list skipped:', e.message));
      }

      // The store is pinned here, and the boot always looks in it, even when
      // it will not restore: what is there decides whether this boot may
      // snapshot at all (below). The recovery rule from the loader applies
      // to the restore: a boot that is already recovering, or asked to be
      // plain, runs the machine from scratch and leaves the snapshot where it
      // is. And a snapshot that fails to restore is forgotten and the machine
      // cold-boots — it must never be a dead machine that fails the same way
      // on every reload.
      const b = window.__vibeosBoot || {};
      let snap = null;
      try {
        this.store = await Snapshots.current();
        snap = await Snapshots.stat(image.id, this.store);
      } catch (e) {
        this.store = null;
        this.storeError = this.restoreError = 'could not look for a snapshot: ' + e.message;
      }
      const kept = !!snap && (b.recovering || b.safe);
      this.keptSnapshot = kept;
      if (snap && !kept) {
        try { await this.restore(image, snap); }
        catch (e) {
          this.restoreError = e.message;
          track('vm_restore_failed', { image: image.id, error: String(e.message).slice(0, 80) });
          await this.discard();
          this.serial = '';
          try { await Snapshots.forget(image.id, this.store); }
          catch (e2) { this.restoreError += ' (and it could not be deleted: ' + e2.message + ')'; }
        }
      }
      if (!this.restored) await this.coldBoot(image);

      this.hookWrites();
      this.bootSeconds = (Date.now() - this.bootStarted) / 1000;
      // Announced once. A second set('ready') used to sit inside the relay
      // block below, and everything that runs on 'ready' ran twice.
      this.set('ready');
      track('vm_ready', { seconds: Math.round(this.bootSeconds), image: this.bootedImage, restored: this.restored });
      // Not in boot's failure path: the machine is up whether or not lo came
      // up, and a timeout or a Terminal Ctrl-C landing on this exec used to
      // flip a ready machine to 'failed'.
      if (image.loopback) {
        try { await this.exec(image.loopback); }
        catch (e) { console.warn(`loopback stayed down: ${e.message}`); }
      }
      await this.startTty(image);

      // The image brings the NIC up but does not ask for a lease, so a
      // configured relay would look broken until someone ran udhcpc by hand.
      // After a restore this runs again on purpose: the relay socket is v86's
      // and did not survive the snapshot — the guest still holds its old
      // lease, but every TCP connection it had is gone and the new socket is
      // what its traffic now goes through. Renewing is how that gets checked
      // rather than assumed; whatever it reports is what the pill says.
      // The link is bounced first. Measured on BusyBox: after a restore the
      // guest's DHCP discovers do leave the card (four net0-send events on
      // v86's bus) and nothing ever comes back, until the driver resets the
      // device — ifconfig down/up — after which the next request leases in
      // under a second. A restored ne2k receives nothing until it is reset.
      if (this.bootedRelay) {
        this.net = 'connecting';
        this.emit();
        try {
          if (this.restored) await this.exec(image.netReset, 15000);
          await this.exec(image.dhcp, 45000);
          const ip = (await this.exec(image.ip)).trim();
          this.ip = /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : '';
        } catch { this.ip = ''; }
        this.leased = true;
        this.syncNet();
      }

      // A cold boot earns a snapshot once it has settled, so the next load of
      // this image is a restore. Not after a restore: that would rewrite the
      // same state every boot for nothing. And not over a snapshot the boot
      // found and left alone (?safe=1, recovering): that one holds the
      // installs; a fresh kernel written over it is what safe mode promised
      // not to do.
      if (!this.restored && this.store && !kept) {
        setTimeout(() => { if (this.ready() && this.bootedImage === image.id) this.snapshot('first boot').catch(() => {}); }, this.AUTO_SNAPSHOT_MS);
      }
    } catch (e) {
      const seconds = Math.round((Date.now() - this.bootStarted) / 1000);
      const reachedReady = this.state === 'ready';
      const canFallBack = !reachedReady && !!e.fallbackReason && id !== 'busybox'
        && !this.chosenImage && !this.fellBack;
      // vm_failed is what the visitor sees; a default that falls back and
      // boots is vm_fallback, not a failure, or the two would double count.
      if (!canFallBack) {
        track('vm_failed', { image: id, seconds });
        return this.set('failed', e.message);
      }
      this.fellBack = true;
      this.fallback = { from: id, reason: e.fallbackReason };
      track('vm_fallback', { from: id, reason: e.fallbackReason });
      await this.teardown();
      await this.boot('busybox');
    }
  },

  refuseSnapshot(reason) {
    this.snapshotError = `not saved after ${reason}: this boot left the snapshot in ${this.store.where} alone (?safe=1 or recovery), and nothing is written over it`;
    this.emit();
  },

  // Serialised behind exec: a state saved while a command is mid-flight would
  // restore into a shell that is waiting for output nobody will read.
  snapshot(reason) {
    const run = () => this._snapshot(reason || 'manual');
    const next = (this._queue || Promise.resolve()).then(run, run);
    this._queue = next.catch(() => {});
    return next;
  },

  // The store this boot looked in, and only if it still is the store: a
  // workspace opened since boot means the next boot will look somewhere
  // else, and writing here would either overwrite a snapshot the boot never
  // saw or leave one nobody will read.
  async snapshotStore() {
    if (!this.store) throw new Error('not saved: ' + this.storeError);
    const now = await Snapshots.current();
    if (!(await Snapshots.same(now, this.store))) {
      throw new Error(`not saved: the workspace changed since boot (the boot looked for a snapshot in ${this.store.where}; one saved now would go to ${now.where}, which was not checked). Reload, and snapshots go to ${now.where}.`);
    }
    return this.store;
  },

  async _snapshot(reason) {
    if (!this.ready()) throw new Error('the VM is not running');
    const t0 = Date.now();
    try {
      const store = await this.snapshotStore();
      const takenAt = Date.now();
      const state = await this.emu.save_state();
      const info = await Snapshots.write(this.bootedImage, state, store, takenAt);
      this.snapshotInfo = { ...info, reason, ms: Date.now() - t0 };
      this.snapshotError = '';
      track('vm_snapshot', { image: this.bootedImage, reason, mb: Math.round(info.bytes / 1048576), seconds: Math.round((Date.now() - t0) / 1000) });
      this.emit();
      return this.snapshotInfo;
    } catch (e) {
      this.snapshotError = e.message;
      this.emit();
      throw e;
    }
  },

  async forgetSnapshot(image = this.bootedImage || this.image, store = this.store) {
    if (!store) throw new Error(this.storeError || 'the machine has not booted, so there is no snapshot store yet');
    const gone = await Snapshots.forget(image, store);
    if (this.snapshotInfo && this.snapshotInfo.image === image) this.snapshotInfo = null;
    this.emit();
    return gone;
  },

  // After a restore /mnt holds the snapshot's copy of the folder. A file
  // edited on disk since then was shadowed by that stale copy: the diff
  // called it 'differs' and never moved it, and the dock ran the old source.
  // On a cold boot the machine came up empty and the disk copy won; this is
  // that rule for a restored machine — the disk is newer than the snapshot,
  // and the machine has not written the file itself this boot.
  staleSinceRestore(name, diskModified) {
    return !!this.restoredFrom && diskModified > this.restoredFrom.savedAt && !this._written.has(name);
  },


  // ---- push-based sync, VM -> folder ----------------------------------
  // v86's 9p filesystem is plain JavaScript, so its write path can be wrapped.
  // That turns "poll every 60s" into "react when the VM actually writes",
  // which is the useful half of what a FUSE mount would give us. The other
  // half (folder -> VM on change) has no browser equivalent: there is no
  // directory-watch API, so that direction still polls.
  // Kept for the boot path to call; the listeners decide what a write means.
  hookWrites() {
    const fs = this.emu && this.emu.fs9p;
    if (!fs || fs.__hooked) return;
    fs.__hooked = true;
    // v86's Write does not touch the inode mtime (only CreateInode and a
    // guest setattr do), so which files this machine has written is kept
    // here, by name, for staleSinceRestore. /mnt is flat: root is inode 0.
    const nameOf = id => { for (const [n, i] of fs.inodes[0].direntries) if (i === id && n !== '.' && n !== '..') return n; return null; };
    const schedule = (name) => {
      if (this.suppress) return;          // don't echo our own folder -> VM pushes
      if (name) this._written.add(name);
      // Listeners first and unconditionally: a subscriber that wants to react
      // to a specific file cannot afford the 800ms debounce meant for syncing.
      this._writeListeners.forEach(f => { try { f(); } catch {} });
      clearTimeout(this._flush);
      this._flush = setTimeout(() => this._writeSettled.forEach(f => { try { f(); } catch {} }), 800);
    };
    for (const name of ['Write', 'Unlink', 'ChangeSize']) {
      const orig = fs[name];
      if (typeof orig !== 'function') continue;
      fs[name] = function (...args) {
        const written = name === 'Unlink' ? args[1] : nameOf(args[0]);
        const r = orig.apply(this, args); schedule(written); return r;
      };
    }
  },

  /* ---- the machine interface -------------------------------------------

     Eight verbs is the whole of what the rest of the desktop needs from the
     VM: exec, readFile, writeFile, listFiles, onWrite, state+events,
     lifecycle, and screen. They were not written down before, so eight call
     sites reached past this object into VM.emu or the window.__v86 global,
     and a global back door is not an interface.

     Every verb here is async and takes and returns bytes or strings, so the
     whole surface could later sit behind postMessage without a single caller
     changing. screen is the one member that cannot: it is a DOM node the
     emulator owns and the UI adopts.
     -------------------------------------------------------------------- */

  _writeListeners: [],   // fire on every write, undebounced
  _writeSettled: [],     // fire once writes stop, for sync-shaped work

  ready() { return this.state === 'ready' && !!this.emu; },

  async readFile(path) {
    if (!this.emu) throw new Error('the VM is not running');
    return this.emu.read_file(path);
  },

  // create_file goes through v86's set_data, never the hooked fs.Write, so
  // a `// @target vm` create_app or the VM half of Apps.save left the ledger
  // empty and Sync.auto pushed the disk copy over it after a restore. A
  // quiet write (Sync.push, the guest CLI) IS the disk copy and stays out.
  async writeFile(path, bytes) {
    if (!this.emu) throw new Error('the VM is not running');
    const r = await this.emu.create_file(path, bytes);
    if (!this.suppress) this._written.add(path.replace(/^.*\//, ''));   // by root name, as the write hook keys it
    return r;
  },

  async readText(path) {
    return new TextDecoder().decode(await this.readFile(path));
  },

  async writeText(path, text) {
    return this.writeFile(path, new TextEncoder().encode(text));
  },

  // null, not [], when the machine cannot answer — callers already distinguish
  // "no files" from "no VM" and would otherwise report an empty disk.
  // Every entry under /mnt, recursively, as {parentid, name, type}: parentid 0
  // is the mount root and type is the inode's S_IFMT class. Only 'file' is
  // readable through read_file: a directory, a symlink (even one pointing at a
  // readable file — 9p does not follow it), a broken symlink and a FIFO all
  // throw 'File not found' (measured on busybox).
  listFiles() {
    const fs = this.emu && this.emu.fs9p;
    if (!fs) return null;
    const list = [];
    try { fs.GetRecursiveList(0, list); } catch { return null; }
    return list.filter(e => e.name && !/^\./.test(e.name))
               .map(e => ({ ...e, type: inodeType(fs.GetInode(fs.Search(e.parentid, e.name)).mode) }));
  },

  onWrite(fn, { settled = false } = {}) {
    const target = settled ? this._writeSettled : this._writeListeners;
    target.push(fn);
    return () => {
      const i = target.indexOf(fn);
      if (i >= 0) target.splice(i, 1);
    };
  },

  // Writes we make ourselves must not look like the guest writing.
  async writeQuietly(path, bytes) {
    this.suppress = true;
    try { return await this.writeFile(path, bytes); }
    finally { setTimeout(() => { this.suppress = false; }, 50); }
  },

  // ---- the tty: a byte stream on ttyS1 with its own shell ----------------
  //
  // exec is request/response over ttyS0 behind a sentinel: no stdin once the
  // command has started, no pty, and every app shares the agent's shell. A
  // terminal wants bytes both ways. v86 emulates uart1 (`uart1: true`); the
  // image starts a shell on it from ttyS0 at boot (IMAGES.<id>.tty), and
  // VM.tty(port) hands out ONE handle per port: the built-in Terminal and a
  // `// @requires tty` app cannot both read one line, so the second attach
  // throws naming the holder, and close() (the window closing) frees it.
  // The stream is its own buffer: nothing here touches `serial` or execResult.
  ttyState: '',        // '' | starting | ready | failed — VM.on listeners read it on every emit
  ttyError: '',
  ttyMs: 0,            // how long the ttyS1 shell took to reach its prompt
  ttyRestore: '',      // after a restore: 'survived' (the snapshot's shell answered) | 'busy' (a program holds the line) | 'restarted'
  get ttyReady() { return this.ttyState === 'ready'; },
  _tty: {},

  _ttyByte(port, b) {
    const t = this._tty[port];
    t.chunk.push(b);
    t.tail = (t.tail + String.fromCharCode(b)).slice(-200);
    if (!t.flush) t.flush = setTimeout(() => this._ttyFlush(port), 0);
  },
  _ttyFlush(port) {
    const t = this._tty[port];
    t.flush = 0;
    const bytes = Uint8Array.from(t.chunk);
    t.chunk = [];
    for (const fn of t.listeners) { try { fn(bytes); } catch (e) { console.warn(`tty listener threw: ${e.message}`); } }
    if (t.pendingResize && this._ttyAtPrompt(port)) this._ttyResizeSoon(port);
  },
  // 80 ms after the prompt, not in the same flush: the terminal's reply to
  // the prompt's `\e[6n` goes out in that flush too, and busybox 1.36's
  // read_key drops whatever it read together with a cursor-position reply —
  // measured on alpine: `stty cols ` vanished and `90 rows 25` ran as a
  // command (`sh: 90: not found`). The tail is checked again at send time.
  _ttyResizeSoon(port) {
    const t = this._tty[port];
    if (t.resizeTimer) return;
    t.resizeTimer = setTimeout(() => {
      t.resizeTimer = 0;
      if (t.pendingResize && this._ttyAtPrompt(port)) this._ttySendResize(port);
    }, 80);
  },
  // "At a prompt" is what the last bytes on the line say, ANSI stripped —
  // the same PROMPT_TAIL exec waits for on ttyS0. A write() clears the tail:
  // after typing, the line is not at a prompt until the shell prints one.
  // The tail is flattened first: a query (`\e[6n`, after the prompt on
  // alpine) and an SGR vanish, every other escape is a line break — vi
  // leaves `\e[24;1H\e[K\e[?1049l~% `, a prompt at the start of a line the
  // terminal drew, not the bytes — and anything unprintable goes (the first
  // prompt after a cold boot arrives as `\xff~% ` on busybox).
  _ttyAtPrompt(port) {
    const flat = this._tty[port].tail.replace(/\x1b\[[0-9;?]*[nm]/g, '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '\n').replace(/[^\x20-\x7e\r\n]/g, '');
    return TTY_PROMPT_TAIL.test(flat.slice(-80));
  },
  // A write that is only escape sequences is the terminal answering a query
  // (`\e[24;80R` to `\e[6n`, which ash on alpine sends after every prompt) —
  // the shell prints nothing back for it, so clearing the tail there left
  // the line "not at a prompt" for good and every resize queued forever
  // (measured: nano laid out for 80 columns in a 76-column pane).
  _ttySend(port, data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    if (!(bytes instanceof Uint8Array)) throw new Error('tty.write takes a string or a Uint8Array');
    const typed = String.fromCharCode(...bytes.subarray(0, 64)).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '') !== '';
    if (typed) this._tty[port].tail = '';
    this.emu.serial_send_bytes(port, bytes);
  },
  _ttySendResize(port) {
    const { cols, rows } = this._tty[port].pendingResize;
    this._tty[port].pendingResize = null;
    this._ttySend(port, `stty cols ${cols} rows ${rows}\n`);
  },
  async _ttyPrompt(port, maxMs) {
    const t0 = Date.now();
    while (!this._ttyAtPrompt(port)) {
      if (Date.now() - t0 > maxMs) return false;
      await new Promise(r => setTimeout(r, 60));
    }
    return true;
  },

  // Runs after 'ready', guarded like the loopback exec: a machine whose
  // second line never answers is a machine without a tty, not a failed one.
  // After a restore the snapshot's shell is still in RAM and the uart state
  // came back with it. ttyS0 is asked first whether anything reads the line
  // (the shell, or top/vi/a sleep the snapshot caught mid-command — the
  // auto-snapshot after a cold boot or an apt install lands wherever the
  // Terminal is): if so an Enter tells a prompt ('survived') from a running
  // program ('busy', ready without a prompt), and only an unowned line gets
  // the boot line again. Before the count, a probe that saw no prompt under
  // top started a second shell over the first, and each got half the keys.
  async startTty(image) {
    const port = TTY_PORTS[0];
    this.ttyState = 'starting'; this.ttyError = ''; this.ttyRestore = '';
    this.emit();
    const t0 = Date.now();
    try {
      let start = !!image.tty;
      if (this.restored) {
        const readers = (await this.exec(`ls -l /proc/[0-9]*/fd/0 2>/dev/null | grep -c /dev/ttyS${port}`, 10000)).trim();
        if (!/^\d+$/.test(readers)) throw new Error(`could not count the readers of ttyS${port} after the restore: ${JSON.stringify(readers.slice(0, 80))}`);
        if (readers === '0') this.ttyRestore = 'restarted';
        else {
          this._ttySend(port, '\n');
          const alive = await this._ttyPrompt(port, 3000);
          this.ttyRestore = alive ? 'survived' : 'busy';
          start = false;
        }
      }
      if (start) await this.exec(image.tty);
      const deadline = 15000;
      if (this.ttyRestore !== 'busy' && !(await this._ttyPrompt(port, deadline))) {
        throw new Error(`no shell prompt on ttyS${port} within ${deadline / 1000}s (last bytes: ${JSON.stringify(this._tty[port].tail.slice(-60))})`);
      }
      this.ttyMs = Date.now() - t0;
      this.ttyState = 'ready';
    } catch (e) {
      console.warn(`tty stayed down: ${e.message}`);
      this.ttyState = 'failed';
      this.ttyError = e.message;
    }
    this.emit();
  },

  tty(port = 1, holder = 'unnamed') {
    if (!TTY_PORTS.includes(port)) throw new Error(`no ttyS${port}: the machine has ttyS${TTY_PORTS.join(', ttyS')}`);
    if (this.state !== 'ready') throw new Error('Linux is not running yet.');
    if (this.ttyState !== 'ready') throw new Error(`the tty is ${this.ttyState || 'not started'}${this.ttyError ? ': ' + this.ttyError : ''}`);
    const t = this._tty[port];
    if (t.holder) throw new Error(`ttyS${port} is held by ${t.holder}; close that window first`);
    t.holder = holder;
    const mine = new Set();
    let closed = false;
    const open = () => { if (closed) throw new Error(`this tty handle is closed (${holder})`); };
    return {
      port, holder,
      write: data => { open(); this._ttySend(port, data); },
      onData: fn => {
        open();
        if (typeof fn !== 'function') throw new Error('tty.onData takes a function');
        t.listeners.add(fn); mine.add(fn);
        return () => { t.listeners.delete(fn); mine.delete(fn); };
      },
      resize: (cols, rows) => {
        open();
        if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) throw new Error(`tty.resize: cols and rows must be integers >= 2, got ${cols}x${rows}`);
        t.pendingResize = { cols, rows };
        if (this._ttyAtPrompt(port)) this._ttyResizeSoon(port);
      },
      close: () => {
        if (closed) return;
        closed = true;
        for (const fn of mine) t.listeners.delete(fn);
        mine.clear();
        t.pendingResize = null;
        if (t.holder === holder) t.holder = null;
        this.emit();   // a pane waiting for the line (a reload_ui trial's Terminal) attaches on this
      },
    };
  },

  // A real command, with output captured. A sentinel marks the end so we never
  // have to guess where output stops.
  // One serial line, so one command at a time: a second exec while the first
  // is still running (boot's own dhcp, a user typing during a slow apt) would
  // interleave both outputs and each would claim the other's lines.
  exec(cmd, timeoutMs = 20000) {
    checkTimeout(timeoutMs);
    const run = () => this._exec(cmd, timeoutMs);
    const next = (this._queue || Promise.resolve()).then(run, run);
    this._queue = next.catch(() => {});
    // An install only lives in memory (the Debian disk is streamed), so it
    // earns a snapshot. Here, on the one path every shell goes through — the
    // agent's vm_exec, the Terminal window, api.shell — so "after every apt
    // install" is true of all three, not only the agent's. By command shape,
    // not by result: apt's exit status is not in the output exec returns.
    // Queued behind exec, which means an install backgrounded with & is
    // snapshotted while still running; the finished state is caught by the
    // next apt command or by Snapshot now.
    // Under the same gate as the first-boot snapshot: a boot that left the
    // snapshot alone (?safe=1, recovering) does not write over it here either,
    // and says so where the Machine tab reads.
    if (APT_INSTALL.test(cmd)) next.then(() => this.keptSnapshot ? this.refuseSnapshot('apt install') : this.snapshot('apt install').catch(() => {}), () => {});   // the failure is on VM.snapshotError
    return next;
  },

  // Ctrl-C on the serial line: SIGINT to whatever the shell is running. The
  // exec waiting on that command must reject too: ash drops the ` echo mark`
  // queued behind an interrupted command (measured in exec-timeout.mjs), so
  // without this stamp the Terminal's 600 s exec would sit out its whole
  // timeout on a line that was free after one keypress.
  interrupt() {
    if (this.state !== 'ready') throw new Error('Linux is not running yet.');
    this.interruptedAt = Date.now();
    this.emu.serial0_send('\x03');
  },

  // The shell is back at its line editor once the serial line ends in its
  // prompt. Bounded: a program that ignores SIGINT never gets there.
  async _atPrompt(maxMs) {
    const t0 = Date.now();
    while (!PROMPT_TAIL.test(this.serial.slice(-80))) {
      if (Date.now() - t0 > maxMs) return false;
      await new Promise(r => setTimeout(r, 60));
    }
    return true;
  },

  async _exec(cmd, timeoutMs) {
    // _restoring: the one command that decides whether a restored machine
    // gets to be 'ready' at all, so it runs before the state says so.
    if (this.state !== 'ready' && !this._restoring) throw new Error('Linux is not running yet.');
    const mark = `__VOS${++this.seq}__`;
    const from = this.serial.length;
    this._execFrom = from;
    try {
      return await this._collect(cmd, mark, from, timeoutMs);
    } finally {
      this._execFrom = null;
    }
  },

  async _collect(cmd, mark, from, timeoutMs) {
    this.emu.serial0_send(`${cmd}\n echo ${mark}\n`);
    const t0 = Date.now();
    for (;;) {
      const out = execResult(this.serial.slice(from), cmd, mark);
      if (out !== null) return out;
      const interrupted = this.interruptedAt > t0;
      if (interrupted || Date.now() - t0 > timeoutMs) {
        // The command is still holding the one serial line; leave it and every
        // later exec waits behind it. Ctrl-C frees it, and ash drops the
        // ` echo mark` it had buffered behind the command (measured: the mark
        // of an interrupted exec never reaches the line). Then wait for the
        // prompt before the next exec types: bytes sent while the tty is still
        // cooked are echoed once by the tty and again by the line editor, and
        // the tty's echo of ` echo mark` used to pass for the result.
        // Someone else's Ctrl-C (the Terminal's) already sent the \x03; the
        // same wait applies, and the error says whose it was.
        if (!interrupted) this.interrupt();
        const back = await this._atPrompt(3000);
        const err = new Error((interrupted
          ? `interrupted: ${cmd} — Ctrl-C on the machine's shell`
          : `timed out after ${timeoutMs / 1000}s: ${cmd} — sent Ctrl-C to the machine's shell`)
          + (back ? '' : ', and the prompt did not come back within 3s'));
        err.interrupted = interrupted;
        throw err;
      }
      await new Promise(r => setTimeout(r, 120));
    }
  },
};

function loadScriptOnce(src) {
  if (window.__v86loaded) return window.__v86loaded;
  window.__v86loaded = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
  return window.__v86loaded;
}

const VM_LABEL = {
  off: 'vm off', unavailable: 'no vm', booting: 'vm starting…',
  ready: 'vm ready', failed: 'vm failed',
};

const FALLBACK_REASON = { unreachable: 'could not be fetched', timeout: 'took too long' };
// 'alpine could not be fetched — running busybox': the whole story in the pill.
function fallbackLine() {
  const f = VM.fallback;
  if (!f) return '';
  const what = `${f.from} ${FALLBACK_REASON[f.reason]}`;
  return VM.state === 'ready' ? `${what} — running ${VM.bootedImage}` : `${what} — starting ${IMAGES.busybox.label.toLowerCase()}`;
}
