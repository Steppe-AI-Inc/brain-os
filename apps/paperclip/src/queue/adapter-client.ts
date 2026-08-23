/**
 * HTTP client speaking the (now-synchronous) Agent Adapter Contract.
 * One client per agent kind; URLs come from the registry.
 *
 * `POST /run` runs the subtask inline on the adapter side and returns its
 * terminal state directly in the response — no more 202 + poll. Every
 * adapter call in this system is bounded (seconds, not minutes), so this
 * fits inside one HTTP round trip and needs no process-local run registry
 * on either side.
 */

import type { Scope } from "../schemas.js";

export type AdapterRunRequest = {
  goal_id: string;
  run_id: string;
  input: Record<string, unknown>;
  scope: Scope;
};

export type AdapterRunState = {
  status: "succeeded" | "failed";
  output?: Record<string, unknown> | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export class AdapterClient {
  constructor(public readonly baseUrl: string) {}

  /** Timeout budget matches Hermes's own internal LLM-call timeout (120s) plus headroom. */
  async run(req: AdapterRunRequest): Promise<AdapterRunState> {
    const r = await fetch(`${this.baseUrl}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(150_000),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`adapter run failed: HTTP ${r.status} ${body.slice(0, 200)}`);
    }
    return (await r.json()) as AdapterRunState;
  }
}
