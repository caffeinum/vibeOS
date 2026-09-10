// Where the disk images are fetched from. Empty here on purpose.
//
// The hosted build ships this file with no entries, so machine.js falls
// through to its own ALPINE_BASE / DEBIAN_BASE and nothing changes. The
// self-contained container REPLACES this file at build time, pointing both
// images at the disks it carries, so `docker run` never touches the CDN.
//
// A classic script, not a module: nothing in public/app is bundled and
// kernel/machine.js cannot import.
//
// Deliberately NOT in OS_FILES. If it were forkable, a person's forked
// machine.js would carry a stale copy of WHERE the disks live and their VM
// would stop booting for a reason unrelated to what they edited. Keeping it
// out means a fork changes behaviour, never plumbing.
window.__vibeosImageBases = {};

// Where a pairing dials. Empty here on purpose, the same contract as the
// disks above: the hosted page falls through to MCP_RELAY_URL (the durable
// AWS relay), and the self-contained container REPLACES this with its own
// origin relay.
//
// It exists because the container serves a relay of its own and the desktop
// was not using it: relayUrl() returned the AWS API Gateway and only reached
// the origin after a dial FAILED to open, which on a box with working
// internet never happens — so every frame between a local agent and a local
// desktop transited infrastructure the self-hoster does not run. Measured by
// the vibeos-docker agent against the published rc1 image.
//
// A container default is ABSOLUTE: it never falls back to the AWS relay. The
// point of the image is that nothing goes to us, and a silent fallback would
// break that exactly when the network is worst — which is the moment someone
// would least notice.
window.__vibeosRelayDefault = '';

// Where the GUEST's network goes. Empty here on purpose, same contract again.
//
// This is the one that mattered most and was found last: NET_DEFAULT is
// hardcoded to wisps://vibeos.sh/api/wisp, so a self-contained container sent
// every packet the guest sent through our Vercel function — the opposite of
// the image's entire promise — while the check that was supposed to catch it
// reported "no request left the container", because `page.on('request')` does
// not report a WebSocket upgrade. A check blind to the protocol that carries
// the traffic is not a check on the traffic.
//
// Origin-relative ('/api/wisp'): the container resolves it against the page,
// so it follows whatever port `-p` published, and cannot name a port on
// whoever is looking. v86 picks its adapter by scheme and rewrites it —
// measured in the vendored libv86.js: `.replace("wisp://","ws://")
// .replace("wisps://","wss://")` — so an https page gets `wisps://` and an
// http one `wisp://`, and both reach the WISP adapter with DHCP. A plain
// `wss://` would select v86's other adapter, which has no DHCP at all.
window.__vibeosNetDefault = '';
