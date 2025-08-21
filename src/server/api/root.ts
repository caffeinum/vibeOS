import { router } from './trpc';
import { clickRouter } from './routers/click';

export const appRouter = router({
  click: clickRouter,
});

export type AppRouter = typeof appRouter;