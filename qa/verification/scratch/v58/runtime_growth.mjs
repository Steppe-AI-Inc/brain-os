// VERIFIER #58 — re-measure the v46/D1 "growth exponent" red: readsAsCompletion on one unsplittable clause at 1/2/4/8/16 KB.
import { turn } from './v58_lib.mjs';
const belt = turn({ command: '', summary: 'x' }).belt;
const clause = (kb) => { let s = 'The company '; while (s.length < kb * 1024) s += 'with no active tasks and no pending approvals and nothing outstanding '; return s + 'was archived'; };
const prose = (kb) => { let s = ''; while (s.length < kb * 1024) s += 'ACME was created in 2024. Nothing was archived. Bob restored Beta last month. '; return s; };
for (const [label, gen] of [['unsplittable clause', clause], ['punctuated prose', prose]]) {
  let prev = null;
  for (const kb of [1, 2, 4, 8, 16, 32]) {
    const s = gen(kb); const N = kb <= 4 ? 20 : 5;
    belt(s); const t0 = performance.now(); for (let i = 0; i < N; i++) belt(s); const ms = (performance.now() - t0) / N;
    const e = prev ? Math.log2(ms / prev) : null; prev = ms;
    console.log(`${label} ${kb} KB (${s.length} chars): ${ms.toFixed(2)} ms/call${e !== null ? `  growth per doubling e=${e.toFixed(2)}` : ''}`);
  }
}
