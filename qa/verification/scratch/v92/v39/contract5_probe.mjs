// VERIFIER #39 — independent audit of v92_open_regression_contract CONTRACT 5's
// narrowed top-level-declaration detector. The committed COVERAGE case injects at ONE
// position (immediately before readsAsCompletion). If the brace-depth tracker drifts
// anywhere earlier — regex quantifiers `{0,5}`, character classes, string braces — an
// injection at that point would be silently missed and the contract could not fail for
// the reason it exists.
import { readSrc, CAND_PATH } from './belt39.mjs';
const src = readSrc(CAND_PATH);
const a = src.indexOf('const LEGACY_PAST_COMPLETION');
const b = src.indexOf('const legacyProseFallback');
const blk = src.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const topLevelDecls = (text) => {
  let depth = 0; const out = []; const tok = /[{}]|\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g; let m;
  while ((m = tok.exec(text)) !== null) {
    if (m[0] === '{') depth++;
    else if (m[0] === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && m[1]) out.push(m[1]);
  }
  return out;
};
const base = topLevelDecls(blk);
console.log('detected top-level decls (' + base.length + '): ' + base.join(', '));

// running depth at each top-level statement start
const anchors = ['const PROGRESS_VERBS', 'const EXECUTION_IN_PROGRESS', 'const hasSupportedMutationClaim',
  'const CONFIRMED_COMPLETION', 'const NEGATED_CLAUSE', 'const REFERENCELESS_CONFIRMATION',
  'const COMPLETION_PARTICIPLE', 'const COMPLETION_VERB', 'const NEGATION_AUX',
  'const completionIsNegated', 'const readsAsCompletion'];
let missed = 0;
for (const anchor of anchors) {
  const i = blk.indexOf(anchor);
  if (i < 0) { console.log('  ?? anchor not found: ' + anchor); continue; }
  const mutated = blk.slice(0, i) + 'const nx_' + anchor.slice(6, 14).replace(/\W/g, '') + ' = 1;\n        ' + blk.slice(i);
  const after = topLevelDecls(mutated);
  const found = after.some((d) => d.startsWith('nx_'));
  if (!found) { missed++; console.log('  MISS  injection before ' + anchor + ' is NOT detected'); }
  else console.log('  ok    injection before ' + anchor + ' detected');
}
console.log('\npositions where a new TOP-LEVEL declaration would go UNDETECTED: ' + missed + ' of ' + anchors.length);

// Does the narrowing hide a LOCAL change that a suite actually drops?
// run15 grabs completionIsNegated brace-balanced, so its locals travel. Prove that.
const bal = (s, from, o, c) => { const i = s.indexOf(from); let d = 0, st = false; for (let j = i; j < s.length; j++) { if (s[j] === o) { d++; st = true; } else if (s[j] === c) { d--; if (st && d === 0) return s.slice(i, j + 1); } } return ''; };
const cin = bal(src, 'const completionIsNegated =', '{', '}');
console.log('completionIsNegated brace-balanced grab length: ' + cin.length
  + '; carries nameInternal=' + cin.includes('nameInternal')
  + ' titleHead=' + cin.includes('titleHead')
  + ' ppInternal=' + cin.includes('ppInternal')
  + ' newSubject=' + cin.includes('newSubject')
  + ' objectName=' + cin.includes('objectName'));
process.exit(missed === 0 ? 0 : 1);
