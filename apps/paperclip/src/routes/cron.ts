/**
 * Serverless replacement for the in-process worker/scheduler tick loops.
 *
 * GET /api/cron/worker-tick — drains `ops.run` (status='queued') by calling
 * `claimAndDispatchOnce()` repeatedly until the queue is empty or a time
 * budget is spent, then returns. Point a Vercel Cron job (or, on plans
 * without minute-granularity cron, an external pinger like cron-job.org) at
 * this endpoint on a short interval (e.g. every 1 minute) to replace the
 * old always-on worker. Vercel Cron always calls with GET; POST works too
 * (same handler) for manual testing.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the
 * project has a `CRON_SECRET` env var set — this handler requires the same
 * header so the endpoint can't be triggered by an outsider who finds the URL.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../config.js";
import { claimAndDispatchOnce } from "../queue/worker.js";

const TIME_BUDGET_MS = 45_000;

export async function cronRoutes(app: FastifyInstance): Promise<void> {
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!config.cronSecret) {
      return reply.code(503).send({ error: "cron_disabled", hint: "set CRON_SECRET" });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${config.cronSecret}`) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const startedAt = Date.now();
    let claimed = 0;
    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      const did = await claimAndDispatchOnce({
        info: (msg) => app.log.info(msg),
        warn: (msg) => app.log.warn(msg),
        error: (err, msg) => app.log.error({ err }, msg),
      });
      if (!did) break;
      claimed++;
    }

    return reply.send({ ok: true, runs_processed: claimed, elapsed_ms: Date.now() - startedAt });
  };

  app.get("/api/cron/worker-tick", handler);
  app.post("/api/cron/worker-tick", handler);
}
