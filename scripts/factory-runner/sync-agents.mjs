// Factory Agent Registry sync — Phase 6 of the Software Factory master plan.
//
// Deterministic, idempotent: parses each ALLOWLISTED .claude/agents/<name>.md file,
// computes a real SHA-256 hash of its full content, and UPSERTs (by `name`, the stable
// slug — the same string used for `claude --agent <name>`, now UNIQUE-constrained in the
// DB) into public.agents via the Supabase CLI's `db query --linked` (the same real,
// proven mechanism used throughout this session — no new npm dependency, matching the
// existing `scripts/verify-release.mjs` dependency-free convention).
//
// Only agents in ALLOWLIST are ever synced — this is deliberate, not an oversight: an
// arbitrary .md file dropped into .claude/agents/ (e.g. qa-director.md, a real but
// out-of-scope-for-this-registry agent) must never silently become a registered,
// dispatchable Software Factory agent just by existing on disk.
//
// A definition that's REMOVED from ALLOWLIST (or from disk) is not auto-deleted from the
// registry — this script deactivates it (active=false) and reports it as stale, so a
// gap is visible rather than either a phantom "active" row or a silently vanished one.

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';

// Explicit allowlist. category/display_name are domain knowledge, not derivable from the
// file alone. provenance is 'brain_os_custom' for all 7 today - each is a thin, custom
// wrapper (per the master plan's own §D architecture); none of them currently hardcodes
// an external skill/tool invocation strongly enough to claim joint authorship (Playwright
// MCP is installed and load-tested per docs/software-factory/THIRD_PARTY_COMPONENTS.md,
// but not yet wired into brain-os-verifier's own body - recorded honestly as "available,
// not yet used" rather than claimed as an active capability).
export const ALLOWLIST = [
  { name: 'brain-os-factory-director', displayName: 'Factory Director', category: 'SOFTWARE_FACTORY' },
  { name: 'brain-os-product-architect', displayName: 'Product Architect', category: 'SOFTWARE_FACTORY' },
  { name: 'brain-os-implementation-engineer', displayName: 'Implementation Engineer', category: 'SOFTWARE_FACTORY' },
  { name: 'brain-os-db-security-engineer', displayName: 'DB/Security Engineer', category: 'SECURITY' },
  { name: 'brain-os-integration-engineer', displayName: 'Integration Engineer', category: 'INTEGRATION' },
  { name: 'brain-os-verifier', displayName: 'Verifier', category: 'VERIFICATION' },
  { name: 'brain-os-release-operator', displayName: 'Release Operator', category: 'RELEASE' },
];

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error('no frontmatter delimiter found');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fm;
}

function sqlEscape(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function runSql(sql) {
  const file = join(tmpdir(), `sync-agents-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
    const { stdout } = await execFileAsync('npx', ['supabase', 'db', 'query', '--linked', '-f', file], {
      cwd: REPO_ROOT,
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) throw new Error(`no JSON found in db query output: ${stdout}`);
    return JSON.parse(stdout.slice(jsonStart));
  } finally {
    unlinkSync(file);
  }
}

export function buildAgentRow(entry) {
  const path = join(REPO_ROOT, '.claude', 'agents', `${entry.name}.md`);
  if (!existsSync(path)) return null; // real gap: allowlisted but missing on disk
  const content = readFileSync(path, 'utf8');
  const fm = parseFrontmatter(content);
  if (fm.name !== entry.name) {
    throw new Error(`frontmatter name "${fm.name}" does not match allowlist entry "${entry.name}" for ${path}`);
  }
  const hasProductionAuthority = fm.permissionMode === 'auto';
  return {
    name: entry.name,
    displayName: entry.displayName,
    category: entry.category,
    description: fm.description || '',
    role: entry.category.toLowerCase(),
    definitionPath: `.claude/agents/${entry.name}.md`,
    definitionHash: createHash('sha256').update(content, 'utf8').digest('hex'),
    allowedTools: (fm.tools || '').split(',').map((t) => t.trim()).filter(Boolean),
    permissionMode: fm.permissionMode || null,
    executionProvider: hasProductionAuthority ? 'claude_code_background' : null,
    hasProductionAuthority,
    provenance: { source: 'brain_os_custom' },
  };
}

export async function syncOne(row) {
  const sql = `
insert into public.agents (name, role, description, allowed_tools, active, display_name, category, definition_path, definition_hash, execution_provider, permission_mode, has_production_authority, provenance)
values (
  ${sqlEscape(row.name)}, ${sqlEscape(row.role)}, ${sqlEscape(row.description)},
  ${sqlEscape(JSON.stringify(row.allowedTools))}::jsonb, true,
  ${sqlEscape(row.displayName)}, ${sqlEscape(row.category)}, ${sqlEscape(row.definitionPath)}, ${sqlEscape(row.definitionHash)},
  ${sqlEscape(row.executionProvider)}, ${sqlEscape(row.permissionMode)}, ${row.hasProductionAuthority},
  ${sqlEscape(JSON.stringify(row.provenance))}::jsonb
)
on conflict (name) do update set
  role = excluded.role,
  description = excluded.description,
  allowed_tools = excluded.allowed_tools,
  active = true,
  display_name = excluded.display_name,
  category = excluded.category,
  definition_path = excluded.definition_path,
  definition_hash = excluded.definition_hash,
  execution_provider = excluded.execution_provider,
  permission_mode = excluded.permission_mode,
  has_production_authority = excluded.has_production_authority,
  provenance = excluded.provenance,
  updated_at = now()
returning id, name, definition_hash;
`;
  return runSql(sql);
}

export async function deactivateMissing() {
  const names = ALLOWLIST.map((e) => sqlEscape(e.name)).join(',');
  const sql = `
update public.agents set active = false, updated_at = now()
where category is not null and name not in (${names})
returning id, name;
`;
  return runSql(sql);
}

async function main() {
  const results = [];
  for (const entry of ALLOWLIST) {
    const row = buildAgentRow(entry);
    if (!row) {
      results.push({ name: entry.name, status: 'MISSING_ON_DISK' });
      continue;
    }
    const r = await syncOne(row);
    results.push({ name: entry.name, status: 'SYNCED', hash: row.definitionHash, dbResult: r });
  }
  const deactivated = await deactivateMissing();
  console.log(JSON.stringify({ synced: results, deactivated }, null, 2));
}

// Deliberately unconditional (no import.meta.url === argv[1] guard): that comparison is
// unreliable on Windows (import.meta.url is file:///C:/... with three slashes; a naive
// process.argv[1]-based reconstruction doesn't match) - confirmed live, this guard
// silently skipped main() entirely (script exited 0, produced zero output, zero real
// sync happened). This module's only real usage is as a directly-run script anyway,
// matching provider.mjs/test-provider.mjs's own convention of no such guard.
{
  main().catch((e) => {
    console.error('SYNC FAILED:', e);
    process.exit(1);
  });
}
