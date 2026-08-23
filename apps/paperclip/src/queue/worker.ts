/**
 * Queue worker.
 *
 * Serverless-safe by construction: `claimAndDispatchOnce()` claims one
 * queued run, dispatches it to its adapter **synchronously**, and resolves
 * it (succeed/fail) before returning — no in-memory poll state, no
 * background task that could outlive a function invocation.
 *
 * Two callers:
 *   - `routes/cron.ts` (serverless): a Vercel Cron hit calls
 *     `claimAndDispatchOnce()` in a loop until the queue is empty or a time
 *     budget is spent, then returns.
 *   - `Worker` (local / Docker): keeps the old always-on tick loop for
 *     convenience, just calling the same synchronous function on each tick
 *     instead of the old dispatch-then-background-poll flow.
 *
 * Selection rule: a subtask may carry `subtask.agent_kind`. If unset, fall
 * back to "hermes". A row in ops.agent of that kind (active) becomes
 * `agent_id` on the run.
 *
 * RLS / scope:
 *   The initial claim has to scan ops.run across orgs (we don't know which
 *   org has work until we find it). That step uses `withSystemScope`. Once
 *   the run + its parent goal are claimed, every subsequent DB touch
 *   (agent lookup, succeed/fail, audit) uses `withOrgScope(goal.org_id, ...)`.
 */

import { audit } from "../audit.js";
import { config } from "../config.js";
import { withOrgScope, withSystemScope } from "../db.js";
import { recordRunWrapUp } from "../runs/wrap-up.js";
import type { Scope } from "../schemas.js";
import { cascadeFromRun } from "../swarms/dispatch.js";
import { replyToChannelOnTerminal } from "./channel-replies.js";
import { getAdapter, knownKinds } from "./registry.js";

type Logger = {
  info: (msg: string) => void;
  warn?: (msg: string) => void;
  error: (err: unknown, msg: string) => void;
};

type SubtaskShape = {
  index: number;
  title: string;
  description: string;
  input: Record<string, unknown>;
  agent_kind?: string;
};

type WorkerGoal = {
  id: string;
  org_id: string;
  department_id: string | null;
  title: string;
};

function scopeFor(goal: WorkerGoal): Scope {
  return {
    org_id: goal.org_id,
    department_id: goal.department_id,
    goal_id: goal.id,
    role: "agent",
  };
}

/**
 * Claim one queued run and dispatch it to its adapter synchronously.
 * Returns `false` when the queue is empty (nothing to do), `true` otherwise
 * — callers loop on `true` to drain a backlog within one invocation.
 */
