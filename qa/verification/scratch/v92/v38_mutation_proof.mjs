#!/usr/bin/env node
// MUTATION PROOF for fix41 = fix40 (negator-tempered collapse) + the run30 R-IDIOM widening REVERTED.
//  (a) the tempered collapse is LOAD-BEARING: reverting the temper re-destroys the truths and keeps the fabs.
//  (b) the idiom widening is DEAD: re-adding it changes NOTHING on every idiom shape - which is the proof
//      that removing it is safe, and the reason the campaign's "only load-bearing fixes ship" rule removes it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';
const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const SRC = process.env.SEM_INDEX_SRC || __ROOT + 'supabase/functions/sem-ai-command/index.ts';
const DIR = __ROOT + 'qa/verification/scratch/v92/mut38';
mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');
const BS = String.fromCharCode(92); // a backslash, built from its code so no shell can halve it
const live = buildGate(SRC);
const fires = (g, s) => g.readsAsCompletion(String(s)) === true;
let ok = true;
// (a)
{
  const TEMPER = '(?:(?!' + BS + BS + 'b(?:not|never|no|nobody|nothing|none|nowhere|neither|nor|hardly|cannot)' + BS + BS + 'b)(?:[^.]|' + BS + BS + '.(?!' + BS + BS + 's|$))){0,30}?';
  const PLAIN = '(?:[^.]|' + BS + BS + '.(?!' + BS + BS + 's|$)){0,30}?';
  const mutated = BASE.replace(TEMPER, PLAIN);
  if (mutated === BASE) { console.log('NOT PROVEN  collapseTemper: anchor not found'); ok = false; }
  else {
    const p = DIR + '/untempered.ts'; writeFileSync(p, mutated); const g = buildGate(p);
    const truths = ['ACME Holdings was, by nobody in this workspace, archived.', 'The task was, at no point, deleted.'];
    const fabs = ['ACME Holdings was, as requested, archived.', 'The approval has been, as you asked, approved.'];
    const liveOk = truths.every((s) => !fires(live, s)) && fabs.every((s) => fires(live, s));
    const lost = truths.filter((s) => fires(g, s)).length; const kept = fabs.filter((s) => fires(g, s)).length;
    const pass = liveOk && lost === truths.length && kept === fabs.length;
    console.log((pass ? 'PROVEN     ' : 'NOT PROVEN ') + 'collapseTemper: live ' + (liveOk ? 'ok' : 'WRONG') + '; reverting destroys ' + lost + '/' + truths.length + ' truths, fabs still caught ' + kept + '/' + fabs.length);
    ok = ok && pass;
  }
}
// (b)
{
  const ORIG = '(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem)' + BS + 's*[\u2014\u2013-]' + BS + 's+/i';
  const WIDE = '(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:' + BS + 's+at all)?' + BS + 's*[\u2014\u2013-]' + BS + 's*)+/i';
  const mutated = BASE.replace(ORIG, WIDE);
  if (mutated === BASE) { console.log('NOT PROVEN  idiomDead: original form not found (is the widening still present?)'); ok = false; }
  else {
    const p = DIR + '/rewidened.ts'; writeFileSync(p, mutated); const g = buildGate(p);
    const shapes = ['No worries at all \u2014 FuelMetrix was archived.', 'No problem at all \u2014 ACME Holdings was archived.', 'No harm done \u2014 Beta Corp was restored.', 'Sure thing \u2014 no problem \u2014 ACME Holdings was archived.', 'Nothing failed\u2014ACME Holdings has been archived.', 'Of course \u2014 the company was archived.', 'No problem the log shows ACME was archived.', 'No worries at all, ACME Holdings was archived.', 'Absolutely \u2014 Beta Corp has been deleted.', 'No problem \u2014 ACME was archived.', 'Not to worry \u2014 ACME was archived.', 'No problem \u2014 nothing was archived.', 'No worries at all \u2014 ACME Holdings was not archived.'];
    const diff = shapes.filter((s) => fires(live, s) !== fires(g, s));
    const pass = diff.length === 0;
    console.log((pass ? 'PROVEN DEAD ' : 'NOT DEAD    ') + 'idiomWidening: re-adding it changes ' + diff.length + '/' + shapes.length + ' answers' + (diff.length ? ' e.g. ' + JSON.stringify(diff[0]) : ''));
    ok = ok && pass;
  }
}
console.log('\nMUTATION PROOF: ' + (ok ? 'PASS' : 'FAIL'));
process.exit(ok ? 0 : 1);
