// VERIFIER #58 — size the "non-imperative lead executes when the model emits nothing" class (V57-D3 residual).
import { life, U, tally } from './v58_lib.mjs';
import { writeFileSync } from 'node:fs';
const A = U(1); const db = () => [{ id: A, name: 'Alpha', status: 'active' }, { id: U(2), name: 'Beta', status: 'archived' }];
const SENTENCES = [
  // reported speech / recommendation without "to"
  'the board recommended we archive Alpha', 'Bob suggested we archive Alpha', 'Alice said we should archive Alpha', 'the team thinks we should archive Alpha',
  'legal recommends that we archive Alpha', 'Bob proposed we archive Alpha', 'the auditor asked whether we archive Alpha', 'Bob argued we should archive Alpha',
  'my view is we archive Alpha', 'the plan says archive Alpha next quarter', 'the memo says to archive Alpha', 'the policy is to archive Alpha after 90 days',
  // first-person deliberation
  'I’m wondering if I should archive Alpha', 'I am thinking we could archive Alpha', 'I’m considering archiving Alpha', 'we’re thinking about archiving Alpha',
  'I might archive Alpha', 'we may archive Alpha later', 'we could archive Alpha', 'I guess we could archive Alpha', 'I’d rather not archive Alpha', 'I’m not going to archive Alpha',
  'I was going to archive Alpha but changed my mind', 'we were about to archive Alpha', 'I nearly archived Alpha', 'I almost restored Beta',
  // conditionals / temporal
  'once the audit is done we archive Alpha', 'after Friday we can archive Alpha', 'until then, don’t archive Alpha', 'unless Bob objects, archive Alpha',
  'as soon as the invoices clear, archive Alpha', 'only if Bob agrees, archive Alpha', 'archive Alpha only if Bob agrees',
  // questions without ?
  'is it time to archive Alpha', 'do we archive Alpha now', 'shall I archive Alpha', 'would you archive Alpha', 'any reason not to archive Alpha',
  // statements about others
  'Bob is going to archive Alpha tomorrow', 'Bob will archive Alpha', 'Bob archives Alpha every quarter', 'the system archives Alpha automatically',
  'Alpha gets archived on Friday', 'Alpha will be archived on Friday', 'Alpha is to be archived', 'Alpha must be archived by law',
  // narrative
  'we discussed archiving Alpha', 'the meeting was about archiving Alpha', 'archiving Alpha was rejected', 'archiving Alpha is on the agenda',
  'the archive of Alpha failed yesterday', 'restoring Beta took an hour last time', 'restore of Beta is scheduled',
  // Mongolian
  'Alpha-г архивлах уу?', 'Alpha-г архивлах ёстой юу', 'Bob Alpha-г архивлахыг санал болгосон',
];
const rows = []; const executed = [];
for (const s of SENTENCES) { const t = await life(s, db()); const ex = t.calls.length > 0; if (ex) executed.push(s + ' -> ' + JSON.stringify(t.calls)); rows.push({ name: s, ok: !ex, detail: JSON.stringify(t.calls) }); }
// imperative controls (must execute)
const CONTROLS = ['archive Alpha', 'unless Bob objects, archive Alpha', 'archive Alpha only if Bob agrees', 'as soon as the invoices clear, archive Alpha', 'restore Beta', 'please restore Beta', 'ok archive Alpha', 'archive Alpha now please', 'Alpha: archive it now', 'restore Beta and tell me'];
let ctl = 0; for (const s of CONTROLS) { const t = await life(s, db()); if (t.calls.length === 1) ctl++; else console.log('CONTROL DID NOT EXECUTE:', s, JSON.stringify(t.calls), 'gate', t.commandFallbackAllowed, t.commandReadLead, t.commandNegatedLead); }
const r = tally('v58_nonimperative_sizing', rows);
console.log(`non-imperative sentences that EXECUTED with the model emitting nothing: ${executed.length}/${SENTENCES.length}`);
for (const e of executed) console.log('   EXEC ' + e);
console.log(`imperative controls executing: ${ctl}/${CONTROLS.length}`);
writeFileSync(new URL('./nonimperative_sizing.json', import.meta.url), JSON.stringify({ total: SENTENCES.length, executed, controls: `${ctl}/${CONTROLS.length}` }, null, 1));
