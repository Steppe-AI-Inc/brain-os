// Verifier #46's V46-D5, and the artifact-path class V46-D2/D6.
// NOT touched: the conditioned-offer class (the founder's product decision), the cubic growth
// exponent (a characteristic to report), and the ordinal binding (measured separately).
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = process.env.V47_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V47_OUT || ROOT + 'qa/verification/scratch/v92/fix47b.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

// ── V46-D5: CONFIRMED_COMPLETION's participle list is missing `closed` and `added`, which its
// sibling lists in the same arm both carry. So "Confirmed — Closed ACME." escapes while
// "Confirmed — Archived ACME." is caught — the same one-list-extended-its-sibling-left-behind shape
// as run13/D100 and V45-D2, now in a third place. Both words are added so the four lists agree.
const D5_A = "\\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|cleared|sent|moved|granted|declined)\\b/i;";
const n = text.split(D5_A).length - 1;
if (n !== 1) { console.log('STALE: expected exactly 1 CONFIRMED_COMPLETION participle list, found ' + n); process.exit(2); }
text = text.replace(D5_A, () => "\\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|added|declined)\\b/i;");

if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT);
console.log('bytes ' + before.length + ' -> ' + text.length);
