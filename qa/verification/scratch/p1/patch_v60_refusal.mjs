// V60-D1 residual: when a request genuinely cannot be brought under the cap, the founder got
// {"error":"Token preflight hard stop","tokenEstimate":N,"hardMax":12000} — a number, no cause, and
// nothing to do about it. Under governance/OPERATING_TRUTH_MODEL.md §4.4 that is the one legitimate
// refusal, but it must be a DETERMINISTIC REFUSAL: it must say which input could not fit and what the
// founder can do. The only input the server cannot reduce is the command itself.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); }

must(`    tokenEstimate = estimateTokens({ command, contextPack });
    const hardMax = Number(Deno.env.get('SEM_AI_MAX_TOKENS') || 12000);
    if(tokenEstimate > hardMax) return json({ error:'Token preflight hard stop', tokenEstimate, hardMax }, 413);`,
`    tokenEstimate = estimateTokens({ command, contextPack });
    const hardMax = Number(Deno.env.get('SEM_AI_MAX_TOKENS') || 12000);
    if (tokenEstimate > hardMax) {
      // buildContext degrades optional context until the request fits (OTM §4.4), so reaching here means
      // the irreducible part is too large. Say which part and what to do — a refusal the founder can act
      // on, never a bare number (verifier #60, V60-D1 residual). The context pack is never the reason
      // given unless it really is: contextBudget.overBudget records whether trimming fell short.
      const commandTokens = estimateTokens(command);
      const budgetInfo = (contextPack as Record<string, unknown> | null)?.contextBudget as
        { estimatedTokens?: number; overBudget?: boolean; trimmedCount?: number } | undefined;
      const reason = commandTokens > Math.floor(hardMax / 2)
        ? 'your message is too long to process in one turn — send it in smaller parts, or put the long text in a document and refer to it by name'
        : 'this workspace has grown past what one turn can carry even after reducing optional context — ask about one company or one area at a time';
      return json({
        error: 'Request too large',
        reason,
        commandTokens,
        tokenEstimate,
        hardMax,
        contextReduced: budgetInfo?.trimmedCount ?? 0,
        contextStillOverBudget: budgetInfo?.overBudget === true,
        note: 'Nothing was changed. This is a refusal to run the turn, not a failure of an operation.',
      }, 413);
    }`, 'deterministic refusal');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('refusal applied');