export async function claimAndDispatchOnce(log: Logger): Promise<boolean> {
  type ClaimedRun = { id: string; goal_id: string; input: Record<string, unknown> };
  type ClaimedGoal = { id: string; org_id: string; department_id: string | null; title: string };

  const claim = await withSystemScope(async (client) => {
    const { rows } = await client.query<ClaimedRun>(
      `
      UPDATE ops.run
      SET status = 'running', started_at = now()
      WHERE id = (
        SELECT id FROM ops.run
        WHERE status = 'queued'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, goal_id, input
      `,
    );
    if (rows.length === 0) return undefined;
    const run = rows[0]!;
    const { rows: goalRows } = await client.query<ClaimedGoal>(
      "SELECT id, org_id, department_id, title FROM ops.goal WHERE id = $1",
      [run.goal_id],
    );
    if (goalRows.length === 0) {
      await client.query(
        "UPDATE ops.run SET status = 'failed', error = $2, finished_at = now() WHERE id = $1",
        [run.id, "goal not found"],
      );
      return undefined;
    }
    return { run, goal: goalRows[0]! };
  });

  if (!claim) return false;
  const { run, goal } = claim;

  const subtask = (run.input as { subtask?: SubtaskShape }).subtask;
  if (!subtask) {
    await fail(run.id, goal, "missing subtask in input");
    return true;
  }

  const kind = subtask.agent_kind ?? "hermes";
  const adapter = getAdapter(kind);
  if (!adapter) {
    await fail(run.id, goal, `no adapter registered for kind '${kind}'`);
    return true;
  }

  // Pick (or null) an active agent of this kind for the audit trail.
  await withOrgScope(goal.org_id, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM ops.agent
       WHERE org_id = $1 AND kind = $2 AND is_active = true
       ORDER BY created_at LIMIT 1`,
      [goal.org_id, kind],
    );
    const found = rows[0]?.id ?? null;
    if (found !== null) {
      await client.query("UPDATE ops.run SET agent_id = $2 WHERE id = $1", [run.id, found]);
    }
  });

  const scope: Scope = {
    org_id: goal.org_id,
    department_id: goal.department_id,
    goal_id: goal.id,
    role: "agent",
  };

  // Phase 9.1 — load the goal's context document, if any.
  const goalContext = await withOrgScope(goal.org_id, async (client) => {
    const { rows } = await client.query<{ content_md: string }>(
      "SELECT content_md FROM ops.goal_context WHERE goal_id = $1",
      [goal.id],
    );
    const md = rows[0]?.content_md?.trim();
    return md && md.length > 0 ? md : null;
  });

  const subtaskWithContext = goalContext
    ? { ...subtask, input: { ...subtask.input, goal_context: goalContext } }
    : subtask;

  try {
    const state = await adapter.run({
      goal_id: goal.id,
      run_id: run.id,
      input: { subtask: subtaskWithContext },
      scope,
    });
    log.info(`dispatched run ${run.id} to ${kind} → ${state.status}`);
    if (state.status === "succeeded") {
      await succeed(run.id, goal, state.output ?? {});
    } else {
      await fail(run.id, goal, state.error ?? "agent reported failure");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(err, `dispatch to ${kind} failed`);
    await fail(run.id, goal, `dispatch to ${kind} failed: ${message}`);
  }

  return true;
}

async function succeed(
  runId: string,
  goal: WorkerGoal,
  output: Record<string, unknown>,
): Promise<void> {
  await withOrgScope(goal.org_id, async (client) => {
    await client.query(
      `UPDATE ops.run
       SET status = 'succeeded', output = $2::jsonb, finished_at = now()
       WHERE id = $1`,
      [runId, JSON.stringify(output)],
    );
    await audit(
      {
        scope: scopeFor(goal),
        action: "run.succeeded",
        target_type: "run",
        target_id: runId,
        metadata: { goal_id: goal.id, ...(output.memory_id ? { memory_id: output.memory_id } : {}) },
      },
      client,
    );
    try {
      await cascadeFromRun(client, runId, "succeeded", output, null, scopeFor(goal));
    } catch {
      // Cascade failures don't roll back the run's success.
    }
    try {
      await replyToChannelOnTerminal(client, goal.id, "succeeded", output, null);
    } catch {
      // channel-replies handles its own logging
    }
    try {
      const subtask = (output as { agent_kind?: unknown }).agent_kind;
      await recordRunWrapUp(client, {
        runId,
        goalId: goal.id,
        goalTitle: goal.title,
        departmentId: goal.department_id,
        agentKind: typeof subtask === "string" ? subtask : null,
        status: "succeeded",
        output,
        error: null,
      });
    } catch {
      // best-effort
    }
  });
}

async function fail(runId: string, goal: WorkerGoal, error: string): Promise<void> {
  await withOrgScope(goal.org_id, async (client) => {
    await client.query(
      `UPDATE ops.run
       SET status = 'failed', error = $2, finished_at = now()
       WHERE id = $1`,
      [runId, error],
    );
    await audit(
      {
        scope: scopeFor(goal),
        action: "run.failed",
        target_type: "run",
        target_id: runId,
        metadata: { goal_id: goal.id, error },
      },
      client,
    );
    try {
      await cascadeFromRun(client, runId, "failed", null, error, scopeFor(goal));
    } catch {
      // best-effort
    }
    try {
      await replyToChannelOnTerminal(client, goal.id, "failed", null, error);
    } catch {
      // swallow
    }
    try {
      await recordRunWrapUp(client, {
        runId,
        goalId: goal.id,
        goalTitle: goal.title,
        departmentId: goal.department_id,
        agentKind: null,
        status: "failed",
        output: null,
        error,
      });
    } catch {
      // best-effort
    }
  });
}

/** Local / Docker convenience: an always-on tick loop over `claimAndDispatchOnce`. */
export class Worker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private busy = false;

  start(log: Logger): void {
    if (this.running) return;
    this.running = true;
    log.info(
      `paperclip worker started (poll=${config.workerPollIntervalMs}ms, kinds=[${knownKinds().join(", ")}])`,
    );
    const tick = async (): Promise<void> => {
      if (!this.running) return;
      let claimedSomething = false;
      if (!this.busy) {
        this.busy = true;
        try {
          claimedSomething = await claimAndDispatchOnce(log);
        } catch (err) {
          log.error(err, "worker tick failed");
        } finally {
          this.busy = false;
        }
      }
      if (this.running) {
        // Drain immediately if there might be more queued work; otherwise
        // wait the normal poll interval.
        this.timer = setTimeout(tick, claimedSomething ? 50 : config.workerPollIntervalMs);
      }
    };
    this.timer = setTimeout(tick, 200);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    for (let i = 0; i < 40 && this.busy; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

export const worker = new Worker();
