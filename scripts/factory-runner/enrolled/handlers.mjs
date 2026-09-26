// THE WORK AN ENROLLED NODE CAN DO in V1, by work type. A node claims ONLY the work types it has a handler for (claim.mjs's rule since
// 69df2f52): the claim names them, and the server's gates decide whether this node may take one.
//
//   probe          a real, checkpointed, resumable unit of work with a content digest: it records a checkpoint per step, resumes
//                  UNFINISHED steps only from the checkpoint a takeover hands it, and completes with its candidate content digest
//                  (candidate_tree) and commit - what the verification model certifies. It is the work the product dispatches to prove
//                  zero-touch computers run Factory work end to end (AC-1, AC-3).
//   verification   the independent verification of a probe candidate: it REPRODUCES the candidate's content from the verified work
//                  order and certifies PASS only when the reproduction equals the candidate, FAIL otherwise.
// A handler never decides authority: it runs only what the node was handed, and every write goes through the node's own session.
import { createHash } from 'node:crypto';

const sha1 = (s) => createHash('sha1').update(s).digest('hex');

/** the probe's content: a function of the work order alone, so an independent verifier can reproduce it */
export function probeContent(workOrder) {
  const spec = parseHandoff(workOrder.handoff);
  const steps = Math.max(1, Math.min(20, Number(spec.steps) || 3));
  const parts = [];
  for (let i = 1; i <= steps; i++) parts.push('step-' + i + ':' + sha1(workOrder.work_order_id + '|' + i + '|' + (spec.salt || '')));
  const tree = sha1('probe-tree|' + parts.join('|'));
  return { steps, parts, tree, commit: sha1('probe-commit|' + tree) };
}

function parseHandoff(h) { try { const j = JSON.parse(h || '{}'); return j && typeof j === 'object' ? j : {}; } catch { return {}; } }

const sleep = (ms, signal) => new Promise((ok, no) => {
  const t = setTimeout(ok, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); no(new Error('aborted: ' + (signal.reason || 'lease lost'))); }, { once: true });
});

export const HANDLERS = {
  // ctx: { api, claimed, signal, log, runtime }
  async probe(ctx) {
    const wo = ctx.claimed.work_order;
    const spec = parseHandoff(wo.handoff);
    const c = probeContent(wo);
    const stepMs = Math.max(0, Math.min(600000, Number(spec.step_ms) || 500));
    // resume unfinished work only: the checkpoint a takeover handed over says which steps are done
    const done = new Set(ctx.claimed.resume_from && ctx.claimed.resume_from.payload && Array.isArray(ctx.claimed.resume_from.payload.done)
      ? ctx.claimed.resume_from.payload.done : []);
    if (done.size) ctx.log('resuming ' + wo.work_order_id.slice(0, 8) + ' from checkpoint ' + String(ctx.claimed.resume_from.checkpoint_id).slice(0, 8) + ': ' + done.size + ' step(s) already done');
    for (let i = 1; i <= c.steps; i++) {
      const step = 'step-' + i;
      if (done.has(step)) continue;
      await sleep(stepMs, ctx.signal);
      done.add(step);
      const r = await ctx.api.op('checkpoint', { run_id: ctx.claimed.run_id, location: 'probe://' + wo.work_order_id + '/' + step, scenario: step,
        payload: { done: [...done], content: c.parts[i - 1] } });
      if (!r.ok) throw Object.assign(new Error('checkpoint refused: ' + (r.refused || r.http)), { refusal: r });
    }
    return { status: 'done', termination_reason: 'completed', head_commit: c.commit, candidate_tree: c.tree,
      summary: 'probe: ' + c.steps + ' step(s)' + (ctx.claimed.resume_from ? ' (resumed from a takeover checkpoint)' : '') };
  },

  async verification(ctx) {
    const v = ctx.claimed.verifies;
    if (!v || !v.work_order || !v.candidate) throw new Error('a verification claim without its candidate');
    const expected = probeContent(v.work_order);
    const pass = expected.tree === v.candidate.candidate_tree && expected.commit === v.candidate.head_commit;
    return { certify: { verdict: pass ? 'PASS' : 'FAIL', work_order_id: v.work_order.work_order_id, candidate_run_id: v.candidate.run_id,
      candidate_tree: v.candidate.candidate_tree, candidate_commit: v.candidate.head_commit,
      reason: pass ? 'the candidate reproduces: content digest ' + expected.tree : 'the candidate does not reproduce: expected ' + expected.tree + ', got ' + v.candidate.candidate_tree } };
  },
};

export const AUTHORING_TYPES = ['probe'];
