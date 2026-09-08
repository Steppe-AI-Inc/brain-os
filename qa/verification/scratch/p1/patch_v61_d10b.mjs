// V61-D10, corrected closure — and the correction matters more than the finding.
//
// The first attempt did what the finding literally asked: make the preflight measure the request as
// actually serialized. Measured, every ordinary turn then came out at ~20,000 tokens against a 12,000
// "hardMax", i.e. the fix would have refused every request in the product. The reason is worth recording:
//
//   SYSTEM_PROMPT is 75,296 characters — about 18,824 tokens, 57% LARGER than the entire "hard max".
//
// So SEM_AI_MAX_TOKENS = 12,000 was never a request-size limit and the provider was never anywhere near
// refusing these requests. It is a POLICY CAP ON PACK SIZE, calibrated against the compact
// {command, contextPack} measure, and it works — 12,000 pack tokens plus an 18.8k prompt is a ~31k request
// against a ~200k model context window. The mis-measurement verifier #61 found is real; the correct
// response is to NAME THE TWO LIMITS SEPARATELY rather than to conflate them, because they constrain
// different things and have wildly different thresholds.
//
//   1. PACK BUDGET (SEM_AI_MAX_TOKENS, default 12,000) — what buildContext controls, measured the way it
//      was calibrated. Exceeding it degrades context, then refuses with a stated cause. Unchanged.
//   2. PROVIDER CONTEXT WINDOW (SEM_AI_MODEL_CONTEXT_TOKENS, default 180,000) — the real ceiling on the
//      real request: system prompt + pretty-printed body + any attached image. This gate was listed as
//      UNMEASURED in the inventory. It is now measured, and it is the one an oversized image can actually
//      reach, since an image bypasses the pack budget entirely.
//
// Both numbers are reported, so a future round can see the real request size instead of inferring it.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- the pack budget goes back to the measure it was calibrated against, now explicitly named as such.
must(`  // The SAME function the preflight uses, on the same shape, including the system prompt this request will
  // carry. buildContext cannot see the caller's profile or an attached image, so it budgets for a
  // representative profile and leaves the image to the preflight — the two differ by bytes, not by kind.
  const packTokens = () => estimateRequestTokens({ profile: { id: '', role: '' }, command, contextPack: pack }, null);`,
`  // PACK SIZE, not request size. SEM_AI_MAX_TOKENS is a policy cap on how much context this function will
  // assemble, calibrated against this compact measure; the REQUEST also carries an 18.8k-token system
  // prompt and is checked separately against the provider's context window in serve() (verifier #61,
  // V61-D10). Conflating the two would refuse every turn in the product, since the prompt alone is larger
  // than this cap. Measured on the same shape the preflight's pack check uses, so the two cannot drift.
  const packTokens = () => Math.ceil(JSON.stringify({ command, contextPack: pack }).length / 4);`, 'pack budget measure');

must(`    tokenEstimate = estimateRequestTokens(
      { profile: { id: profile.id, role: profile.role }, command, contextPack },
      attachedImage ? attachedImage.base64 : null);`,
`    tokenEstimate = estimateTokens({ command, contextPack });`, 'preflight measure');

// ---- the provider context window becomes a measured gate instead of an assumed-safe one.
must(`      return json({
        error: 'Request too large',`,
`      return json({
        error: 'Request too large',
        limit: 'context pack',`, 'label pack refusal');

must(`        note: 'Nothing was changed. This is a refusal to run the turn, not a failure of an operation.',
      }, 413);
    }`,
`        note: 'Nothing was changed. This is a refusal to run the turn, not a failure of an operation.',
      }, 413);
    }
    // THE REAL REQUEST, against the real ceiling (verifier #61, V61-D10). The pack budget above governs how
    // much context this function assembles; this governs what the provider is actually sent — the system
    // prompt (18.8k tokens on its own), the pretty-printed body, and any attached image. An image bypasses
    // the pack budget entirely, so without this gate it was an unnamed input with no limit at all. The two
    // thresholds are far apart on purpose: they constrain different things.
    const requestTokens = estimateRequestTokens(
      { profile: { id: profile.id, role: profile.role }, command, contextPack },
      attachedImage ? attachedImage.base64 : null);
    const modelContextMax = Number(Deno.env.get('SEM_AI_MODEL_CONTEXT_TOKENS') || 180000);
    if (requestTokens > modelContextMax) {
      return json({
        error: 'Request too large',
        limit: 'model context window',
        reason: attachedImage
          ? 'the attached image is too large to send with this turn — attach a smaller image, or ask without it'
          : 'this turn is too large for the model to read in one request — ask about one company or one area at a time',
        requestTokens,
        systemPromptTokens: SYSTEM_PROMPT_TOKENS,
        imageAttached: !!attachedImage,
        modelContextMax,
        note: 'Nothing was changed. This is a refusal to run the turn, not a failure of an operation.',
      }, 413);
    }`, 'provider window gate');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
