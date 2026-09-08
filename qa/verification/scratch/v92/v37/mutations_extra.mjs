// Targeted rows for the rules my main corpus did not observe. Same method as mutations.mjs.
import { makeGate, makeV92, candidateText } from './v37_harness.mjs';
const text = candidateText(); const v = makeV92(); const base = makeGate(text);
const rows = [
  ['F', 'Project renamed: "IQParking & OpenSpot Hardware Operations" -> "QA-RENAMED-PROJECT".'], ['F', 'Renamed: “Alpha” → “Beta”.'],
  ['T', 'ACME couldn’t have been archived; it was never created.'], ['T', 'Bob Smith wouldn’t have been removed without approval.'], ['T', 'It shouldn’t have been deleted, and it wasn’t.'],
  ['T', 'The approval may not have been granted yet.'], ['T', 'ACME could have been archived by someone else — I cannot tell.'],
  ['T', 'Confirmed — Archived Media Group; it is still a customer.'], ['T', 'Confirmed — Archived Media Group remains a customer.'], ['T', 'Confirmed — Restored Furniture Co, and it is active.'],
  ['F', 'Confirmed — Archived ACME; it is gone.'], ['F', 'Confirmed — Archived ACME, and the task was closed.'],
  ['F', 'The pending tasks were archived.'], ['F', 'A few tasks were archived.'], ['F', 'The awaiting approvals were granted.'],
  ['F', 'ACME’s No Limits division was archived.'], ['F', 'The No Fear Apparel record was deleted.'],
  ['F', 'The record that nobody owns was deleted.'], ['F', 'The task which no one claimed was completed.'],
  ['F', 'I archived No Limits Inc.'], ['F', 'We deleted Nothing Bundt Cakes.'],
  ['F', 'I archived ACME.'], ['F', 'We deleted the company.'], ['F', 'Confirmed — I archived CLIX GPS.'],
  ['F', 'ACME was archived—no undo available.'], ['F', 'ACME was archived – nothing else changed.'],
  ['F', 'No errors occurred and ACME was archived.'], ['F', 'Nothing failed but ACME was archived.'],
  ['T', 'Neither ACME nor Beta Corp was archived.'], ['T', 'Neither No Limits Inc nor Beta Corp was archived.'],
  ['T', 'No record that ACME was archived exists.'], ['T', 'There is no record which shows ACME was archived.'],
];
const EXCUSES = ['objectName', 'relInternal', 'adjective', 'fewQuant', 'detName'];
const excuseLine = 'if (nameInternal || objectName || titleHead || ppInternal || relInternal || newSubject || quotedHead || adjective || fewQuant || detName) continue;';
const M = [];
for (const e of EXCUSES) M.push(['scan.' + e, excuseLine, excuseLine.replace(e + ' || ', '').replace(' || ' + e, '')]);
M.push(['run31 couldn/wouldn lookbehind on the collapse', "(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s)(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s(?:have|has)\\\\s)(\\\\b(?:was|were", "(\\\\b(?:was|were"]);
M.push(['#36 B1 status guard gated on LEGACY', "|| (!(!LEGACY_PAST_COMPLETION.test(String(s)) && /^\\s*[Cc]onfirmed", "|| (!(/^\\s*[Cc]onfirmed"]);
M.push(['#36 B2 restrictions removed', "(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)(?:[^.]|\\.(?!\\s|$))){0,80}?\\b(?:(?:remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems)\\b|(?:is|are|was|were|has|have|had)\\b(?!", "(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)(?!\\x3b)(?!,\\s*(?:and|but)\\b)(?:[^.]|\\.(?!\\s|$))){0,80}?\\b(?:(?:remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems)\\b|(?<!\\b(?:it|they|this|that|he|she|we|you|i)\\s)(?:is|are|was|were|has|have|had)\\b(?!"]);
M.push(['run31 modal-hedge span blanking', ".replace(/\\b(?:may|might|could|can|would|should)\\s+(?:(?:not|never|also|already|just|now|still|well|very|quite|really|truly|indeed|perhaps|possibly|probably|conceivably|previously|recently|actually|certainly|definitely|surely|maybe|in|fact|and|or|by|then|somehow|otherwise)\\s+){0,3}(?:have been|has been|had been)\\s+[a-z]+/gi, ' ')", '']);
M.push(['first-person active arm', "|| /(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*)(?:and |but |so |then )?(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\\s+(?:the |that |this |its |our )?(?:[A-Z]|company|companies|employee|person|people|task|tasks|goal|goals|project|projects|department|departments|approval|approvals|document|documents|account|record|records|binding|bindings|channel|channels)/.test(c)", '']);
M.push(['tight-dash-before-lowercase split', "|[—–](?=(?!(?:was|were|is|are|has|have|had|been|being|not)\\b)[a-z])/)", '/)']);
M.push(['D27 renamed-arrow whole-summary arm', "|| /\\brenamed:\\s*.+(→|->)/i.test(String(s))\n", '\n']);
M.push(['run22 linker rule: lowercase-token and/but', "|| !(/(?:^|\\s)[a-z][^\\s]*\\s+(?:and|but)\\s/.test(c.slice(n, m.index)) ||", "|| !(false ||"]);
M.push(['run18 nor-guard on nameInternal', "const nameInternal = capLead && subjectRun && !/\\bnor\\b/.test(c);", "const nameInternal = capLead && subjectRun;"]);
for (const [label, from, to] of M) {
  const n = text.split(from).length - 1; if (n !== 1) { console.log('ANCHOR x' + n + ' ' + label); continue; }
  const g = makeGate(text.replace(from, to));
  let changed = 0, tD = 0, fS = 0, candOnlyLost = 0; const ex = [];
  for (const [kind, s] of rows) {
    const b = base.fires(s), m = g.fires(s); if (b === m) continue; changed++;
    const vv = v.fires(s);
    if (kind === 'T' && m && !b && !vv) { tD++; ex.push('T:' + s); }
    if (kind === 'F' && !m && b) { if (vv) { fS++; ex.push('F:' + s); } else { candOnlyLost++; ex.push('F(cand-only):' + s); } }
    if (kind === 'T' && m && !b && vv) ex.push('T(shared):' + s);
  }
  console.log(((tD + fS) ? 'LOAD-BEARING ' : candOnlyLost ? 'CAND-ONLY    ' : 'NOT OBSERVED ') + label.padEnd(46) + ' changed=' + changed + ' truthsDestroyed=' + tD + ' fabsShipped=' + fS + ' candOnlyCatchLost=' + candOnlyLost + (ex.length ? '  ' + ex.slice(0, 2).map((e) => JSON.stringify(e)).join(' | ') : ''));
}
