import { router } from './trpc';
import { cryptoRouter } from './routers/crypto';
import { filesRouter } from './routers/files';
import { gcpRouter } from './routers/gcp';
import { terminalRouter } from './routers/terminal';
import { kernelRouter } from './routers/kernel';
import { dedalusRouter } from './routers/dedalus';
import { browserUseRouter } from './routers/browser-use';

export const appRouter = router({
  crypto: cryptoRouter,
  files: filesRouter,
  gcp: gcpRouter,
  terminal: terminalRouter,
  kernel: kernelRouter,
  dedalus: dedalusRouter,
  browserUse: browserUseRouter,
});

export type AppRouter = typeof appRouter;