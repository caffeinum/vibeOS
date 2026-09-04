/**
 * Minimal Chrome DevTools Protocol client for the local chromium started by
 * scripts/browser-supervise.sh.
 *
 * The endpoint is loopback-only and MUST stay that way: an unauthenticated CDP
 * port is equivalent to remote code execution and can navigate file:// to read
 * this container's filesystem. Everything here runs server-side so the browser
 * never learns the CDP address, and no caller can supply one.
 */

const CDP_HOST = "127.0.0.1";
const CDP_PORT = process.env.CHROME_CDP_PORT ?? "9222";

export const cdpBase = `http://${CDP_HOST}:${CDP_PORT}`;

export type CdpTarget = {
  id: string;
  type: string;
  url: string;
  title: string;
  webSocketDebuggerUrl: string;
};

async function cdpFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${cdpBase}${path}`, init);
  if (!res.ok) {
    throw new Error(
      `CDP ${path} failed: ${res.status} ${res.statusText}. Is chromium running? ` +
        `scripts/browser-supervise.sh should keep it alive on ${cdpBase}.`
    );
  }
  return res;
}

/** Proves the endpoint answers, not merely that a chromium process exists. */
export async function version(): Promise<{ Browser: string; webSocketDebuggerUrl: string }> {
  return (await cdpFetch("/json/version")).json();
}

export async function listTargets(): Promise<CdpTarget[]> {
  return (await cdpFetch("/json/list")).json();
}

export async function createTarget(url = "about:blank"): Promise<CdpTarget> {
  // chromium requires PUT here; GET is rejected on recent versions.
  return (await cdpFetch(`/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
}

export async function closeTarget(targetId: string): Promise<void> {
  await cdpFetch(`/json/close/${targetId}`);
}

/**
 * A single CDP websocket session against one page target.
 *
 * Callers never construct the URL — it comes from the target list, which comes
 * from the loopback endpoint above.
 */
export class CdpSession {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String((event as MessageEvent).data));
      if (typeof msg.id === "number") {
        const slot = this.pending.get(msg.id);
        if (!slot) return;
        this.pending.delete(msg.id);
        if (msg.error) slot.reject(new Error(`CDP error: ${JSON.stringify(msg.error)}`));
        else slot.resolve(msg.result);
        return;
      }
      const handlers = this.listeners.get(msg.method);
      if (handlers) for (const h of handlers) h(msg.params ?? {});
    });
  }

  static async attach(webSocketDebuggerUrl: string): Promise<CdpSession> {
    const ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("CDP websocket failed to open")), {
        once: true,
      });
    });
    return new CdpSession(ws);
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method: string, handler: (params: Record<string, unknown>) => void): () => void {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method)!.add(handler);
    return () => this.listeners.get(method)?.delete(handler);
  }

  get closed(): boolean {
    return this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING;
  }

  close(): void {
    this.ws.close();
  }
}
