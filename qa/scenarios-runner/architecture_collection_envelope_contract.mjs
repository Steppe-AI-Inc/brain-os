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

// 2. Every array-valued pack key has an envelope entry.
const arrayKeys = [];
for (const m of packLine.matchAll(/(\w+):\s*(?:pack\w+|merged\w+|\w+\.data\s*\|\|\s*\[\]|conversationHistory|factoryWorkOrders)(?=[,\s}])/g)) arrayKeys.push(m[1]);
for (const bare of ['conversationHistory', 'factoryWorkOrders']) if (new RegExp('\\b' + bare + '\\b').test(packLine) && !arrayKeys.includes(bare)) arrayKeys.push(bare);
check('the pack carries array collections', arrayKeys.length >= 20, 'found ' + arrayKeys.length);
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
