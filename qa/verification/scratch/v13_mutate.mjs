// verifier #13 mutation battery (campaign #73, sha ace9b6a).
// Applies each mutation to the REAL source, re-runs the ENTIRE committed battery,
// restores, and sha256-verifies the restore is byte-identical. A mutant that leaves
// the battery green is a SURVIVOR = an unobserved guard (vacuous-guard class).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const GATE = 'qa/scenarios-runner/_gate_extract.mjs';
const CONT = 'qa/scenarios-runner/current_turn_and_continuity_contract.mjs';
const BASE_SHA = '021c8989de675035709f48e438d590b2e417677a9625f80a9708cd2dd8a4b786';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

if (sha(INDEX) !== BASE_SHA) { console.log('BASELINE MISMATCH — abort'); process.exit(2); }

// Each mutant: {id, file, find, replace, why}
const MUTANTS = [
  { id: 'M1.d91.adjectivalAllowlist', file: INDEX, why: 'run12/D91: neutralise the leading-participle refusal (allow every leading completion word)',
    find: `            if (completionIdx === 0 && !ADJECTIVAL_COMPLETION.test(words[0])) return null;`,
    replace: `            if (false && completionIdx === 0 && !ADJECTIVAL_COMPLETION.test(words[0])) return null;` },
  { id: 'M2.d91.determinerRule', file: INDEX, why: 'run12/D91: neutralise the determiner/ALL-CAPS second-word refusal',
    find: `            if (completionIdx === 0 && words.length > 1
                && (/^[\\p{Lu}0-9]{2,}$/u.test(words[1]) || DETERMINER_OR_PRONOUN.test(words[1]))) return null;`,
    replace: `            if (false && completionIdx === 0 && words.length > 1
                && (/^[\\p{Lu}0-9]{2,}$/u.test(words[1]) || DETERMINER_OR_PRONOUN.test(words[1]))) return null;` },
  { id: 'M3.d90.titleCaseGate', file: INDEX, why: 'run12/D90: neutralise the Title-Case name-shape gate (the claimed-non-redundant guard)',
    find: `            if (!titleCasedName) return null;`,
    replace: `            if (false && !titleCasedName) return null;` },
  { id: 'M4.d91.positionRule', file: INDEX, why: 'run11/D86 POSITION rule: neutralise completionIdx>0 refusal',
    find: `            if (completionIdx > 0) return null;`,
    replace: `            if (false && completionIdx > 0) return null;` },
  { id: 'M5.d92.firstPersonBelt', file: INDEX, why: 'run12/D92: neutralise the first-person completion belt over the question cut',
    find: `          if (FIRST_PERSON_COMPLETION.test(q)) return null;`,
    replace: `          if (false && FIRST_PERSON_COMPLETION.test(q)) return null;` },
  { id: 'M6.d88.commaClauseCut', file: INDEX, why: 'run11/D88: neutralise the last-comma-clause reduction',
    find: `            if (tail.length > 0 && (COMPLETION_WORD.test(head) || PAST_COMPLETION_CLAIM_PATTERN.test(head))) q = tail;`,
    replace: `            if (false && tail.length > 0 && (COMPLETION_WORD.test(head) || PAST_COMPLETION_CLAIM_PATTERN.test(head))) q = tail;` },
  { id: 'M7.d93.matcherStrip', file: INDEX, why: 'run12/D93: revert the matcher to a literal comparison (drop presentation stripping)',
    find: `  const forMatching = (s: string) => s.replace(/[“”‘’"']/g, '').replace(/\\s+/g, ' ').trim().toLowerCase();`,
    replace: `  const forMatching = (s: string) => s.trim().toLowerCase();` },
  { id: 'M8.d95.collisionNumbering', file: INDEX, why: 'run12/D95: neutralise the colliding-fallback numbering',
    find: `              if (o && typeof o.label === 'string' && labelCounts.get(o.label) > 1) {`,
    replace: `              if (false && o && typeof o.label === 'string' && labelCounts.get(o.label) > 1) {` },
  { id: 'M9.d94.passiveProgressive', file: INDEX, why: 'run12/D94: remove the passive-progressive arm',
    find: `          '|(?:is|are|was|were) (?:being |getting )?(?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)' +`,
    replace: `          '|(?:zzzz_never_matches)' +` },
  { id: 'M10.d94.imminentArms', file: INDEX, why: 'run12/D94: remove the imminent/polite arms (about to / in the process of / let me / kicking off)',
    find: `          '|(?:about to|going to|proceeding to|starting to) (?:archive|restore|delete|remove|assign|reassign|update|create|move|end|rename|close|clear|grant|decline|approve|reject|complete|activate|deactivate|add|send)' +`,
    replace: `          '|(?:zzzz_never_matches2)' +` },
  { id: 'M11.d94.bareGerundLead', file: INDEX, why: 'run12/D94: remove the bare-gerund-leading arm',
    find: `          '|^(?:' + PROGRESS_VERBS + ') ' +`,
    replace: `          '|^(?:zzzz_never_matches3) ' +` },
  { id: 'M12.d87.sharedProgressVerbs', file: INDEX, why: 'run11/D87: shrink the shared PROGRESS_VERBS list back to the pre-run11 short arm-3 list',
    find: `        const PROGRESS_VERBS = 'assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending';`,
    replace: `        const PROGRESS_VERBS = 'assigning|updating|creating|moving';` },
  { id: 'M13.gate.callbackArrowStrip', file: GATE, why: 'run11/D85: remove the shared callback-arrow strip from the QA extractor',
    find: `  s = s.replace(
    /\\(([A-Za-z_$][\\w$]*\\s*:\\s*[^),]+(?:,\\s*[A-Za-z_$][\\w$]*\\s*:\\s*[^),]+)*)\\)\\s*=>/g,
    (_m, params) => '(' + params.split(',').map((p) => p.split(':')[0].trim()).join(', ') + ') =>');`,
    replace: `  // callback-arrow strip removed by mutation M13` },
  { id: 'M14.cont.anchorGuard', file: CONT, why: 'run11: remove the ordering-check anchor existence guard (the mutant #12 classified EQUIVALENT)',
    find: `iCtx >= 0 && iPending >= 0 && `, replace: `` },
];

