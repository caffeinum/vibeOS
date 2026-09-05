// Raw TCP for apps, through the relay the machine uses.
//
// A browser tab has no sockets. The guest gets its TCP over WISP
// (app/api/wisp/route.ts): one WebSocket to the relay, every TCP connection
// a stream on it. Net is the same protocol on a second WebSocket of its own,
// dialed with the native constructor so VM.watchRelay's wrapper never claims
// it — that wrapper assigns whatever it wraps to VM.relaySocket, and a second
// claimant would have swapped the link the machine is watched through. The
// socket is a RelaySocket (kernel/machine.js): it redials in place when the
// Vercel function ends at maxDuration, replays what was sent in the gap and
// hands back a CLOSE (reason 3) for every stream open at the drop, which is
// exactly the contract a stream here wants. HTTP is not this: the proxy and
// the Browser already fetch pages; this is for a redis, irc or smtp toy.
//
// WISP v1 frames: type u8, stream id u32 LE, payload. CONNECT 1 (stream
// type u8 = 1 TCP, port u16 LE, hostname utf-8), DATA 2, CONTINUE 3 (buffer
// remaining u32 LE; on stream 0 right after the socket opens it is the
// per-stream send buffer), CLOSE 4 (reason u8). Stream ids are ours to pick
// and only need to be unique on this socket; the guest's live on v86's.
//
// The relay refuses localhost, *.local, *.internal, loopback and private
// addresses and every port but a short list, by closing the stream with
// 0x48 and no words. The same rules are checked here first (Net.refusal),
// so a blocked connect throws naming the rule instead of a stream that dies
// a round trip later saying only "blocked".

// Captured before the machine wraps window.WebSocket. net.js runs after
// machine.js and before boot(), which is where watchRelay() wraps.
const NativeWebSocket = window.WebSocket;
if (window.__wsWrapped) throw new Error('kernel/net.js loaded after the relay wrapper: its socket would be claimed as the machine\'s');

const NET_PORTS = [80, 443, 21, 22, 70, 1965, 3000, 8080, 8443];
const NET_HOST_RULES = [/^localhost$/i, /\.local$/i, /\.internal$/i, /^metadata\.google\.internal$/i];
// Reasons the relay (wisp-js) puts in a CLOSE, in words an app can show.
// 0x03 is wisp-js's generic NetworkError: the relay sends it for ANY stream
// setup that failed — a name that does not resolve, an unreachable host, a
// refused connect (connection.mjs, the catch around stream.setup()).
// RelaySocket hands back the same byte for a stream open at a redial, so
// which one it was is decided by `lost` on the stream (set from the link
// transition), not by the byte.
const NET_CLOSE_REASONS = {
  0x01: 'closed (unspecified)', 0x02: 'closed by the peer', 0x03: 'network error: the host could not be reached',
  0x41: 'the relay refused the connect request (invalid info)', 0x42: 'host unreachable', 0x43: 'no response from the host',
  0x44: 'connection refused', 0x47: 'transfer timed out', 0x48: 'blocked by the relay: localhost, private and loopback addresses and ports outside its list are refused',
  0x49: 'throttled by the relay: too many open connections',
};

