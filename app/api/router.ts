import { createRouter, publicQuery } from "./middleware";
import { intentlockRouter } from "./routers/intentlock";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  intentlock: intentlockRouter,
});

export type AppRouter = typeof appRouter;
