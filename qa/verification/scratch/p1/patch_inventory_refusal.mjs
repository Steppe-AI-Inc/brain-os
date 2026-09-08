// The whole-request size cap is no longer an opaque hard stop: it now degrades first and, when the
// irreducible part still does not fit, refuses deterministically with a stated cause and an action.
// The inventory must assert the new shape, and must still fail if a SECOND unclassified cap appears.
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/scenarios-runner/request_gate_inventory_contract.mjs';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); }

must(`{
  const preflight = src.slice(src.indexOf('tokenEstimate = estimateTokens('), src.indexOf('tokenEstimate = estimateTokens(') + 600);
  check('the only whole-request size cap is the token preflight, and it is budget-guarded',
    (preflight.match(/return json\\(\\{ error:/g) || []).length === 1 && /Token preflight hard stop/.test(preflight) && /const packBudget/.test(src),
    'if a second whole-request cap is introduced, add it to this inventory with a classification');
}`,
`{
  const at = src.indexOf('tokenEstimate = estimateTokens(');
  const preflight = src.slice(at, at + 2200);
  check('the only whole-request size cap is the token preflight, and it is budget-guarded',
    (preflight.match(/return json\\(\\{$|return json\\(\\{ error:/gm) || []).length <= 1 && /const packBudget/.test(src) && /hardMax/.test(preflight),
    'if a second whole-request cap is introduced, add it to this inventory with a classification');
  // The refusal itself must be actionable, not a bare number: the founder is told which input could not
  // be reduced and what to do about it, and that nothing was changed (verifier #60, V60-D1 residual).
  check('the whole-request refusal states a cause and an action, and is not an opaque hard stop',
    /error: 'Request too large'/.test(preflight) && /reason/.test(preflight)
      && /your message is too long to process in one turn/.test(preflight)
      && /ask about one company or one area at a time/.test(preflight)
      && /Nothing was changed\\./.test(preflight),
    'a refusal the founder cannot act on is not a deterministic refusal');
  check('the refusal distinguishes an oversized command from an oversized workspace',
    /const commandTokens = estimateTokens\\(command\\)/.test(preflight) && /commandTokens > Math\\.floor\\(hardMax \\/ 2\\)/.test(preflight),
    'the two causes need different actions, so they must not share one message');
  check('the refusal reports whether context trimming fell short, rather than leaving it to be inferred',
    /contextStillOverBudget/.test(preflight) && /contextBudget\\.overBudget = /.test(src),
    'overBudget must be stated by the block that knows it');
}`, 'preflight assertions');

must(`  ['input token estimate (pack + command)', /const hardMax = Number\\(Deno\\.env\\.get\\('SEM_AI_MAX_TOKENS'\\) \\|\\| 12000\\)/, 'SAFE DEGRADATION',
    () => /const packBudget = Math\\.max\\(2000,/.test(src) && /contextTrimmed\\.push/.test(src)],`,
`  ['input token estimate (pack + command)', /const hardMax = Number\\(Deno\\.env\\.get\\('SEM_AI_MAX_TOKENS'\\) \\|\\| 12000\\)/, 'SAFE DEGRADATION then DETERMINISTIC REFUSAL',
    () => /const packBudget = Math\\.max\\(2000,/.test(src) && /contextTrimmed\\.push/.test(src)
      && /for \\(const floor of \\[2, 0\\]\\)/.test(src) && /error: 'Request too large'/.test(src)],`, 'gate classification');

writeFileSync(p, s.replace(/\n/g, '\r\n'));
console.log('inventory updated');
