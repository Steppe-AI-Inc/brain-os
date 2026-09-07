// VERIFIER #57 — run a script with SEM_INDEX_SRC set (and an optional cwd), teeing output to a log.
// usage: node run_with_src.mjs <script> <index path|-> <log> [cwd]
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const [script, idx, log, cwd] = process.argv.slice(2);
const env = { ...process.env };
if (idx && idx !== '-') env.SEM_INDEX_SRC = resolve(ROOT, idx); else delete env.SEM_INDEX_SRC;
const r = spawnSync(process.execPath, [resolve(ROOT, script)], { cwd: cwd ? resolve(ROOT, cwd) : ROOT, encoding: 'utf8', timeout: 600000, env });
const text = (r.stdout || '') + (r.stderr || '');
if (log) writeFileSync(resolve(ROOT, log), text);
const lines = text.trim().split('\n');
console.log(lines.filter((l) => /^FAIL|passed|failed|^FN |^FP |^NEG|RESID|EXECUTED|^NOTE 2b|^\{"total"|^ *[0-9]+ +qa\//.test(l)).slice(-60).join('\n'));
console.log('exit=' + r.status + ' script=' + script + ' src=' + (idx || '-') + (cwd ? ' cwd=' + cwd : ''));
