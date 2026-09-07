// Verifier #50 — is the v30 gate's new red a CANDIDATE fact or an INSTRUMENT fact?
// A: unpatched v30 against 894c958 (the previous candidate, where the record says 25/1).
// B: unpatched v30 against HEAD (crashes: ReferenceError knownEntityNames).
// C: v30 with ONE line changed — its own buildBelt injects `const knownEntityNames = new Set()`
//    (the battery's structural default, an EMPTY pack) — against HEAD.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const V30 = 'qa/verification/scratch/v92/v30_regression_additions.mjs';
const run = (file, src) => {
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', env: { ...process.env, SEM_INDEX_SRC: src }, maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = (out.match(/^ok /gm) || []).length, fail = (out.match(/^FAIL/gm) || []).length;
  const crash = /ReferenceError|TypeError|SyntaxError/.test(out) ? out.match(/(ReferenceError|TypeError|SyntaxError)[^\n]*/)[0] : null;
  return { exit: r.status, ok, fail, crash, fails: out.split('\n').filter((l) => /^FAIL/.test(l)).map((l) => l.slice(0, 200)) };
};
const src = readFileSync(V30, 'utf8').replace(/\r\n/g, '\n');
const needle = "const fn = new Function('const verifiedClaims = [];\\n' + slice";
if (!src.includes(needle)) throw new Error('v30 buildBelt anchor not found');
const patched = 'qa/verification/scratch/v50/v30_patched_emptyset.mjs';
// EVERY builder in v30 (buildBelt AND buildDecision) evaluates the belt block, so the empty set is
// injected at every `new Function('` site — one mechanical change, nothing else in v30 touched.
const site2 = "'hasRejectedClaims',\n    slice + '\\nreturn { legacyProseFallback";
if (!src.includes(site2)) throw new Error('v30 buildDecision anchor not found');
let p = src.split(needle).join("const fn = new Function('const verifiedClaims = []; const knownEntityNames = new Set();\\n' + slice");
p = p.split(site2).join("'hasRejectedClaims',\n    'const knownEntityNames = new Set();\\n' + slice + '\\nreturn { legacyProseFallback");
writeFileSync(patched, p.replace(/from '\.\.\/\.\.\/lib\//g, "from '../../lib/").replace(/'\.\.\/\.\.\/\.\.\/supabase/g, "'../../../supabase"));
console.log('injection sites patched in the v30 copy: 2 (buildBelt body, buildDecision body)');
const HEAD = 'supabase/functions/sem-ai-command/index.ts';
const PREV = 'qa/verification/scratch/v50/index.894c958.ts';
console.log('A  v30 unpatched vs 894c958:', JSON.stringify(run(V30, PREV)));
console.log('B  v30 unpatched vs HEAD   :', JSON.stringify(run(V30, HEAD)));
console.log('C  v30 +emptySet  vs HEAD  :', JSON.stringify(run(patched, HEAD)));
console.log('D  v30 +emptySet  vs 894c958:', JSON.stringify(run(patched, PREV)));