const Net = {
  socket: null,            // the RelaySocket of the moment, or null before the first connect
  url: '',                 // the wss:// URL it dialed
  link: '',                // what it reports: connecting | open | reconnecting | dead
  streams: new Map(),      // id -> stream, open or not yet closed by both sides
  nextId: 1,
  bufferSize: 0,           // per-stream send credit the relay announced on stream 0
  pending: [],             // frames sent before the first open; RelaySocket only holds frames across a gap
  listeners: new Set(),

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.listeners.forEach(fn => { try { fn(this.link); } catch (e) { console.error(e); } }); },

  // The relay the machine dialed this boot, else the setting; '' means
  // networking is off and there is nothing to open a stream on.
  get relayUrl() { return VM.bootedRelay || VM.relay; },
  get available() { return !!this.relayUrl; },

  // Why the relay would refuse host:port, or null. Mirrors
  // app/api/wisp/route.ts: hostname_blacklist, port_whitelist,
  // allow_loopback_ips = allow_private_ips = false. A name that resolves to
  // a private address is only the relay's to catch (CLOSE 0x48).
  refusal(host, port) {
    const rule = NET_HOST_RULES.find(r => r.test(host));
    if (rule) return `${host} is blocked by the relay's hostname blacklist (${rule})`;
    if (!NET_PORTS.includes(port)) return `port ${port} is not in the relay's port whitelist (${NET_PORTS.join(', ')})`;
    const range = blockedRange(host);
    if (range) return `${host} is a ${range} address, which the relay refuses`;
    return null;
  },

  connect(host, port, { tls = false } = {}) {
    if (typeof host !== 'string' || !host) throw new Error('Net.connect: host must be a non-empty string');
    if (/\s/.test(host)) throw new Error('Net.connect: host must not contain whitespace: ' + JSON.stringify(host));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Net.connect: port must be an integer 1..65535');
    if (tls) throw new Error('Net.connect: tls is not provided; the relay carries plain TCP. For https use fetch through the proxy, or curl inside the machine');
    if (!this.available) throw new Error('networking is off: Settings › Network turns the relay on');
    const why = this.refusal(host, port);
    if (why) throw new Error('refused: ' + why);
    const socket = this.ensureSocket();
    const id = this.nextId++;
    const stream = new NetStream(this, socket, id, host, port);
    this.streams.set(id, stream);
    this.sendFrame(socket, connectFrame(id, host, port));
    return stream;
  },

  ensureSocket() {
    if (this.socket && !this.socket.ended) return this.socket;
    const url = this.relayUrl.replace(/^wisps:/, 'wss:').replace(/^wisp:/, 'ws:');
    if (!/^wss?:/.test(url)) throw new Error('the relay URL is not a websocket URL: ' + JSON.stringify(this.relayUrl));
    this.url = url;
    this.pending = [];
    // A stream open when the link drops is tagged with the transition, so
    // the CLOSE(3) RelaySocket dispatches for it once the redial lands (or
    // the link dies) reads as the reconnect, not as an unreachable host.
    const onLink = link => {
      this.link = link;
      if (link === 'reconnecting' || link === 'dead') for (const s of this.streams.values()) if (s.socket === socket) s.lost = link;
      this.emit();
    };
    const socket = new RelaySocket(url, NativeWebSocket, { onLink });
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('open', () => {
      const frames = this.pending; this.pending = [];
      for (const f of frames) socket.send(f);
    });
    socket.addEventListener('message', e => this.receive(socket, e.data));
    socket.addEventListener('close', () => {
      // RelaySocket has already dispatched a CLOSE(3) for every stream it
      // knew; whatever is still open never got its CONNECT out.
      for (const s of [...this.streams.values()]) if (s.socket === socket) s.ended(0x03, 'network error: the relay could not be reached');
      this.pending = [];
    });
    this.socket = socket;
    return socket;
  },

  // Before the first open the native socket is CONNECTING and send() throws;
  // after it, RelaySocket holds frames across a gap itself.
  sendFrame(socket, frame) {
    if (socket.ended) throw new Error('the relay socket is closed');
    if (!socket.opened) this.pending.push(frame); else socket.send(frame);
  },

  receive(socket, data) {
    if (!(data instanceof ArrayBuffer)) throw new Error('Net: the relay sent a non-binary frame: ' + Object.prototype.toString.call(data));
    const u8 = new Uint8Array(data);
    if (u8.length < 5) throw new Error('Net: the relay sent a ' + u8.length + '-byte frame');
    const type = u8[0];
    const id = new DataView(data).getUint32(1, true);
    if (id === 0) {
      if (type === 3) { this.bufferSize = new DataView(data).getUint32(5, true); for (const s of this.streams.values()) if (s.socket === socket) s.credit = this.bufferSize; }
      return;
    }
    const stream = this.streams.get(id);
    if (!stream) return;   // a late frame for a stream the app already closed
    if (type === 2) stream.deliver(u8.subarray(5));
    else if (type === 3) stream.continued(new DataView(data).getUint32(5, true));
    else if (type === 4) stream.ended(u8[5], closeReason(stream, u8[5]));
    else throw new Error('Net: unknown WISP frame type ' + type + ' on stream ' + id);
  },
};

