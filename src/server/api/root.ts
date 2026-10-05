import { router } from './trpc';
import { filesRouter } from './routers/files';
import { gcpRouter } from './routers/gcp';
import { terminalRouter } from './routers/terminal';
import { dedalusRouter } from './routers/dedalus';
import { browserUseRouter } from './routers/browser-use';
import { localBrowserRouter } from './routers/local-browser';

export const appRouter = router({
  files: filesRouter,
  gcp: gcpRouter,
  terminal: terminalRouter,
  dedalus: dedalusRouter,
  browserUse: browserUseRouter,
  localBrowser: localBrowserRouter,
});

export type AppRouter = typeof appRouter;