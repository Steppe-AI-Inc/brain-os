#!/usr/bin/env node
// MUTATION PROOF for fix44: a comma-isolated phrase that CARRIES the negation keeps its words (loses only
// its commas) before the predicate, so the negator stays inside the predicate's clause after the split.
// A contrastive 'not <Capital>' phrase is excluded and stays split (verifier #37's F1 control). Reverting
// the pre-pass must destroy the two truths; the contrast fabrication must stay caught either way.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';
const SRC = process.env.SEM_INDEX_SRC || 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts';
const DIR = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/mut40'; mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');
const PREPASS = '.replace(/,\\s*((?:[^,.\\x3b:!?()]{0,20}?)\\b(?:[Nn]ot|[Nn]ever|[Nn]o|[Nn]obody|[Nn]othing|[Nn]one|[Nn]either|[Nn]or)\\b(?!\\s+[A-Z])[^,.\\x3b:!?()]{0,20}?),\\s*(?=(?:[Ii]s|[Aa]re|[Ww]as|[Ww]ere|[Hh]as|[Hh]ave|[Hh]ad|[Ii]sn|[Aa]ren|[Ww]asn|[Ww]eren|[Hh]asn|[Hh]aven)\\b)/g, \' $1 \')';
if (!BASE.includes(PREPASS)) { console.log('NOT PROVEN: pre-pass not present in source'); process.exit(1); }
const mutated = BASE.replace(PREPASS, '');
const p = DIR + '/noprepass.ts'; writeFileSync(p, mutated);
const live = buildGate(SRC), g = buildGate(p);
const fires = (x, s) => x.readsAsCompletion(String(s)) === true;
// 'The record, at no point, had been deleted.' is NOT listed: no arm covers 'had been' at all, so it
// survives with or without the pre-pass and cannot discriminate this edit. First-draft expectation, corrected.
const truths = ['The company, none of it, is being archived.', 'ACME Holdings, by nobody here, is being archived.'];
const fabs = ['ACME, not FuelMetrix, is being archived.', 'ACME Holdings, as requested, is being archived.'];
const liveOk = truths.every((s) => !fires(live, s)) && fabs.every((s) => fires(live, s));
const lost = truths.filter((s) => fires(g, s)).length; const kept = fabs.filter((s) => fires(g, s)).length;
const ok = liveOk && lost === truths.length && kept === fabs.length;
console.log((ok ? 'PROVEN     ' : 'NOT PROVEN ') + 'fix44.negatorPhraseKeepsScope: live ' + (liveOk ? 'ok' : 'WRONG') + '; reverting destroys ' + lost + '/' + truths.length + ' truths, fabrications still caught ' + kept + '/' + fabs.length);
console.log('MUTATION PROOF: ' + (ok ? '1/1' : '0/1'));
process.exit(ok ? 0 : 1);
