#!/usr/bin/env node
// VERIFIER #59 — historical gates v46..v58 (qa/verification/proposed/v*_regression_additions.mjs) run from the
// repo root, one child each; records exit code and the pass/fail line.
import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const DIR = join(ROOT, 'qa/verification/proposed');
const files = readdirSync(DIR).filter((f) => /^v(4[6-9]|5[0-8])_regression_additions\.mjs$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
const out = []; let log = '';
for (const f of files) {
  const r = spawnSync(process.execPath, [join(DIR, f)], { cwd: ROOT, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  const text = (r.stdout || '') + (r.stderr || '');
  const m = text.match(/(\d+)\s+passed,\s+(\d+)\s+failed/) || text.match(/(\d+)\s+pass(?:ed)?[^\d]+(\d+)\s+fail/i);
  const fails = text.split(/\r?\n/).filter((l) => /^\s*(FAIL|✗|not ok|✖)/.test(l)).slice(0, 12);
  const rec = { file: f, exit: r.status, passed: m ? +m[1] : null, failed: m ? +m[2] : null, fails };
  out.push(rec);
  const line = `${String(rec.exit).padStart(3)}  ${f.padEnd(40)} ${m ? m[1] + '/' + m[2] : '-'}\n${fails.map((l) => '      ' + l.slice(0, 200)).join('\n')}`;
  log += line + '\n'; console.log(line);
}
writeFileSync(join(HERE, 'gates.json'), JSON.stringify(out, null, 2));
writeFileSync(join(HERE, 'gates.log'), log);
