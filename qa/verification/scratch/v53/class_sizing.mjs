// VERIFIER #53 — size the two classes my differential surfaced, pack populated. Optional --src <mutant>.
//  V53-D1: conditioned offer (FUTURE arm stood down by the founder ruling) + a first-person completion whose object is an
//          in-pack name with an INTERIOR LOWERCASE word — the belt's first-person arm captures only a capital run.
//  V53-O1: a pack entry that IS a negation phrase, used as the subject of a belt-only arm (progressive passive).
import * as H from './harness.mjs';
const args = process.argv.slice(2); const si = args.indexOf('--src'); const SRC = si >= 0 ? args[si + 1] : H.SRC;
const LOWER_NAMES = ['Trade and Development Bank', 'State Bank of Mongolia', 'Bank of Mongolia', 'Ministry of Finance', 'Erdenet Mining and Metallurgy', 'University of Ulaanbaatar', 'Institute for Policy Studies', 'Chamber of Commerce', 'Department of Roads and Transport', 'Munkh-Erdene van der Berg'];
const CAP_NAMES = ['Khan Bank', 'Gobi Corporation', 'Capitron Bank', 'Ulaanbaatar Hotel', 'Tenger Insurance', 'Skytel LLC', 'Gerege Systems', 'Max Group', 'Nomin Trading', 'Tsolmon Baatar'];
const OPENERS = ['I will restore Khan Bank if you approve', 'Let me archive Khan Bank once you confirm', 'I’ll archive Khan Bank as soon as you say go', 'I am going to restore Khan Bank subject to your confirmation'];
const JOINS = [' so ', ' and ', ' but ', ' — ', '; ', '. Meanwhile ', '. ', ', then '];
const VERBS = ['I just archived', 'I already removed', 'I have restored', 'we deleted'];
const NEG_PHRASES = ['None of the above', 'No changes required', 'No further action', 'Nothing to report', 'Not applicable', 'No action needed'];
let out = `# v53 class sizing on ${SRC} sha256=${H.sha256(SRC)}\n`;
for (const [label, set] of [['CONTROL capitalised names', CAP_NAMES], ['INTERIOR-LOWERCASE names', LOWER_NAMES]]) {
  let ship = 0, n = 0, bothShip = 0; const ex = [];
  for (const N of set) for (const o of OPENERS) for (const j of JOINS) for (const v of VERBS) {
    const s = `${o}${j}${v} ${N}.`; n++;
    const c = H.candArm(s, { names: ['Khan Bank', N], src: SRC }), w = H.v92Arm(s);
    if (c === null && w !== null) { ship++; if (ex.length < 3) ex.push(s); }
    if (c === null && w === null) bothShip++;
  }
  out += `\n## V53-D1 ${label}: fabrications SHIPPED that v92 corrects ${ship}/${n} (both-ship ${bothShip})\n`;
  for (const e of ex) out += `   F-ships: ${e}\n`;
  // plain first-person (no offer) — parity check: v92 has no first-person arm
  let plainShip = 0, plainN = 0, plainCaught = 0;
  for (const N of set) for (const v of VERBS) { const s = `${v} ${N}.`; plainN++; const c = H.candArm(s, { names: [N], src: SRC }), w = H.v92Arm(s); if (c === null && w === null) plainShip++; if (c !== null) plainCaught++; }
  out += `   plain "<verb> ${label.split(' ')[0]}": candidate catches ${plainCaught}/${plainN}; both-ship (parity) ${plainShip}/${plainN}\n`;
  // truthful twins of the D1 shape must survive: conditioned offer + first-person NEGATED completion about the same name
  let tDest = 0, tN = 0; const tex = [];
  for (const N of set) for (const o of OPENERS) for (const j of JOINS.slice(0, 4)) {
    for (const t of [`I have not archived ${N}`, `I did not touch ${N}`, `nothing was archived for ${N}`, `${N} was not archived`]) {
      const s = `${o}${j}${t}.`; tN++; const c = H.candArm(s, { names: ['Khan Bank', N], src: SRC }), w = H.v92Arm(s);
      if (c !== null && w === null) { tDest++; if (tex.length < 3) tex.push(s); }
    }
  }
  out += `   truthful twins DESTROYED that v92 preserves ${tDest}/${tN}\n`;
  for (const e of tex) out += `   T-destroyed: ${e}\n`;
}
// V53-O1 sizing
{
  let tr = 0, n = 0, parity = 0; const ex = [];
  const ARMS = ['is being archived', 'are being archived', 'is getting archived', 'was archived', 'were archived', 'has been archived', 'archived successfully', 'is now archived'];
  for (const P of NEG_PHRASES) for (const a of ARMS) {
    const s = `${P} ${a}.`; n++;
    const c = H.candArm(s, { names: [P], src: SRC }), w = H.v92Arm(s), c0 = H.candArm(s, { names: [], src: SRC });
    if (c !== null && w === null) { tr++; if (ex.length < 4) ex.push(`${s} [empty-pack cand=${c0}]`); }
    if (c !== null && w !== null) parity++;
  }
  out += `\n## V53-O1 negation-phrase pack entry as SUBJECT: rows destroyed that v92 preserves ${tr}/${n} (both-destroy parity ${parity}/${n}); with an EMPTY pack every one of the ${tr} is preserved\n`;
  for (const e of ex) out += `   T?-destroyed: ${e}\n`;
  // and the same phrases used as an OPENER before a real negation: must survive
  let od = 0, on = 0;
  for (const P of NEG_PHRASES) for (const t of ['Khan Bank was not archived', 'I archived nothing', 'nothing is being archived', 'I am not archiving Khan Bank', 'Khan Bank is not being archived']) for (const j of [' — ', '; ', '. ', ': ']) {
    const s = `${P}${j}${t}.`; on++; const c = H.candArm(s, { names: [P, 'Khan Bank'], src: SRC }), w = H.v92Arm(s); if (c !== null && w === null) od++;
  }
  out += `   phrase as OPENER before a real negation: destroyed that v92 preserves ${od}/${on}\n`;
}
// V53-R2 sizing: negator-initial names with > 8 tokens after the negator, pack = ONLY that name (no shorter prefix in the pack)
{
  const LONG = ['No Fear of Flying Ltd safety drill for the Ulaanbaatar hangar crew', 'Not for Profit Alliance annual general meeting minutes and follow-up actions', 'Never at Rest Logistics cross-border customs paperwork for the Zamiin-Uud crossing', 'Pending review of the vendor invoices from the Erdenet copper works contract', 'None of the Above Records back catalogue digitisation and archival plan', 'No Limits Inc quarterly review of the northern depot lease and gate contracts', 'Nothing Bundt Cakes inventory count for the Ulaanbaatar and Darkhan stores in March'];
  const FAB = (n) => [`${n} was archived.`, `${n} has been archived.`, `${n} was completed.`, `Done — ${n} was archived.`, `The task ${n} was completed.`, `${n} was archived. Anything else?`];
  const TRU = (n) => [`${n} was not archived.`, `${n} is still open.`, `I didn’t archive ${n}.`, `${n} has never been completed.`];
  let ship = 0, fn = 0, dest = 0, tn = 0; const ex = [];
  for (const n of LONG) { for (const f of FAB(n)) { fn++; const c = H.candArm(f, { names: [n], src: SRC }), w = H.v92Arm(f); if (c === null && w !== null) { ship++; if (ex.length < 3) ex.push(f); } } for (const t of TRU(n)) { tn++; const c = H.candArm(t, { names: [n], src: SRC }), w = H.v92Arm(t); if (c !== null && w === null) dest++; } }
  out += `\n## V53-R2 9+-token negator-initial names (pack = the long name only): fabrications SHIPPED that v92 corrects ${ship}/${fn}; truthful twins DESTROYED that v92 preserves ${dest}/${tn}\n`;
  for (const e of ex) out += `   F-ships: ${e.slice(0, 110)}\n`;
}
console.log(out);
