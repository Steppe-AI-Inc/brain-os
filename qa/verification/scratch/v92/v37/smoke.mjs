import { makeGate, makeV92, sha256, SRC } from './v37_harness.mjs';
import { readFileSync } from 'node:fs';
console.log('SRC', SRC, sha256(readFileSync(SRC)));
const g = makeGate(); const v = makeV92();
console.log('v92 literal sha', sha256(v.literal), 'statement:', v.statement.slice(0, 160));
const rows = ['ACME was archived.', 'No company named ACME was archived.', 'Nothing Bundt Cakes was archived.', 'I can’t archive that from chat.', 'ACME was, as far as anyone can tell not, archived.', 'Confirmed — Archived Media Group; it is still a customer.', 'Since no company is being archived, the list is unchanged.', 'Confirmed — Archived ACME.', 'No North Depot was archived.', 'No Limits Inc was archived.'];
for (const s of rows) console.log(JSON.stringify(s), 'v92fires=' + v.fires(s), 'cand.destroyed=' + g.destroyed(s), 'cand.ships=' + g.ships(s));
console.log('pending: v92', v.decide({ summary: 'ACME was archived. Also archive Beta?', pendingAction: { x: 1 } }), 'cand', g.decide({ summary: 'ACME was archived. Also archive Beta?', pendingAction: { x: 1 } }).claimsPastCompletionWithNoGrounding);
console.log('belt present:', Object.keys(g.belt).filter((k) => k !== '__body').join(','));