class NetStream {
  constructor(net, socket, id, host, port) {
    this.net = net; this.socket = socket; this.id = id; this.host = host; this.port = port;
    this.state = 'open';           // open | closed
    this.reason = '';              // why it closed, in words
    this.code = 0;                 // the WISP reason byte, 0 for a close from this side
    this.credit = net.bufferSize;  // DATA frames the relay will take before a CONTINUE
    this.lost = '';                // 'reconnecting' | 'dead' once the link dropped under it
    this.queue = [];               // DATA frames waiting on credit
    this.dataHandlers = new Set();
    this.closeHandlers = new Set();
  }
  write(data) {
    if (this.state !== 'open') throw new Error(`the connection to ${this.host}:${this.port} is closed (${this.reason})`);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data)
      : data instanceof Uint8Array ? data
      : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
    if (!bytes) throw new Error('write() takes a string, a Uint8Array or an ArrayBuffer');
    const frame = new Uint8Array(5 + bytes.length);
    frame[0] = 2; new DataView(frame.buffer).setUint32(1, this.id, true); frame.set(bytes, 5);
    // Credit is unknown until the relay's first CONTINUE, which lands before
    // any stream could have been answered: send, and let the relay's queue
    // absorb it.
    if (this.credit > 0 || this.net.bufferSize === 0) { if (this.credit > 0) this.credit--; this.net.sendFrame(this.socket, frame); }
    else this.queue.push(frame);
  }
  continued(remaining) {
    this.credit = remaining;
    while (this.credit > 0 && this.queue.length) { this.credit--; this.net.sendFrame(this.socket, this.queue.shift()); }
  }
  deliver(bytes) {
    const copy = new Uint8Array(bytes);
    this.dataHandlers.forEach(fn => fn(copy));
  }
  onData(fn) { this.dataHandlers.add(fn); return () => this.dataHandlers.delete(fn); }
  onClose(fn) { if (this.state === 'closed') fn(this.reason, this.code); this.closeHandlers.add(fn); return () => this.closeHandlers.delete(fn); }
  // Closed by the app: a voluntary CLOSE goes to the relay if it can still
  // take one; a stream on a socket that is gone has nothing to tell.
  close() {
    if (this.state === 'closed') return;
    if (!this.socket.ended) this.net.sendFrame(this.socket, closeFrame(this.id, 0x02));
    this.ended(0, 'closed by the app');
  }
  ended(code, reason) {
    if (this.state === 'closed') return;
    this.state = 'closed'; this.code = code; this.reason = reason; this.queue = [];
    this.net.streams.delete(this.id);
    this.closeHandlers.forEach(fn => { try { fn(reason, code); } catch (e) { console.error(e); } });
  }
}

function closeReason(stream, code) {
  if (code === 0x03 && stream.lost === 'reconnecting') return 'network error: the relay reconnected and the connection was lost';
  if (code === 0x03 && stream.lost === 'dead') return 'network error: the relay could not be reached';
  return NET_CLOSE_REASONS[code] || ('closed by the relay, reason 0x' + code.toString(16));
}
function connectFrame(id, host, port) {
  const name = new TextEncoder().encode(host);
  const f = new Uint8Array(8 + name.length);
  const v = new DataView(f.buffer);
  f[0] = 1; v.setUint32(1, id, true); f[5] = 1; v.setUint16(6, port, true); f.set(name, 8);
  return f;
}
function closeFrame(id, reason) {
  const f = new Uint8Array(6);
  const v = new DataView(f.buffer);
  f[0] = 4; v.setUint32(1, id, true); f[5] = reason;
  return f;
}

// The ipaddr.js ranges wisp-js refuses (loopback, unspecified, private,
// linkLocal, carrierGradeNat, broadcast, reserved), for an address literal.
function blockedRange(host) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    if (a === 127) return 'loopback';
    if (a === 0) return 'unspecified';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade NAT';
    if (host === '255.255.255.255') return 'broadcast';
    if (a >= 240 || a === 192 && b === 0 && v4[3] === '0' || a === 192 && b === 0 && v4[3] === '2' || a === 198 && b === 51 && v4[3] === '100' || a === 203 && b === 0 && v4[3] === '113') return 'reserved';
    return null;
  }
  const v6 = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!v6.includes(':')) return null;
  if (v6 === '::1') return 'loopback';
  if (v6 === '::') return 'unspecified';
  if (/^fe[89ab]/.test(v6)) return 'link-local';
  if (/^f[cd]/.test(v6)) return 'private';
  if (/^::ffff:/.test(v6)) return blockedRange(v6.slice(7));
  return null;
}
