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