const results = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, 'utf8');
  const beforeSha = sha(m.file);
  if (!original.includes(m.find)) {
    results.push({ id: m.id, applied: false, note: 'ANCHOR NOT FOUND — mutation not applied', why: m.why });
    console.log('SKIP  ' + m.id + '  (anchor not found)');
    continue;
  }
  writeFileSync(m.file, original.replace(m.find, m.replace));
  const r = spawnSync(process.execPath, ['qa/verification/scratch/v13_run_battery.mjs'], {
    encoding: 'utf8', env: { ...process.env, V13_ALLOW_MUTATED: '1', V13_TAG: 'mut_' + m.id, V13_QUIET: '1' }, maxBuffer: 64 * 1024 * 1024,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  writeFileSync('qa/verification/scratch/v13/mut_' + m.id + '.log', out);
  const killedBy = out.split('\n').filter((l) => /^\s*[1-9]\d*\s/.test(l) || /FAIL=[1-9]/.test(l)).map((l) => l.trim().split(/\s+/)[1]).filter(Boolean);
  const green = /ALL EXIT ZERO: true/.test(out);
  writeFileSync(m.file, original);
  const afterSha = sha(m.file);
  results.push({ id: m.id, why: m.why, applied: true, battery_green: green,
    verdict: green ? 'SURVIVED (unobserved guard)' : 'KILLED', killed_by: [...new Set(killedBy)],
    restore_byte_identical: afterSha === beforeSha, sha: afterSha });
  console.log((green ? 'SURVIVED  ' : 'KILLED    ') + m.id.padEnd(32) + ' restore_ok=' + (afterSha === beforeSha) + '  killed_by=' + [...new Set(killedBy)].join(','));
}

writeFileSync('qa/verification/scratch/v13/v13_mutation_report.json', JSON.stringify({
  base_sha: BASE_SHA, index_sha_final: sha(INDEX), gate_sha_final: sha(GATE), cont_sha_final: sha(CONT),
  ran_at: new Date().toISOString(), results }, null, 1));
console.log('\nFINAL index.ts sha256 ' + sha(INDEX) + '  identical=' + (sha(INDEX) === BASE_SHA));
console.log('SURVIVORS: ' + results.filter((r) => r.verdict === 'SURVIVED (unobserved guard)').map((r) => r.id).join(', ') || '(none)');
