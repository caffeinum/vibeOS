import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import Kernel from '@onkernel/sdk';

export const kernelRouter = router({
  createBrowser: publicProcedure
    .input(z.object({
      apiKey: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log('[kernel/createBrowser] Creating browser...');
      
      const client = new Kernel({
        apiKey: input.apiKey
      });

      try {
        const browser = await client.browsers.create();
        console.log('[kernel/createBrowser] Browser created successfully:', browser);

        // Use type assertion to access properties
        const browserData = browser as any;

        return {
          id: browserData.id || browserData.browser_id || browserData.browserId,
          cdp_ws_url: browserData.cdp_ws_url || browserData.cdpWsUrl,
          browser_live_view_url: browserData.browser_live_view_url || browserData.browserLiveViewUrl,
          status: 'running' as const
        };
      } catch (error) {
        console.error('[kernel/createBrowser] Error:', error);
        throw new Error(`Failed to create browser: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }),

  closeBrowser: publicProcedure
    .input(z.object({
      apiKey: z.string(),
      browserId: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log('[kernel/closeBrowser] Closing browser:', input.browserId);

      try {
        // Use direct API call for now to avoid SDK method issues
        const response = await fetch(`https://api.onkernel.com/v1/browsers/${input.browserId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${input.apiKey}`
          }
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to close browser: ${response.status} ${errorData}`);
        }

        console.log('[kernel/closeBrowser] Browser closed successfully');
        return { success: true };
      } catch (error) {
        console.error('[kernel/closeBrowser] Error:', error);
        throw new Error(`Failed to close browser: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }),
});