import { CdpSession, listTargets } from '@/server/cdp';

export const dynamic = 'force-dynamic';

/**
 * Forwards clicks and keystrokes from the screencast canvas into the local
 * chromium. The onkernel live-view iframe handled input for us; driving the
 * browser ourselves means dispatching it explicitly.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    browserId?: string;
    type?: 'mouse' | 'key';
    event?: Record<string, unknown>;
  };

  if (!body.browserId || !body.type || !body.event) {
    return Response.json({ error: 'browserId, type and event are required' }, { status: 400 });
  }

  const target = (await listTargets()).find((t) => t.id === body.browserId);
  if (!target) {
    return Response.json({ error: `no such browser target: ${body.browserId}` }, { status: 404 });
  }

  const session = await CdpSession.attach(target.webSocketDebuggerUrl);
  try {
    const method = body.type === 'mouse' ? 'Input.dispatchMouseEvent' : 'Input.dispatchKeyEvent';
    await session.send(method, body.event);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    session.close();
  }
}
