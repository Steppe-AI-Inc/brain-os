// Runs the FULL battery against an alternative index.ts by seeding a temp tree (the 20 suites that ignore SEM_INDEX_SRC
// resolve index.ts relative to their own file). usage: node run_battery_on.mjs <index.ts>
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, cpSync, copyFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..', '..');
const alt = resolve(process.argv[2]);
const tree = join(here, 'tmp_tree');
rmSync(tree, { recursive: true, force: true });
mkdirSync(join(tree, 'qa', 'verification', 'scratch', 'v92'), { recursive: true });
mkdirSync(join(tree, 'supabase', 'functions', 'sem-ai-command'), { recursive: true });
cpSync(join(repo, 'qa', 'scenarios-runner'), join(tree, 'qa', 'scenarios-runner'), { recursive: true });
cpSync(join(repo, 'qa', 'verification', 'lib'), join(tree, 'qa', 'verification', 'lib'), { recursive: true });
for (const f of ['index.v92.ts', 'v92.lf.ts']) if (existsSync(join(repo, 'qa', 'verification', 'scratch', 'v92', f))) copyFileSync(join(repo, 'qa', 'verification', 'scratch', 'v92', f), join(tree, 'qa', 'verification', 'scratch', 'v92', f));
if (existsSync(join(repo, 'qa', 'KNOWN_FAILURE_MODES.md'))) copyFileSync(join(repo, 'qa', 'KNOWN_FAILURE_MODES.md'), join(tree, 'qa', 'KNOWN_FAILURE_MODES.md'));
for (const sub of ['lib', 'components', 'app']) if (existsSync(join(repo, 'web', sub))) cpSync(join(repo, 'web', sub), join(tree, 'web', sub), { recursive: true });
copyFileSync(alt, join(tree, 'supabase', 'functions', 'sem-ai-command', 'index.ts'));
const dir = join(tree, 'qa', 'scenarios-runner');
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const rows = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [join(dir, f)], { cwd: tree, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000, env: { ...process.env, SEM_INDEX_SRC: join(tree, 'supabase', 'functions', 'sem-ai-command', 'index.ts') } });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split(/\r?\n/).filter(Boolean);
  const summary = lines.filter((l) => /passed|failed|SUPERSEDED|PASS|FAIL|ok/i.test(l)).pop() || lines.pop() || '';
  rows.push({ file: f, exit: r.status, summary: summary.slice(0, 140) });
  console.log(`EXIT=${r.status} ${f} :: ${summary.slice(0, 110)}`);
}
const fails = rows.filter((r) => r.exit !== 0);
console.log(`\nBATTERY on ${alt}: ${rows.length} suites, ${fails.length} nonzero exits`);
for (const r of fails) console.log('  FAIL ' + r.file + ' :: ' + r.summary);
writeFileSync(join(here, 'battery_fix43_result.json'), JSON.stringify(rows, null, 1));
rmSync(tree, { recursive: true, force: true });
process.exit(fails.length ? 1 : 0);
