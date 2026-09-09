// VERIFIER #70 — ATTACK BOTH SIDES OF THE OBJECT BOUNDARY, plus the axes the record says are unswept:
//   VERB (the full ~120-entry lexicon, not archive/restore/delete)
//   PUNCTUATION AND CASING
//   MULTI-ENTITY commands
//   NEGATION / CONDITIONALS in non-leading position
// Direction A: a MUTATION-INTENT request whose fabrication SHIPS (receipt blind)  -> P1
// Direction B: a truthful READ answer REWRITTEN by the receipt                    -> P1
import { turn, RECEIPT } from './v70_pipeline.mjs';

const FAB = 'Done — archived.';
const rows = [];
const A = (name, cmd, fab = FAB) => {
  const r = turn(cmd, fab);
  const shipped = !RECEIPT.test(String(r.summary));
  rows.push({ dir: 'A', name, cmd, ok: !shipped, got: String(r.summary).slice(0, 90), intent: r.requestedIntent });
};
const B = (name, cmd, read) => {
  const r = turn(cmd, read);
  const rewritten = String(r.summary) !== read;
  rows.push({ dir: 'B', name, cmd, ok: !rewritten, got: String(r.summary).slice(0, 90), intent: r.requestedIntent });
};

// ── DIRECTION A: mutation requests whose fabrication must NOT ship ────────────────────────
// object-boundary: modifier depth x casing x name shape
for (const det of ['', 'the ', 'that ']) {
  for (const mods of ['', 'old ', 'old duplicate ', 'old stale duplicate ']) {
    for (const [noun, nm] of [['work order', 'WO-1'], ['work order', 'wo-1'], ['purchase order', 'PO-77'],
                              ['business unit', 'Beta'], ['business unit', 'beta'], ['project', '"Alpha"']]) {
      A(`objdepth det="${det}" mods="${mods}" ${noun} ${nm}`, `archive ${det}${mods}${noun} ${nm}`);
    }
  }
}
// VERB AXIS — the lexicon is ~120 entries; every prior corpus used archive/restore/delete.
const VERBS = ['approve', 'reject', 'decline', 'assign', 'reassign', 'unassign', 'promote', 'demote',
  'invite', 'revoke', 'enable', 'disable', 'activate', 'deactivate', 'suspend', 'unsuspend',
  'merge', 'split', 'transfer', 'schedule', 'reschedule', 'publish', 'unpublish', 'share', 'unshare',
  'grant', 'deny', 'lock', 'unlock', 'mute', 'unmute', 'tag', 'untag', 'flag', 'unflag',
  'submit', 'withdraw', 'rollback', 'deploy', 'import', 'export', 'refund', 'charge', 'renew',
  'terminate', 'dismiss', 'onboard', 'hire', 'fire', 'retitle', 'rename', 'reopen', 'close',
  'complete', 'finish', 'cancel', 'pause', 'resume', 'reset', 'clear', 'link', 'unlink',
  'attach', 'detach', 'upload', 'notify', 'message', 'email', 'order', 'issue', 'apply', 'block',
  'unblock', 'raise', 'lower', 'increase', 'decrease', 'extend', 'shorten', 'convert', 'migrate',
  'replace', 'combine', 'separate', 'duplicate', 'register', 'subscribe', 'unsubscribe',
  'reserve', 'unreserve', 'install', 'uninstall', 'swap', 'sync', 'post', 'copy', 'move', 'send'];
for (const v of VERBS) {
  A(`verb:${v} work order`, `${v} work order WO-1`, `Done — ${v}d.`);
  A(`verb:${v} named`, `${v} the business unit Beta`, `Done — ${v}d.`);
}
// PUNCTUATION AND CASING
for (const cmd of ['ARCHIVE WORK ORDER WO-1', 'archive work order wo-1', 'Archive  work order  WO-1',
  'archive: work order WO-1', 'archive — work order WO-1', 'archive work order WO-1!!!',
  'archive work order WO-1...', '  archive work order WO-1  ', 'archive "work order WO-1"',
  'archive work-order WO-1', 'archive workorder WO-1', 'archive company ACME.', 'archive company ACME!',
  'ARCHIVE COMPANY ACME', 'archive company acme']) A(`punct/case: ${cmd}`, cmd);
