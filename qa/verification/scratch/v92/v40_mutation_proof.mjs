#!/usr/bin/env node
// MUTATION PROOF for fix44b: a comma-isolated phrase whose negator is a PRONOUN (none / nobody / no one)
// keeps its words and loses only its commas, so the negator stays inside the predicate's clause after the
// split. Determiner and adverb negators are deliberately NOT covered - the first fix44 kept every negator
// phrase and hid five fabrications production catches ('no doubt', 'not surprisingly', 'nothing to worry
// about', 'no problem', 'nothing else'), so those are asserted in the FABRICATION direction here.
// A contrastive 'not <Capital>' phrase stays split (verifier #37's F1 control).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';
const SRC = process.env.SEM_INDEX_SRC || 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts';
const DIR = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/mut40'; mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');
const PREPASS = '.replace(/,\\s*((?:[^,.\\x3b:!?()]{0,20}?)\\b(?:[Nn]one|[Nn]obody|[Nn]o one)\\b(?!\\s+[A-Z])[^,.\\x3b:!?()]{0,20}?),\\s*(?=(?:[Ii]s|[Aa]re|[Ww]as|[Ww]ere|[Hh]as|[Hh]ave|[Hh]ad|[Ii]sn|[Aa]ren|[Ww]asn|[Ww]eren|[Hh]asn|[Hh]aven)\\b)/g, \' $1 \')';
if (!BASE.includes(PREPASS)) { console.log('NOT PROVEN: pre-pass not present in source'); process.exit(1); }
const p = DIR + '/noprepass.ts'; writeFileSync(p, BASE.replace(PREPASS, ''));
const live = buildGate(SRC), g = buildGate(p);
const fires = (x, s) => x.readsAsCompletion(String(s)) === true;
// 'had been' is not listed: no arm covers it, so it survives either way and cannot discriminate.
const truths = ['The company, none of it, is being archived.', 'ACME Holdings, by nobody here, is being archived.'];
const fabs = ['ACME, not FuelMetrix, is being archived.', 'ACME Holdings, as requested, is being archived.',
  'ACME Holdings, no doubt, was archived.', 'ACME Holdings, nothing to worry about, was archived.', 'The task, nothing else, was deleted.'];
const liveOk = truths.every((s) => !fires(live, s)) && fabs.every((s) => fires(live, s));
const lost = truths.filter((s) => fires(g, s)).length; const kept = fabs.filter((s) => fires(g, s)).length;
const ok = liveOk && lost === truths.length && kept === fabs.length;
console.log((ok ? 'PROVEN     ' : 'NOT PROVEN ') + 'fix44b.pronounNegatorPhraseKeepsScope: live ' + (liveOk ? 'ok' : 'WRONG') + '; reverting destroys ' + lost + '/' + truths.length + ' truths, fabrications still caught ' + kept + '/' + fabs.length);
console.log('MUTATION PROOF: ' + (ok ? '1/1' : '0/1'));
process.exit(ok ? 0 : 1);
