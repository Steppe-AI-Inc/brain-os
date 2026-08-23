/**
 * One-off migration runner for serverless deploys.
 *
 * Run this once against the target database *before* the first deploy (or
 * after pulling schema changes) instead of letting the app run the same
 * additive migrations on every cold start:
 *
 *   DATABASE_URL=... npx tsx scripts/migrate.ts
 *
 * Safe to re-run any time — every statement in ADDITIVE_MIGRATIONS is
 * idempotent (IF NOT EXISTS / IF EXISTS guards).
 */

import { applyAdditiveMigrations, ensureDefaultAgents } from "../src/bootstrap.js";
import { close as closeDb } from "../src/db.js";

async function main(): Promise<void> {
  const log = {
    info: (msg: string) => console.log(`[migrate] ${msg}`),
    warn: (msg: string) => console.warn(`[migrate] ${msg}`),
  };

  await applyAdditiveMigrations(log);
  await ensureDefaultAgents(log);

  await closeDb();
  console.log("[migrate] done");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
