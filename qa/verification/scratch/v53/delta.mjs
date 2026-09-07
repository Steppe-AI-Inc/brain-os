// VERIFIER #53 — Q1: exact deploy-surface delta v92 (git c9dfab5bd433) -> candidate (working tree), re-derived.
// LF-normalised unified diff, hunk count, identifier delta on the extractor-visible belt (top-level const/function
// declarations inside the belt region and in the whole file), and result.summary overwrite site counts.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const cand = readFileSync('supabase/functions/sem-ai-command/index.ts');
const v92 = spawnSync('git', ['show', 'c9dfab5bd433:supabase/functions/sem-ai-command/index.ts'], { encoding: 'buffer', maxBuffer: 1 << 26 }).stdout;
const norm = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
const C = norm(cand), V = norm(v92);
writeFileSync('qa/verification/scratch/v53/cand.lf.ts', C); writeFileSync('qa/verification/scratch/v53/v92.lf.ts', V);
const d = spawnSync('git', ['diff', '--no-index', '--stat', 'qa/verification/scratch/v53/v92.lf.ts', 'qa/verification/scratch/v53/cand.lf.ts'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const du = spawnSync('git', ['diff', '--no-index', '-U0', 'qa/verification/scratch/v53/v92.lf.ts', 'qa/verification/scratch/v53/cand.lf.ts'], { encoding: 'utf8', maxBuffer: 1 << 26 });
writeFileSync('qa/verification/scratch/v53/v92_to_cand.lf.diff', du.stdout);
const hunks = (du.stdout.match(/^@@ /gm) || []).length;
const plus = (du.stdout.match(/^\+(?!\+\+)/gm) || []).length, minus = (du.stdout.match(/^-(?!--)/gm) || []).length;
// previous candidate 416c14c -> this candidate
const prev = norm(spawnSync('git', ['show', '416c14c:supabase/functions/sem-ai-command/index.ts'], { encoding: 'buffer', maxBuffer: 1 << 26 }).stdout);
writeFileSync('qa/verification/scratch/v53/prev.lf.ts', prev);
const dp = spawnSync('git', ['diff', '--no-index', '-U0', 'qa/verification/scratch/v53/prev.lf.ts', 'qa/verification/scratch/v53/cand.lf.ts'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const pplus = (dp.stdout.match(/^\+(?!\+\+)/gm) || []).length, pminus = (dp.stdout.match(/^-(?!--)/gm) || []).length;
// identifier delta: top-level (indent-insensitive) const/let/function declarations
const decls = (t) => new Set([...t.matchAll(/^\s*(?:const|let|function|async function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
const dc = decls(C), dv = decls(V);
const added = [...dc].filter((x) => !dv.has(x)), removed = [...dv].filter((x) => !dc.has(x));
// belt region identifier delta
const region = (t) => { const s = t.indexOf('const NEGATION_AUX ='); const e = t.indexOf('const legacyProseFallback ='); return t.slice(s, e); };
const beltC = region(C), beltV = region(V);
const beltDecl = (t) => [...t.matchAll(/^\s{8}const\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const summarySites = (t) => (t.match(/result\.summary\s*=(?!=)/g) || []).length;
const crlf = (b) => (b.toString('latin1').match(/\r\n/g) || []).length, lf = (b) => (b.toString('latin1').match(/\n/g) || []).length, bareCR = (b) => (b.toString('latin1').match(/\r(?!\n)/g) || []).length;
const out = {
  cand: { bytes: cand.length, sha256: sha(cand), crlf: crlf(cand), lf_total: lf(cand), bare_lf: lf(cand) - crlf(cand), bare_cr: bareCR(cand) },
  v92: { bytes: v92.length, sha256: sha(v92), crlf: crlf(v92), lf_total: lf(v92), bare_lf: lf(v92) - crlf(v92) },
  v92_to_cand_lf: { stat: d.stdout.trim(), hunks, plus, minus },
  prev416c14c_to_cand_lf: { plus: pplus, minus: pminus, diff: dp.stdout.split('\n').filter((l) => /^[+-](?![+-]{2})/.test(l)).map((l) => l.slice(0, 160)) },
  top_level_decl_delta: { candCount: dc.size, v92Count: dv.size, added, removed },
  belt_region: { candDecls: beltDecl(beltC), v92HasRegion: beltV.length > 0, v92Decls: beltV ? beltDecl(beltV) : null, candIncludesNamePrefixHit: beltC.includes('const namePrefixHit'), namePrefixHitCount: (C.match(/namePrefixHit/g) || []).length },
  result_summary_overwrite_sites: { cand: summarySites(C), v92: summarySites(V) },
};
console.log(JSON.stringify(out, null, 1));
writeFileSync('qa/verification/scratch/v53/delta.json', JSON.stringify(out, null, 1));
