import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { handleClaudeCodeRequest } from '@/claude-code-handler';

export const clickRouter = router({
  sendToClaudeCode: publicProcedure
    .input(z.object({
      prompt: z.string(),
      context: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await handleClaudeCodeRequest(input);
      return result;
    }),
});