// VERIFIER #61 FINDING V61-D10. The whole point of the preflight is to know whether the request fits, and
// it was measuring something the product does not send.
//
//   measured:  estimateTokens({ command, contextPack })                       — compact JSON, no prompt
//   sent:      SYSTEM_PROMPT + JSON.stringify({profile, command, contextPack}, null, 2) + optional image
//
// Pretty-printing alone inflates the payload substantially, the system prompt is a large constant that was
// never counted, and an attached image is an entire unnamed input the inventory never listed. The verifier
// measured the gap at 2.9x to 26x. The founder's own invariant for this round is "THE ESTIMATOR MATCHES THE
// ACTUAL SERIALIZED REQUEST", and it did not.
//
// The fix measures the real shape at both places that must agree: the preflight and the pack budget. The
// budget therefore now has to fit the pack AROUND a fixed cost it cannot reduce, which is the honest
// accounting — a pack that "fits" only because the prompt was not counted never fit.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- one definition of "what the provider is actually sent", used by both measurers.
must(`function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }`,
`function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }
// THE REQUEST AS ACTUALLY SERIALIZED (verifier #61, V61-D10). Both providers send the system prompt plus a
// PRETTY-PRINTED {profile, command, contextPack}, and optionally a base64 image as a second content block.
// Measuring the compact form without the prompt understated the real request by 2.9x-26x, which is exactly
// the accounting error that produced the 2026-09-08 incident one level down. One definition, used by the
// preflight and by the pack budget, so the two can never drift apart again.
const SYSTEM_PROMPT_TOKENS = Math.ceil(SYSTEM_PROMPT.length / 4);
function estimateRequestTokens(payload: unknown, imageBase64: string | null): number {
  // null, 2 is what streamAnthropic and streamOpenAI both serialize with.
  const body = JSON.stringify(payload, null, 2) || '';
  // A base64 image is billed as image tokens, not characters; its transported size is what matters for the
  // request, and it is counted here rather than left as an unnamed input.
  const imageTokens = imageBase64 ? Math.ceil(imageBase64.length / 4) : 0;
  return SYSTEM_PROMPT_TOKENS + Math.ceil(body.length / 4) + imageTokens;
}`, 'estimator');

// ---- the preflight measures the real request.
must(`    tokenEstimate = estimateTokens({ command, contextPack });`,
`    tokenEstimate = estimateRequestTokens(
      { profile: { id: profile.id, role: profile.role }, command, contextPack },
      attachedImage ? attachedImage.base64 : null);`, 'preflight');

// ---- the budget measures the same thing, so a pack that "fits" really fits.
must(`  const packTokens = () => Math.ceil(JSON.stringify({ command, contextPack: pack }).length / 4);`,
`  // The SAME function the preflight uses, on the same shape, including the system prompt this request will
  // carry. buildContext cannot see the caller's profile or an attached image, so it budgets for a
  // representative profile and leaves the image to the preflight — the two differ by bytes, not by kind.
  const packTokens = () => estimateRequestTokens({ profile: { id: '', role: '' }, command, contextPack: pack }, null);`, 'pack budget');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
// SYSTEM_PROMPT must be defined before the estimator that measures it.
if (out.indexOf('const SYSTEM_PROMPT =') > out.indexOf('const SYSTEM_PROMPT_TOKENS')) throw new Error('SYSTEM_PROMPT_TOKENS declared before SYSTEM_PROMPT');
writeFileSync(p, out); console.log('applied', n);
