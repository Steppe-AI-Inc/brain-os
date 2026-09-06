#!/usr/bin/env node
// RETIRED (run38). This proof claimed the run30 dash-form R-IDIOM strip was dead because re-adding it changed
// 0/17 idiom answers. Verifier #37 showed the family was VACUOUS: every one of the 17 rows had an
// aux+participle tail, which the later rules catch with or without the strip - but the strip ALSO fed
// the first-person and progressive arms, and 'No problem - I archived ACME.' shipped once it was removed
// (115 of its 2,288-row family). The strip is RE-ADDED in the adopted fix43. This file is kept, inert,
// as the record of a deadness proof that did not cover the arms the code served; it now exits 0 and
// prints that record, so the lesson stays in the tree rather than being deleted.
console.log('RETIRED: v39 deadness proof was vacuous (aux+participle tails only); the strip is re-added in fix43. See ledger #99.');
process.exit(0);
// ---- original text follows, unreachable ----
#!/usr/bin/env node
// DEADNESS PROOF for the run30 dash-form R-IDIOM strip, removed in fix42. Verifiers #35 and #36 both
// reported it dead; this shows it: re-adding the strip to the shipped bytes changes NO answer on the
// idiom family, in either direction, because the dash-before-lowercase split, newSubject, quotedHead
// and the D181 determiner-led strip carry every shape it once closed. The campaign's rule is that
// only load-bearing code ships.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';
const SRC = process.env.SEM_INDEX_SRC || 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts';
const DIR = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/mut39'; mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');
const BS = String.fromCharCode(92);
const STRIP = ".replace(/^" + BS + "s*(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:" + BS + "s+at all)?" + BS + "s*[\u2014\u2013-]" + BS + "s*)+/i, '')";
const anchor = ".replace(/^" + BS + "s*(?:no problem|no worries|not to worry|no iss";   // the D181 strip, which directly follows where the dash strip sat
if (!BASE.includes(anchor)) { console.log('NOT PROVEN: D181 anchor not found'); process.exit(1); }
if (BASE.includes(STRIP)) { console.log('NOT PROVEN: the dash-form strip is still present in the shipped bytes'); process.exit(1); }
const mutated = BASE.replace(anchor, STRIP + anchor);
const p = DIR + '/readded.ts'; writeFileSync(p, mutated);
const live = buildGate(SRC), g = buildGate(p);
const rows = ['No worries at all \u2014 FuelMetrix was archived.', 'No problem at all \u2014 ACME Holdings was archived.', 'No harm done \u2014 Beta Corp was restored.', 'Sure thing \u2014 no problem \u2014 ACME Holdings was archived.', 'Nothing failed\u2014ACME Holdings has been archived.', 'Of course \u2014 the company was archived.', 'No problem the log shows ACME was archived.', 'No worries at all, ACME Holdings was archived.', 'Absolutely \u2014 Beta Corp has been deleted.', 'No problem \u2014 ACME was archived.', 'Not to worry \u2014 ACME was archived.', 'No problem \u2014 nothing was archived.', 'No worries at all \u2014 ACME Holdings was not archived.', 'No issue \u2014 the task was deleted.', 'No trouble at all - Beta Corp was removed.', 'No problem \u2014 No Limits Inc was archived.', 'Not a problem \u2014 nothing named ACME was archived.'];
const diff = rows.filter((s) => live.readsAsCompletion(s) !== g.readsAsCompletion(s));
console.log((diff.length ? 'NOT DEAD    ' : 'PROVEN DEAD ') + 'dash-form idiom strip: re-adding it changes ' + diff.length + '/' + rows.length + ' answers' + (diff.length ? ' e.g. ' + JSON.stringify(diff[0]) : ''));
process.exit(diff.length ? 1 : 0);
