import { CdpSession, listTargets } from '@/server/cdp';

export const dynamic = 'force-dynamic';

/**
 * Streams the local chromium's viewport to the client as SSE frames.
 *
 * This replaces the onkernel `browser_live_view_url` iframe. There is no local
 * equivalent of that URL — CDP is a websocket protocol, not a viewable page,
 * and the target site's own X-Frame-Options would block framing it anyway. So
 * the frames come over Page.startScreencast and are painted client-side.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const browserId = searchParams.get('browserId');
  if (!browserId) {
    return new Response('browserId required', { status: 400 });
  }

  const target = (await listTargets()).find((t) => t.id === browserId);
  if (!target) {
    return new Response(`no such browser target: ${browserId}`, { status: 404 });
  }

  // The client reports the size of the pane it will paint into. Clamped so a
  // bogus value can't ask chromium for an absurd viewport.
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isFinite(v) && v > 0 ? Math.min(Math.max(Math.round(v), lo), hi) : 0;
  const viewWidth = clamp(Number(searchParams.get('w')), 320, 3840) || 1280;
  const viewHeight = clamp(Number(searchParams.get('h')), 240, 2160) || 800;

  const session = await CdpSession.attach(target.webSocketDebuggerUrl);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      session.on('Page.screencastFrame', (params) => {
        const { data, sessionId, metadata } = params as {
          data: string;
          sessionId: number;
          metadata: Record<string, number>;
        };
        // Acking is mandatory: chromium stops emitting frames if the client
        // falls behind and never acknowledges, which presents as a frozen view
        // rather than an error.
        session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
        send('frame', { data, metadata });
      });

      try {
        await session.send('Page.enable');
        // Size chromium's viewport to the pane the client is actually showing.
        // Without this the page always renders at a fixed 1280x800, so a wider
        // or taller pane letterboxes it and the page shows less content than
        // the window has room for.
        await session.send('Emulation.setDeviceMetricsOverride', {
          width: viewWidth,
          height: viewHeight,
          deviceScaleFactor: 0,
          mobile: false,
        });
        await session.send('Page.startScreencast', {
          format: 'jpeg',
          quality: 60,
          maxWidth: viewWidth,
          maxHeight: viewHeight,
          everyNthFrame: 1,
        });
        send('ready', { browserId });
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : String(error) });
        controller.close();
        session.close();
        return;
      }

      request.signal.addEventListener('abort', () => {
        session.send('Page.stopScreencast').catch(() => {});
        session.close();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      session.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
