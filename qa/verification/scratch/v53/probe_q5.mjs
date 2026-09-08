// VERIFIER #53 — Q5 re-derived with my own shapes: ledger #64 D16 (one-delimiter-away), #65 D25 (command-derived amnesty
// replies), #65 D27 (renamed-arrow, production row 9dda919c), #66 D40 (claims: [] disabling protections = structured consumer).
import * as H from './harness.mjs';
const NM = ['Gobi Corporation', 'Khan Bank'];
const D16 = ['The approval was not rejected, and it has been approved.', 'The approval was not rejected – it has been approved.', 'The approval was not rejected—it has been approved.', 'The approval was not rejected: it has been approved.', 'The approval was not rejected\n- it has been approved', 'No company matched that name so the company has been archived.', 'I could not confirm the owner yet the employee was created.', 'The status is not draft (the goal has been archived).', 'The approval has been approved\n\nWould you like me to notify the team?', 'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?', 'The task has been completed, right?', 'Nothing else changed; Gobi Corporation was archived.', 'No errors — Khan Bank has been archived!'];
const D25 = ['The company has been archived.', 'The approval has been approved.', 'The task has been deleted.', 'Gobi Corporation has been archived.', 'Khan Bank archived successfully.'];
const D27 = ['Project renamed: "Old Name" → "New Name"', 'renamed: Alpha -> Beta', 'Renamed: "Khan Bank" -> "Khan Bank Holdings"', 'Company renamed: Gobi Corporation → Gobi Corp'];
let bad = 0;
const show = (label, rows, structured = false) => { console.log('\n## ' + label); for (const s of rows) { const c = H.candArm(s, { names: NM, structured }), v = H.v92Arm(s); const ok = c !== null; if (!ok) bad++; console.log(`  ${ok ? 'CAUGHT ' : 'SHIPS  '} cand=${String(c).padEnd(15)} v92=${String(v).padEnd(15)} ${JSON.stringify(s).slice(0, 110)}`); } };
show('#64 D16 — one-delimiter-away shapes (legacy consumer)', D16);
show('#64 D16 — same shapes, structured consumer (claims: [] / rawClaims non-null — #66 D40)', D16, true);
show('#65 D25 — replies the command-derived gate handed back', D25);
show('#65 D27 — renamed-arrow completion report', D27);
show('#65 D27 — structured consumer', D27, true);
console.log('\ncommand-derived gate identifiers present in candidate:', /founderRequestedMutation|READ_ONLY_REQUEST_PATTERN|MUTATION_REQUEST_PATTERN/.test(H.TEXT));
console.log('Q5 shipped total:', bad);
