// node run_with_src.mjs <index.ts> <suite.mjs>  — runs a suite with SEM_INDEX_SRC set (env prefix is sandbox-gated here)
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const [src, suite] = process.argv.slice(2);
const r = spawnSync(process.execPath, [suite], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26, env: { ...process.env, SEM_INDEX_SRC: resolve(src) } });
const out = (r.stdout || '') + (r.stderr || '');
console.log(out.trim().split('\n').filter((l) => /^(FAIL|v52_regression_additions|FAILING)/.test(l)).join('\n'));
console.log('EXIT', r.status, 'src', src);
