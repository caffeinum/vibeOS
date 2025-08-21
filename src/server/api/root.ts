import { router } from './trpc';
import { clickRouter } from './routers/click';
import { filesRouter } from './routers/files';

export const appRouter = router({
  click: clickRouter,
  files: filesRouter,
});

export type AppRouter = typeof appRouter;