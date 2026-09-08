// VERIFIER #60 FINDING V60-D8/D9 (P2, vacuous guard). The envelope contract derived its key list from a
// value-SHAPE regex (`packFoo`, `mergedFoo`, `x.data || []`), so it only ever checked the shapes it already
// knew. An array written any other way — `(approvals.data||[]).slice(0,20)`, a `.map()`, a `.filter()` —
// entered the pack with no CollectionEnvelope and no TRIM_ORDER entry, and the whole battery stayed green.
// The verifier proved it by mutation: it added `salaryBands: (approvals.data||[]).slice(0,20)` and nothing
// failed. index.ts calls this guard a "Backstop" in its own comment, which is precisely what it was not.
//
// Inversion: enumerate EVERY key in the pack literal and require each one to be either a declared scalar,
// or a collection with an envelope AND a place in the trim order or the minimum safe context. A key nobody
// classified now fails loudly, whatever shape its value is written in. The scalar list is deliberately
// explicit: adding a key means saying which kind it is.
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/scenarios-runner/architecture_collection_envelope_contract.mjs';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); }

must(`// 2. Every array-valued pack key has an envelope entry.
const arrayKeys = [];
for (const m of packLine.matchAll(/(\\w+):\\s*(?:pack\\w+|merged\\w+|\\w+\\.data\\s*\\|\\|\\s*\\[\\]|conversationHistory|factoryWorkOrders)(?=[,\\s}])/g)) arrayKeys.push(m[1]);
for (const bare of ['conversationHistory', 'factoryWorkOrders']) if (new RegExp('\\\\b' + bare + '\\\\b').test(packLine) && !arrayKeys.includes(bare)) arrayKeys.push(bare);
check('the pack carries array collections', arrayKeys.length >= 20, 'found ' + arrayKeys.length);`,
`// 2. EVERY key in the pack literal is classified. Deriving the list from value SHAPES made this guard
//    blind to any array written as an expression (verifier #60, V60-D8): the fix is to enumerate the keys
//    and require each to be a declared scalar or an enveloped collection.
//    The scalars are the minimum safe context plus the turn's own singular fields; anything else is a
//    collection and must carry shown/total/truncated and a place in the trim order.
const SCALAR_PACK_KEYS = [
  'command', 'collections', 'counts', 'continuity', 'currentTurn', 'activeChannelId', 'pendingAction',
  'recentlyResolvedEntities', 'recentlyDeletedEntities', 'contextBudget', 'organization', 'orgScope',
  'caller', 'permissions', 'channelState', 'executionEvidence', 'claimExecutionEvidence',
];
const packBody = packLine.slice(packLine.indexOf('{') + 1, packLine.lastIndexOf('}'));
const packKeys = [];
{
  let depth = 0, token = '';
  const flush = () => {
    const t = token.trim();
    token = '';
    if (!t) return;
    const m = t.match(/^([A-Za-z_$][\\w$]*)\\s*(?::|$)/);
    if (m) packKeys.push(m[1]);
  };
  for (const ch of packBody) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { flush(); continue; }
    token += ch;
  }
  flush();
}
check('every key in the pack literal was parsed', packKeys.length >= 25, 'parsed ' + packKeys.length + ': ' + packKeys.join(','));
const arrayKeys = packKeys.filter((k) => !SCALAR_PACK_KEYS.includes(k));
check('the pack carries array collections', arrayKeys.length >= 20, 'found ' + arrayKeys.length);
// A collection must also be trimmable, or the context budget cannot degrade it (incident 2026-09-08).
const trimOrder = src.slice(src.indexOf('const TRIM_ORDER'), src.indexOf('const contextTrimmed'));
for (const k of arrayKeys) {
  check('collections.' + k + ' is trimmable or is named in the minimum safe context',
    new RegExp("\\\\['" + k + "',").test(trimOrder) || new RegExp("'" + k + "'").test(src.slice(src.indexOf('const MINIMUM_SAFE_CONTEXT'), src.indexOf('const contextTrimmed'))),
    'a pack collection with no trim entry cannot degrade under budget pressure, so it can only 413 the turn');
}`, 'key enumeration');

writeFileSync(p, s.replace(/\n/g, '\r\n'));
console.log('envelope contract inverted to enumerate every pack key');
