#!/usr/bin/env node
// ARCHITECTURE CONTRACT — CollectionEnvelope (governance/OPERATING_TRUTH_MODEL.md §4.3).
//
// Every collection placed into the Brain context pack carries an envelope in
// context.collections with shown / total / truncated. A bare array with no envelope is the
// TRUNCATION_WITHOUT_METADATA defect class (docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md §4):
// the model reports "20 approvals" when the real total is 75.
//
// Static, source-level, no network. Fails on the pre-P1 source (no context.collections at all).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

// 1. The pack literal and the collections literal.
const packIdx = src.indexOf('\n  const pack = {');
check('pack literal found', packIdx > 0);
const packLine = src.slice(packIdx, src.indexOf('};', packIdx) + 2);
const collIdx = src.indexOf('\n  const collections = {');
check('collections envelope map found (P1)', collIdx > 0, 'context.collections is missing — every pack collection must carry shown/total/truncated');
const collText = collIdx > 0 ? src.slice(collIdx, src.indexOf('\n  };', collIdx)) : '';

// 2. EVERY key in the pack literal is classified. Deriving the list from value SHAPES made this guard
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
    const m = t.match(/^([A-Za-z_$][\w$]*)\s*(?::|$)/);
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
    new RegExp("\\['" + k + "',").test(trimOrder) || new RegExp("'" + k + "'").test(src.slice(src.indexOf('const MINIMUM_SAFE_CONTEXT'), src.indexOf('const contextTrimmed'))),
    'a pack collection with no trim entry cannot degrade under budget pressure, so it can only 413 the turn');
}
for (const k of arrayKeys) {
  check('collections.' + k + ' exists', new RegExp('(^|[\\s{,])' + k + ':\\s*(envelope\\(|\\{)').test(collText), 'no envelope for pack collection ' + k);
}

// 3. Envelope shape: shown, total, truncated present in the envelope helper; no total from array length alone.
const envHelper = src.slice(src.indexOf('const envelope = (res'), src.indexOf('const collections = {'));
check('envelope helper returns shown/total/truncated', /shown/.test(envHelper) && /total/.test(envHelper) && /truncated/.test(envHelper));
check('total comes from the query count, never from array length', /res\?\.count/.test(envHelper) && !/total:\s*\(res\?\.data\s*\|\|\s*\[\]\)\.length/.test(envHelper));

// 4. Every capped collection query carries { count: 'exact' } (the source of total).
const promiseAll = src.slice(src.indexOf('] = await Promise.all(['), src.indexOf('conversationCountQuery,\n  ]);'));
const selects = [...promiseAll.matchAll(/supabase\.from\('(\w+)'\)\.select\(([^)]*)\)[^\n]*\.limit\(\d+\)/g)];
check('capped collection queries found', selects.length >= 20, 'found ' + selects.length);
for (const m of selects) {
  check('query on ' + m[1] + ' carries an exact count', /count: 'exact'/.test(m[2]), m[0].slice(0, 120));
}

// 5. The pack is placed under context with the envelopes; the prompt tells the model to use them.
check('pack literal carries collections', /\bcollections,/.test(packLine));
check('prompt binds counts to context.collections', /context\.collections\.<name>\.total/.test(src));

console.log(`\narchitecture_collection_envelope_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
