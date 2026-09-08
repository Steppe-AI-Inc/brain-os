// Every suite that slices a window which reads REQUEST_FRAME_ALTERNATION has to bring the real declaration
// with it. Rather than teach ten suites about one constant, wrap their plain `stripTS(...)` slice sites with
// the shared extractor, which is a no-op unless the slice actually references it.
//
// This is the cost of removing the twin, and it is the right cost: one definition in the product, one
// extractor in the harness, instead of two lists that drift apart once per round.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILES = [
  'qa/scenarios-runner/company_lifecycle_matrix.mjs',
  'qa/scenarios-runner/structured_claim_laundering_contract.mjs',
  'qa/scenarios-runner/structured_claim_verification.mjs',
  'qa/scenarios-runner/v56_intent_lifecycle_contract.mjs',
  'qa/scenarios-runner/v57_intent_other_veto_contract.mjs',
  'qa/scenarios-runner/v58_lifecycle_window_and_imperative_contract.mjs',
  'qa/scenarios-runner/v59_intent_fallback_tier_contract.mjs',
  'qa/scenarios-runner/v61_budget_intent_language_contract.mjs',
  'qa/scenarios-runner/v62_provenance_language_and_limits_contract.mjs',
  'qa/scenarios-runner/v63_intent_coverage_and_caps_contract.mjs',
];

for (const f of FILES) {
  let s = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const before = s;

  // 1. make sure withSharedConstants is imported, whichever import style the suite uses.
  if (!s.includes('withSharedConstants')) {
    const staticImport = /import \{ ([^}]*) \} from '([^']*_gate_extract\.mjs)';/;
    const dynamicImport = /const \{ ([^}]*) \} = await import\(/;
    if (staticImport.test(s)) s = s.replace(staticImport, (m, names, path) => `import { ${names.trim()}, withSharedConstants } from '${path}';`);
    else if (dynamicImport.test(s)) s = s.replace(dynamicImport, (m, names) => `const { ${names.trim()}, withSharedConstants } = await import(`);
    else { console.log('NO IMPORT SITE: ' + f); continue; }
  }

  // 2. wrap bare stripTS(...) slice sites. withPatternsAboveWindow already carries the constants, and a
  //    double wrap is harmless (the prefix is only added when the slice references the name), but skip the
  //    ones already wrapped to keep the diff honest.
  s = s.replace(/(?<!withSharedConstants\()(?<!withPatternsAboveWindow\(source, )(?<!withPatternsAboveWindow\(src, )(?<!withPatternsAboveWindow\(SRC, )(?<!withPatternsAboveWindow\(RAW, )stripTS\((src|SRC|source|RAW|lf)\.slice\(/g,
    (m, v) => `withSharedConstants(${v}, stripTS(${v}.slice(`);
  // close the extra paren: each rewritten site needs one more ')'
  // done by matching the rewritten call and balancing at the end of its argument list
  const lines = s.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('withSharedConstants(') || !lines[i].includes('stripTS(')) continue;
    const at = lines[i].indexOf('withSharedConstants(');
    let depth = 0, end = -1;
    for (let k = at; k < lines[i].length; k++) {
      const ch = lines[i][k];
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) { end = k; break; } }
    }
    if (end < 0) continue;                      // spans lines; handled by the balanced form below
    if (lines[i].slice(at, end + 1).split('(').length === lines[i].slice(at, end + 1).split(')').length) {
      lines[i] = lines[i].slice(0, end + 1) + ')' + lines[i].slice(end + 1);
    }
  }
  s = lines.join('\n');

  if (s === before) { console.log('unchanged: ' + f); continue; }
  writeFileSync(f, s.replace(/\n/g, '\r\n'));
  let ok = true;
  try { execFileSync(process.execPath, [f], { stdio: 'pipe' }); } catch { ok = false; }
  console.log((ok ? 'GREEN  ' : 'still red ') + f.split('/').pop());
}
