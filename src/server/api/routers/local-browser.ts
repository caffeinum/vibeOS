import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { closeTarget, createTarget, listTargets, version } from '../../cdp';

/**
 * Local chromium over CDP, replacing the onkernel cloud browser.
 *
 * The CDP websocket URL is derived server-side from the loopback endpoint and
 * handed to callers by target id only. It is deliberately NOT accepted as
 * input: the kernel router took a client-supplied cdp url, which was harmless
 * when it addressed a per-user remote browser and would be a hole now that a
 * local CDP endpoint exists.
 */
export const localBrowserRouter = router({
  /** Liveness. Asserts the endpoint answers, not that a process exists. */
  status: publicProcedure.query(async () => {
    try {
      const v = await version();
      return { ready: true as const, browser: v.Browser };
    } catch (error) {
      return {
        ready: false as const,
        error: error instanceof Error ? error.message : 'chromium unreachable',
      };
    }
  }),

  createBrowser: publicProcedure
    .input(z.object({ url: z.string().url().optional() }).optional())
    .mutation(async ({ input }) => {
      const target = await createTarget(input?.url ?? 'about:blank');
      console.log('[local-browser] created target', target.id);
      return { id: target.id, status: 'running' as const };
    }),

  closeBrowser: publicProcedure
    .input(z.object({ browserId: z.string() }))
    .mutation(async ({ input }) => {
      await closeTarget(input.browserId);
      console.log('[local-browser] closed target', input.browserId);
      return { success: true };
    }),

  navigate: publicProcedure
    .input(z.object({ browserId: z.string(), url: z.string() }))
    .mutation(async ({ input }) => {
      const { CdpSession } = await import('../../cdp');
      const target = (await listTargets()).find((t) => t.id === input.browserId);
      if (!target) throw new Error(`no such browser target: ${input.browserId}`);
      const session = await CdpSession.attach(target.webSocketDebuggerUrl);
      try {
        await session.send('Page.navigate', { url: input.url });
        return { success: true };
      } finally {
        session.close();
      }
    }),
});
