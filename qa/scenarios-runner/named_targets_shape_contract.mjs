#!/usr/bin/env node
// NAMED TARGETS SHAPE — founder directive 2026-09-08 §5.
//
//   FIELD_NAME_MATCH != SEMANTIC_CONTRACT_MATCH
//
// WHY THIS EXISTS. Closing verifier #64's V64-D5 (namedTargets is capped and carried no envelope), the
// envelopes were first placed INSIDE context.collections — under a field name that looked right. It was
// wrong three ways at once, and all three are worth pinning because each is a different kind of wrong:
//
//   TYPE      context.collections is Record<string, CollectionEnvelope>. A map OF envelopes is not an
//             envelope (TS2352).
//   ORDER     the map was declared AFTER the literal that read it — TS2448/TS2454, the runtime-fatal TDZ
//             class this repo gates on, which is a crash and not a fallback.
//   MEANING   collections.namedTargets would not have BEEN an envelope, so the architecture contract that
//             asks "does every collection carry shown/total/truncated?" would have answered yes while the
//             model still could not tell whether it was seeing everything. That is the one that matters:
//             the other two are caught by a type-checker, this one is only caught by asking what the field
//             is FOR.
//
// Static, source-level, executed against the real declarations.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
};

// 1. namedTargets exists, is built from the targeted lookups, and is protected.
check('namedTargets holds the rows resolved from THIS turn\'s command',
  /const namedTargets = \{[\s\S]{0,600}companies: \(namedCompanyLookup\.data \|\| \[\]\)/.test(src)
  && /projects: \(namedProjectLookup\.data \|\| \[\]\)/.test(src)
  && /departments: \(namedDepartmentLookup\.data \|\| \[\]\)/.test(src),
  'six targeted lookups feed it: companies, people, tasks, goals, projects, departments');
check('namedTargets is minimum safe context and is never trimmed',
  /'activeChannelId', 'namedTargets'\]/.test(src)
  && !/\['namedTargets',/.test(src.slice(src.indexOf('const TRIM_ORDER'), src.indexOf('const contextTrimmed'))),
  'OTM §4.4: the canonical state for this turn\'s targets is not optional context');

// 2. TYPE — the envelope map is not smuggled into context.collections.
check('the namedTargets envelope is NOT placed inside context.collections',
  !/^\s*namedTargets: namedTargetsEnvelope,/m.test(src),
  'context.collections is Record<string, CollectionEnvelope>; a map OF envelopes is not one (TS2352)');
check('the namedTargets envelope sits beside its rows, where its shape is honest',
  /\(namedTargets as Record<string, unknown>\)\.collections = namedTargetsEnvelope;/.test(src));

// 3. ORDER — declared before use. A const read before its declaration is a crash, not a fallback.
check('the envelope is declared BEFORE the pack literal that carries it',
  src.indexOf('const namedTargetsEnvelope') > 0
  && src.indexOf('const namedTargetsEnvelope') < src.indexOf('const pack = { continuity, namedTargets,'),
  'TS2448/TS2454 are runtime-fatal here; declaration order is load-bearing, not cosmetic');

// 4. MEANING — every window in the group reports shown/total/truncated, computed from the cap that applies,
//    and an unknown total is null rather than a number nobody measured.
{
  const block = src.slice(src.indexOf('const namedTargetsEnvelope'), src.indexOf('const pack = { continuity, namedTargets,'));
  check('every named window reports shown, total and truncated',
    /shown: \(rows as unknown\[\]\)\.length/.test(block)
    && /truncated: \(rows as unknown\[\]\)\.length >= NAMED_LOOKUP_ROW_CAP/.test(block)
    && /total: \(rows as unknown\[\]\)\.length < NAMED_LOOKUP_ROW_CAP \? \(rows as unknown\[\]\)\.length : null/.test(block),
    'a capped window that cannot say it was capped is the defect this contract exists for');
  check('an unknown total is null, never a lower bound presented as exact',
    /: null,/.test(block) && !/total: NAMED_LOOKUP_ROW_CAP/.test(block),
    'OTM §4.3: array.length never means total — the mistake made and reverted in campaign #122');
}

// 5. The general rule, asserted where it can actually bite: nothing else may be added to context.collections
//    unless it is an envelope with the three fields.
{
  const collStart = src.indexOf('\n  const collections = {');
  const collText = src.slice(collStart, src.indexOf('\n  };', collStart));
  const entries = [...collText.matchAll(/^\s{4}(\w+):\s*(.+?),\s*$/gm)];
  const notEnvelope = entries.filter(([, , value]) =>
    !/^envelope\(/.test(value) && !/\{\s*shown:/.test(value));
  check('every entry in context.collections is a CollectionEnvelope, by value and not by name',
    notEnvelope.length === 0,
    'FIELD_NAME_MATCH != SEMANTIC_CONTRACT_MATCH — offenders: ' + notEnvelope.map((m) => m[1]).join(', '));
}

console.log(`\nnamed_targets_shape_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
