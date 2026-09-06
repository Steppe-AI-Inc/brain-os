// v36: run the proposed regression file from a foreign cwd (os tmpdir) to prove cwd-independence.
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', '..', 'proposed', 'v36_regression_additions.mjs');
const r = spawnSync(process.execPath, [target], { cwd: tmpdir(), encoding: 'utf8', maxBuffer: 1 << 26 });
const lines = (r.stdout || '').split(/\r?\n/).filter(Boolean);
console.log('cwd=' + tmpdir() + ' exit=' + r.status + ' :: ' + lines[0]);
console.log(lines.filter((l) => /passed,/.test(l)).pop());
