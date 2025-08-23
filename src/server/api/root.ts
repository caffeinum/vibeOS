import { router } from './trpc';
import { filesRouter } from './routers/files';
import { gcpRouter } from './routers/gcp';
import { terminalRouter } from './routers/terminal';

export const appRouter = router({
  files: filesRouter,
  gcp: gcpRouter,
  terminal: terminalRouter,
});

export type AppRouter = typeof appRouter;