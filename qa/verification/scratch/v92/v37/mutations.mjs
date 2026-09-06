// VERIFIER #37 — independent mutation test of every shipped fix (run30/run31 five, #36's seven splices, the
// #34/#35-era rules). Each mutant reverts ONE rule in memory; a rule is LOAD-BEARING if the mutant changes at
// least one answer on MY corpus in the direction the rule carries (truth direction = the mutant destroys a
// v92-preserved truth the candidate keeps; fab direction = the mutant ships a v92-corrected fabrication the
// candidate catches). Every anchor must be found exactly once, so a silent no-op mutant is impossible.
import { makeGate, makeV92, candidateText } from './v37_harness.mjs';
import { ROWS } from './v37_corpus.mjs';
const text = candidateText(); const v = makeV92(); const base = makeGate(text);
const BS = '\\';
const EXCUSES = ['nameInternal', 'objectName', 'titleHead', 'ppInternal', 'relInternal', 'newSubject', 'quotedHead', 'adjective', 'fewQuant', 'detName'];
const excuseLine = 'if (nameInternal || objectName || titleHead || ppInternal || relInternal || newSubject || quotedHead || adjective || fewQuant || detName) continue;';
const M = [];
for (const e of EXCUSES) M.push(['scan.' + e + ' (run31 name-safe negator scan / #34 / #36)', excuseLine, excuseLine.replace(e + ' || ', '').replace(' || ' + e, '')]);
M.push(['R-IDIOM D181 determiner-led strip (C2 gated)', ".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i, (i0, o0, t0) => (LEGACY_PAST_COMPLETION.test(t0.slice(o0 + i0.length)) ? '' : i0))", '']);
M.push(['#36 C2 gate only (strip unconditional)', "(i0, o0, t0) => (LEGACY_PAST_COMPLETION.test(t0.slice(o0 + i0.length)) ? '' : i0))", "'')"]);
M.push(['R-AUXGAP collapse (whole replace removed)', ".replace(new RegExp('(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s)(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s(?:have|has)\\\\s)(\\\\b(?:was|were|has been|have been)\\\\b)(?=(?:[^.]|\\\\.(?!\\\\s|$)){0,30}\\\\b' + COMPLETION_PARTICIPLE.source.slice(2) + ')\\\\s*[,—–]\\\\s*(?:[^.]|\\\\.(?!\\\\s|$)){0,30}?[,—–]\\\\s*(?=' + COMPLETION_PARTICIPLE.source.slice(2) + ')', 'gi'), '$1 ')", '']);
M.push(['#36 A collapse reach = v92 window (lookahead removed)', "(?=(?:[^.]|\\\\.(?!\\\\s|$)){0,30}\\\\b' + COMPLETION_PARTICIPLE.source.slice(2) + ')\\\\s*[,—–]", "\\\\s*[,—–]"]);
M.push(['run31 couldn/wouldn lookbehind on the collapse', "(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s)(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s(?:have|has)\\\\s)(\\\\b(?:was|were", "(\\\\b(?:was|were"]);
M.push(['#36 B1 status guard gated on LEGACY', "|| (!(!LEGACY_PAST_COMPLETION.test(String(s)) && /^\\s*[Cc]onfirmed", "|| (!(/^\\s*[Cc]onfirmed"]);
M.push(['#36 B2 restrictions removed (re-add pronoun/;/, and)', "(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)(?:[^.]|\\.(?!\\s|$))){0,80}?\\b(?:(?:remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems)\\b|(?:is|are|was|were|has|have|had)\\b(?!", "(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)(?!\\x3b)(?!,\\s*(?:and|but)\\b)(?:[^.]|\\.(?!\\s|$))){0,80}?\\b(?:(?:remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems)\\b|(?<!\\b(?:it|they|this|that|he|she|we|you|i)\\s)(?:is|are|was|were|has|have|had)\\b(?!"]);
M.push(['#36 C1 ppInternal gate', "notwithstanding|barring|excepting)\\s+$/i.test(c.slice(0, mm.index)) && LEGACY_PAST_COMPLETION.test(c);", "notwithstanding|barring|excepting)\\s+$/i.test(c.slice(0, mm.index));"]);
M.push(['#36 D newSubject token-internal period', "(/(?:\\b[A-Z][\\w&.’'-]*(?:\\s+[A-Z][\\w&.’'-]*){0,4}|\\b(?:the|that|this", "(/(?:\\b[A-Z][\\w&’'-]*(?:\\s+[A-Z][\\w&’'-]*){0,4}|\\b(?:the|that|this"]);
M.push(['#36 E confirmed participle', "granted|added|confirmed)\\b/i;\n        const COMPLETION_VERB", "granted|added)\\b/i;\n        const COMPLETION_VERB"]);
M.push(['run31 modal-hedge span blanking', ".replace(/\\b(?:may|might|could|can|would|should)\\s+(?:(?:not|never|also|already|just|now|still|well|very|quite|really|truly|indeed|perhaps|possibly|probably|conceivably|previously|recently|actually|certainly|definitely|surely|maybe|in|fact|and|or|by|then|somehow|otherwise)\\s+){0,3}(?:have been|has been|had been)\\s+[a-z]+/gi, ' ')", '']);
M.push(['parenthetical blanking + own-clause test', ".replace(/\\([^()]*\\)/g, ' ')", '']);
M.push(['first-person active arm', "|| /(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*)(?:and |but |so |then )?(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\\s+(?:the |that |this |its |our )?(?:[A-Z]|company|companies|employee|person|people|task|tasks|goal|goals|project|projects|department|departments|approval|approvals|document|documents|account|record|records|binding|bindings|channel|channels)/.test(c)", '']);
M.push(['tight-dash-before-lowercase split', "|[—–](?=(?!(?:was|were|is|are|has|have|had|been|being|not)\\b)[a-z])/)", '/)']);
M.push(['D27 renamed-arrow whole-summary arm', "|| /\\brenamed:\\s*.+(→|->)/i.test(String(s))\n", '\n']);
M.push(['run22 linker rule: lowercase-token and/but', "|| !(/(?:^|\\s)[a-z][^\\s]*\\s+(?:and|but)\\s/.test(c.slice(n, m.index)) ||", "|| !(false ||"]);
M.push(['run18 nor-guard on nameInternal', "const nameInternal = capLead && subjectRun && !/\\bnor\\b/.test(c);", "const nameInternal = capLead && subjectRun;"]);
const rows = ROWS;
const ok = [];
let allBearing = true;
for (const [label, from, to] of M) {
  const n = text.split(from).length - 1;
  if (n !== 1) { console.log('ANCHOR x' + n + '  ' + label); allBearing = false; continue; }
  let g; try { g = makeGate(text.replace(from, to)); } catch (e) { console.log('BUILD FAIL ' + label + ': ' + e.message.slice(0, 100)); allBearing = false; continue; }
  let tDestroyed = 0, fShipped = 0, changed = 0;
  const ex = [];
  for (const [sec, kind, s] of rows) {
    const b = base.fires(s), m = g.fires(s);
    if (b === m) continue; changed++;
    const vv = v.fires(s);
    if (kind === 'T' && m && !b && !vv) { tDestroyed++; if (ex.length < 2) ex.push('T:' + s); }
    if (kind === 'F' && !m && b && vv) { fShipped++; if (ex.length < 2) ex.push('F:' + s); }
  }
  const bearing = tDestroyed + fShipped > 0;
  if (!bearing) allBearing = false;
  console.log((bearing ? 'LOAD-BEARING ' : 'NOT OBSERVED ') + label.padEnd(58) + ' changed=' + changed + ' truthsDestroyed=' + tDestroyed + ' fabsShipped=' + fShipped + (ex.length ? '  e.g. ' + ex.map((e) => JSON.stringify(e)).join(' | ') : ''));
}
console.log('\nmutants: ' + M.length);