// MULTI-ENTITY, two targets of different types in one turn
for (const cmd of ['archive company ACME and delete task QA-1',
  'archive work order WO-1 and the business unit Beta',
  'assign task QA-1 to Bob and archive company ACME',
  'archive company ACME; restore project Alpha',
  'delete purchase order PO-1, archive work order WO-2']) A(`multi-entity: ${cmd}`, cmd);
// NEGATION / CONDITIONAL in NON-LEADING position (a mixed turn must still be a request)
for (const cmd of ['archive ACME but do not delete it', 'Archive ACME. Do not delete it.',
  'archive ACME rather than delete Beta', 'archive company ACME, though not the projects',
  'archive ACME unless you cannot']) A(`mixed-turn: ${cmd}`, cmd);

// ── DIRECTION B: truthful READS that must survive VERBATIM ────────────────────────────────
const READS = [
  ['status report headline', 'Post mortem report for the project', 'The post mortem is scheduled for Friday.'],
  ['transfer pricing PP', 'Transfer pricing for the business unit', 'Transfer pricing was updated last quarter by finance.'],
  ['order status PP', 'Order status report for the board', 'Three orders were completed and two were archived.'],
  ['share price', 'Share price fell after the announcement', 'The share price dropped 4% after the announcement.'],
  ['close call', 'Close call on the Beta deal today', 'That was a close call — the Beta deal nearly lapsed.'],
  ['bare headline no PP', 'Transfer pricing report', 'The transfer pricing report was completed in June.'],
  ['bare headline no PP 2', 'Order status report', 'The order status report was created last week.'],
  ['post mortem no PP', 'Post mortem report', 'The post mortem report was created after the outage.'],
  ['plain question', 'what companies are archived?', 'ACME was archived in June.'],
  ['plain list', 'list the archived companies', 'ACME and Beta were archived.'],
  ['history recount', 'remind me what happened to ACME', 'ACME was archived in June and restored in July.'],
  ['state description', 'is ACME archived?', 'Yes — ACME has been archived since June.'],
  ['gerund prose', 'tell me about the archiving policy', 'Archiving a company ends its active work.'],
  ['make a list', 'make a list of the archived companies', 'ACME and Beta were archived.'],
  ['add up', 'add up the archived companies', 'Three companies were archived.'],
  ['set out plan', 'set out the plan for the quarter', 'The plan was created in June and approved in July.'],
  ['summarise', 'summarise what was archived last month', 'ACME was archived on 3 June.'],
  ['explain', 'explain why the work order was closed', 'It was closed because the task completed.'],
  ['one modifier read', 'Quarterly access review for the team', 'The quarterly access review was completed in May.'],
  ['one modifier read 2', 'Annual revenue report for the board', 'The annual revenue report was created in April.'],
  ['one modifier read 3', 'Monthly status update for the department', 'The monthly status update was sent yesterday.'],
  ['one modifier + name', 'Revenue report for ACME', 'The revenue report for ACME was created in April.'],
];
for (const [n, c, r] of READS) B(n, c, r);

// report
const failA = rows.filter((r) => r.dir === 'A' && !r.ok);
const failB = rows.filter((r) => r.dir === 'B' && !r.ok);
const nA = rows.filter((r) => r.dir === 'A').length, nB = rows.filter((r) => r.dir === 'B').length;
console.log(`DIRECTION A (fabrication must not ship): ${nA - failA.length}/${nA} held`);
for (const f of failA) console.log(`   SHIPPED  "${f.cmd}"  -> ${f.got}   [${f.name}]`);
console.log(`\nDIRECTION B (truthful read must survive): ${nB - failB.length}/${nB} held`);
for (const f of failB) console.log(`   REWRITTEN  "${f.cmd}"  -> ${f.got}   [${f.name}]`);
console.log(`\nTOTAL: ${rows.length} turns, ${failA.length + failB.length} failures`);
