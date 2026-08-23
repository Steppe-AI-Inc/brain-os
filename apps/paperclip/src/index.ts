/** Paperclip — local / Docker process entrypoint. Serverless uses api/index.ts instead. */

import { buildApp } from "./app.js";
import { config } from "./config.js";
import { close as closeDb } from "./db.js";
import { worker } from "./queue/worker.js";
import { scheduler } from "./scheduler.js";

async function main(): Promise<void> {
  const app = await buildApp();

  if (config.workerEnabled && !config.skipBootTasks) {
    worker.start({
      info: (msg) => app.log.info(msg),
      error: (err, msg) => app.log.error({ err }, msg),
    });
  } else {
    app.log.info("worker disabled (PAPERCLIP_WORKER_ENABLED=false or skipBootTasks)");
  }

  if (config.schedulerEnabled && !config.skipBootTasks) {
    scheduler.start({
      info: (msg) => app.log.info(msg),
      warn: (msg) => app.log.warn(msg),
      error: (err, msg) => app.log.error({ err }, msg),
    });
  } else {
    app.log.info("scheduler disabled (PAPERCLIP_SCHEDULER_ENABLED=false or skipBootTasks)");
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`received ${signal}, shutting down`);
    try {
      await scheduler.stop();
      await worker.stop();
      await app.close();
      await closeDb();
    } catch (err) {
      app.log.error({ err }, "shutdown error");
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ host: "0.0.0.0", port: config.port });
  } catch (err) {
    app.log.error({ err }, "failed to start");
    process.exit(1);
  }
}

void main();
