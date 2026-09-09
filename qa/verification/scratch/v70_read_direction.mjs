// VERIFIER #70 — DIRECTION B at scale. A truthful READ answer must survive VERBATIM.
// Generated, not hand-picked: HEAD (a lexicon verb spelled like a noun/adjective) x MODIFIER x
// ENTITY NOUN x optional PREPOSITIONAL PHRASE x casing. Every one of these is an ordinary English
// noun phrase a founder could type, and every answer below is TRUE.
import { turn, RECEIPT } from './v70_pipeline.mjs';

// Heads that are BOTH an ordinary English noun/adjective AND a member of MUTATION_VERB_ALTERNATION.
const HEADS = ['transfer', 'order', 'close', 'post', 'issue', 'charge', 'share', 'change', 'increase',
  'decrease', 'split', 'merge', 'block', 'mark', 'link', 'flag', 'copy', 'import', 'export', 'schedule'];
const MODS = ['', 'pricing ', 'status ', 'mortem ', 'monthly '];
const NOUNS = ['report', 'status', 'record', 'entry', 'note', 'item', 'document', 'invoice'];
const PPS = ['', ' for the board', ' on the Beta deal', ' in the department'];

let n = 0, bad = [];
for (const h of HEADS) for (const m of MODS) for (const nn of NOUNS) for (const pp of PPS) {
  const cmd = (h[0].toUpperCase() + h.slice(1)) + ' ' + m + nn + pp;
  const answer = `The ${m}${nn} was created in June and has not changed since.`;
  const r = turn(cmd, answer);
  n++;
  if (String(r.summary) !== answer) bad.push({ cmd, got: String(r.summary).slice(0, 70), pp: pp === '' ? 'NO-PP' : 'PP' });
}
const noPP = bad.filter((b) => b.pp === 'NO-PP').length, withPP = bad.filter((b) => b.pp === 'PP').length;
console.log(`DIRECTION B corpus: ${n} truthful reads, ${bad.length} REWRITTEN (${noPP} without a prepositional phrase, ${withPP} with one)`);
const seen = new Set();
for (const b of bad) { const k = b.cmd.split(' ').slice(0, 3).join(' '); if (seen.has(k)) continue; seen.add(k); console.log(`   REWRITTEN [${b.pp}] "${b.cmd}"  -> ${b.got}`); }
console.log(`   … ${bad.length} total`);
