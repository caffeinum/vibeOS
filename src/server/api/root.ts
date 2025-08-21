import { router } from './trpc';
import { clickRouter } from './routers/click';
import { filesRouter } from './routers/files';
import { gcpRouter } from './routers/gcp';

export const appRouter = router({
  click: clickRouter,
  files: filesRouter,
  gcp: gcpRouter,
});

export type AppRouter = typeof appRouter;