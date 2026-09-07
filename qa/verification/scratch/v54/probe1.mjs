import { gate } from './harness.mjs';
import { PACK, O1_PACK_EXTRA } from './corpus.mjs';
const G = gate([...PACK, ...O1_PACK_EXTRA]);
const names = new Set([...PACK, ...O1_PACK_EXTRA].map((v) => v.trim().toLowerCase()));

const FP = /(?:^|\b[Cc]onfirmed\s*[—–-]\s*|[—–;\x2d]\s+|\s(?:and|but|so|then|&|because|although|whereas|while|since|after),?\s+)(?:and |but |so |then |[Mm]eanwhile,? |[Aa]lso,? )?(?:I|We|i|we)\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\s+(?:the |that |this |its |our )?(?:([A-Z][\w&.’'-]*(?:\s+[A-Z][\w&.’'-]*)*)|(?:company|companies|employee|person|people|task|tasks|goal|goals|project|projects|department|departments|approval|approvals|document|documents|account|record|records|binding|bindings|channel|channels)\b(?![ \t]+(?!(?:from|to|for|in|on|at|by|with|and|or|but|so|because|as|per|via|after|before|since|yesterday|today|now|just|already|successfully|earlier|then|too|also|instead)\b)[a-z]))/;

const CASES = [
  'Confirmed — I removed Dr. Sarah Chen.',
  'Confirmed — I archived O’Brien Holdings.',
  "Confirmed — I archived O'Brien Holdings.",
  'I archived nomin holding.',
  'Confirmed — I archived nomin holding.',
  'Confirmed — I archived eMart.',
  'Confirmed — I archived Trade and Development Bank.',
  'Everything is done: ACME Corp archived, Bob Smith removed.',
  'ACME Corp is now archived — I took care of it.',
  'The task could have been assigned already — I assigned it to Bob Smith.',
];
for (const s of CASES) {
  const m = s.match(FP);
  const cap = m ? m[1] : undefined;
  const after = m ? s.slice((m.index ?? 0) + m[0].length - String(cap ?? '').length) : '';
  const prefixes = after ? after.split(/(?<=\S)(?=\s)/).map((w, i, ws) => ws.slice(0, i + 1).join('')).slice(0, 16) : [];
  const hit = prefixes.find((p) => names.has(p.replace(/[.,;:!?]+$/, '').replace(/['’]s$/, '').trim().toLowerCase()));
  console.log(JSON.stringify(s));
  console.log('   FPmatch=', !!m, 'capture=', JSON.stringify(cap), 'capInPack=', cap !== undefined && names.has(String(cap).replace(/['’]s$/, '').trim().toLowerCase()));
  console.log('   afterSlice=', JSON.stringify(after.slice(0, 60)), 'prefixHit=', JSON.stringify(hit));
  console.log('   readsAsCompletion=', G.readsAsCompletion(s));
}
