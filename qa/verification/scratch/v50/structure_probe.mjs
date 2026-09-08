// Verifier #50 — structural probe of the candidate vs deployed v92 (read-only).
//  1. regex literals both builds gate on (printed, so my corpus attacks the REAL shapes);
//  2. the two V49-D1 history strips (legacyProseFallback / unaccountedCompletionProse) are byte-identical;
//  3. every prose arm the candidate inherits from v92 is byte-identical (claimsLifecycleClaim,
//     findEntityStateClaimContradiction, the *_STATE_CLAIM_VOCAB literals, the four lifecycle call sites,
//     the two state-claim call sites) — the "fourth path" hunt;
//  4. the nameInternal expression at HEAD equals the 894c958 expression + the D4 disjunct (attack (e)).
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extractConst, extractFunction } from '../../lib/belt_extract.mjs';

const CAND = readFileSync(new URL('./index.cand.lf.ts', import.meta.url), 'utf8');
const V92 = readFileSync(new URL('./index.v92.git.ts', import.meta.url), 'utf8');
const PREV = execSync('git show 894c958:supabase/functions/sem-ai-command/index.ts', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');

const lit = (t, n) => { const m = t.match(new RegExp('const ' + n + ' = (/[^\\n]*/[a-z]*);')); return m ? m[1] : null; };
console.log('== 1. regex literals ==');
for (const n of ['PAST_COMPLETION_CLAIM_PATTERN', 'FUTURE_PROMISE_PATTERN']) {
  console.log('v92  ' + n + ' = ' + lit(V92, n));
  console.log('cand ' + n + ' = ' + lit(CAND, n));
  console.log('   same? ' + (lit(V92, n) === lit(CAND, n)));
}
for (const n of ['LEGACY_PAST_COMPLETION', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VOCAB', 'NEGATION_AUX', 'PROGRESS_VERBS']) {
  let d = null; try { d = extractConst(CAND, n); } catch { }
  console.log('cand ' + n + ' = ' + (d ? d.slice(0, 900) : '(absent)'));
}

console.log('\n== 2. D1 strip identity across both consumers ==');
const stripRe = /readsAsCompletion\(result\.pendingAction \? String\(result\.summary \|\| ''\)\.replace\((\/(?:[^\/\\\n]|\\.)+\/g), ' '\) : String\(result\.summary \|\| ''\)\)/g;
const strips = [...CAND.matchAll(stripRe)].map((m) => m[1]);
console.log('strip occurrences: ' + strips.length + ' identical: ' + (strips.length === 2 && strips[0] === strips[1]));
console.log('strip = ' + strips[0]);

console.log('\n== 3. inherited prose arms byte-identical? ==');
const fnEq = (n) => { try { return extractFunction(CAND, n) === extractFunction(V92, n); } catch (e) { return 'ERR ' + e.message; } };
const constEq = (n) => { try { return extractConst(CAND, n) === extractConst(V92, n); } catch (e) { return 'ERR ' + e.message; } };
for (const n of ['claimsLifecycleClaim', 'findEntityStateClaimContradiction']) console.log('function ' + n + ': ' + fnEq(n));
for (const n of ['COMPANY_STATE_CLAIM_VOCAB', 'PERSON_STATE_CLAIM_VOCAB', 'stateDescriptionPattern', 'PAST_COMPLETION_CLAIM_PATTERN', 'FUTURE_PROMISE_PATTERN']) console.log('const ' + n + ': ' + constEq(n));
const sites = (t, re) => [...t.matchAll(re)].map((m) => m[0]).join('\n');
const lifeRe = /claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '[^']+', '[^']+'\)/g;
console.log('lifecycle call sites identical: ' + (sites(CAND, lifeRe) === sites(V92, lifeRe)) + ' (' + sites(V92, lifeRe).split('\n').length + ')');
const stateRe = /findEntityStateClaimContradiction\([\s\S]{0,400}?\)\s*\n\s*: null;/g;
console.log('state-claim call sites identical: ' + (sites(CAND, stateRe) === sites(V92, stateRe)) + ' (' + sites(V92, stateRe).split('\n').length + ' lines)');
for (const n of ['claimsTaskDeleted', 'claimsCompanyDeleted', 'claimsPersonDeleted', 'claimsGoalDeleted', 'companyStateClaimResult', 'personStateClaimResult', 'hasResolvedEntities', 'modelProposedPendingAction']) console.log('const ' + n + ': ' + constEq(n));
// v92 result.summary overwrite sites (the fourth-path inventory)
console.log('v92 result.summary assignment lines: ' + [...V92.matchAll(/^.*result\.summary = .*$/gm)].map((m) => V92.slice(0, m.index).split('\n').length).join(','));

console.log('\n== 4. nameInternal at HEAD vs 894c958 (attack (e)) ==');
const ni = (t) => { const m = t.match(/const nameInternal = ([\s\S]*?) && !\/\\bnor\\b\/\.test\(c\);/); return m ? m[1] : null; };
const prevNI = ni(PREV), headNI = ni(CAND);
console.log('894c958 nameInternal core = ' + prevNI);
console.log('HEAD    nameInternal core = ' + headNI);
const D4 = " || ((__l) => __l !== null && knownEntityNames.has((mm[0] + __l[0]).replace(/\\s+$/, '').replace(/['’]s$/, '').toLowerCase()))(/^(?:\\s+[a-z][\\w&.'’-]*){1,6}?(?=\\s+(?:was|were|has|have|had|is|are)\\b)/.exec(after))";
const expected = '(' + prevNI.replace(/^\(capLead && subjectRun \|\| /, '(capLead && subjectRun) || ').replace(/\)$/, '') + D4 + ')';
console.log('HEAD == "(prev with (capLead && subjectRun) parenthesised) + D4 disjunct"? ' + (headNI === expected));
if (headNI !== expected) { console.log('expected = ' + expected); }
const cursor = CAND.match(/if \(nameInternal\) \{[^\n]*\n/);
console.log('cursor-advance block present: ' + !!cursor + '\n' + (cursor ? cursor[0].slice(0, 700) : ''));
console.log('literal ";" inside readsAsCompletion declaration: ' + (extractConst(CAND, 'readsAsCompletion').includes(';') ? 'YES' : 'none (x3b escapes only)'));
