// Mutation proof for the conditioned-offer stand-down — the founder's product decision, applied.
//
// Written as a FILE, not a `node -e` string. A first attempt passed the anchor through the shell and
// the backslashes were eaten, so the mutation never applied and the harness printed NO-OP for a fix
// that is load-bearing. That is the eighth time in this campaign that an escaping layer has turned a
// live measurement into a meaningless one, and the reason the rule here is: anything containing a
// backslash goes in a file.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';
import { v92Destroys } from '../../lib/v92_reference.mjs';

globalThis.knownEntityNames = new Set();
const ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const F = ROOT + 'supabase/functions/sem-ai-command/index.ts';
const TMP = ROOT + 'qa/verification/scratch/v92/mut50_tmp.ts';
const base = readFileSync(F, 'utf8');

// The class the founder ruled on: an offer whose own clause conditions it on their confirmation.
const OPENERS = ['Let me archive the company', 'Let me restore the company', 'Let me delete the project',
  "I'm about to archive the company", 'I am about to archive the company',
  'I am going to archive the company', "I'm going to restore the company",
  'Let me go ahead and archive the company'];
const TAILS = ['once you confirm.', 'if you approve.', 'only after your approval.', 'when you confirm.',
  'as soon as you say go.', 'subject to your confirmation.', 'provided you confirm.', 'assuming you approve.'];
const TRUTH = OPENERS.flatMap((o) => TAILS.map((t) => o + ' ' + t));

// The claims the arm exists for. An unconditioned imminent claim must still be caught, or the
// stand-down has not narrowed the arm, it has switched it off.
const FAB = ['Let me archive ACME Holdings for you.', 'I am about to archive ACME Holdings.',
  'I am archiving ACME Holdings now.', 'Let me delete Beta Corp.', 'Kicking off the archive of ACME Holdings.'];

const measure = (p) => {
  const g = buildGate(p);
  return {
    destroyed: TRUTH.filter((s) => !v92Destroys(s) && g.readsAsCompletion(s) === true).length,
    caught: FAB.filter((s) => g.readsAsCompletion(s) === true).length,
  };
};

const b = measure(F);
console.log('=== the applied build ===');
console.log('conditioned offers destroyed (v92 preserves them): ' + b.destroyed + '/' + TRUTH.length);
console.log('unconditioned claims still caught                : ' + b.caught + '/' + FAB.length);
if (b.destroyed !== 0 || b.caught !== FAB.length) { console.log('FAIL: the applied build is not in the expected state'); process.exit(1); }
console.log('');

// Revert the stand-down by making its condition test vacuously true, which is what the arm looked
// like before the founder's ruling.
const ANCHOR = "!/\\b(?:once|if|after|unless|when|provided|assuming|as soon as|subject to|pending)\\b[^.]{0,40}?\\byou(?:r|rs)?\\b/i.test(c)";
if (!base.includes(ANCHOR)) { console.log('ANCHOR MISSING — re-anchor this proof, do not let it pass'); process.exit(1); }
writeFileSync(TMP, base.split(ANCHOR).join('true'));
const m = measure(TMP);
const moved = m.destroyed > b.destroyed;
console.log((moved ? 'LOAD-BEARING' : '*** NO-OP ***') + '  the conditioned-offer stand-down');
console.log('     reverted: offers destroyed ' + m.destroyed + '/' + TRUTH.length
  + '   unconditioned claims caught ' + m.caught + '/' + FAB.length);
console.log('');
console.log(moved && m.caught === FAB.length
  ? 'RESULT: PASS — the stand-down is doing the work, and reverting it costs only the offers'
  : 'RESULT: FAIL');
process.exit(moved && m.caught === FAB.length ? 0 : 1);
