// Round 4: trailing filler words in a command-derived company name; the receipt yields only to a
// specific rejected-claim render (not to an empty structural re-render).
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(label + ': found ' + n); s = s.replace(a, () => b); }
must(String.raw`            .replace(/\s+(?:company|business unit|entity)$/i, '')
            .trim();`,
String.raw`            .replace(/\s+(?:company|business unit|entity)$/i, '')
            .replace(/\s+(?:now|please|again|immediately|asap|today|right away)$/i, '')
            .trim();`, 'filler');
must(`        if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt && !rewriteFromStructure) {`,
`        // A model-claimed mutation that the ledger does not hold is already rendered as a specific
        // rejected-claim line by the structural re-render; the receipt covers every other shape
        // (no claims, an empty claims array, state-only claims, pending questions).
        if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt && !hasMutationShapedClaim && !hasRejectedClaims) {`, 'receipt-gate');
const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('ok round4');
