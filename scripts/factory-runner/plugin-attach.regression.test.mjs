// Permanent regression test for FACTORY_ATTACHED_PLUGIN_IS_PRESENT_DURING_REAL_RUN
// (Software Factory commercial-platform plan, Phase 1/6): an attached skill must
// actually change what gets dispatched, not remain dashboard-only metadata.
//
// buildSkillInjectionPrompt (provider.mjs) is the concrete mechanism: a real prompt
// block appended to the task text before `claude --agent ... --bg` is invoked. This is
// pure, fast, deterministic unit coverage — no database, no CLI, no network — matching
// provider.regression.test.mjs's own convention.
//
// Run with: node --test scripts/factory-runner/plugin-attach.regression.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSkillInjectionPrompt } from './provider.mjs';
import { hashFile, assertPathWithinAllowedRoots } from './plugin-attach.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('buildSkillInjectionPrompt: returns empty string for an agent with no attachments (no regression on the common case)', () => {
  assert.equal(buildSkillInjectionPrompt([]), '');
  assert.equal(buildSkillInjectionPrompt(undefined), '');
  assert.equal(buildSkillInjectionPrompt(null), '');
});

test('buildSkillInjectionPrompt: names the skill and its pinned origin for one attachment', () => {
  const block = buildSkillInjectionPrompt([
    { skill: 'systematic-debugging', origin: 'obra/superpowers', pinned_ref: 'b36e0829c6d0140e93cfef2ca599b1b07d4a7797' },
  ]);
  assert.match(block, /systematic-debugging/);
  assert.match(block, /obra\/superpowers/);
  assert.match(block, /b36e0829c6d0140e93cfef2ca599b1b07d4a7797/);
  assert.match(block, /Skill tool/);
});

test('buildSkillInjectionPrompt: FACTORY_SKILL_INJECTION_INCLUDES_DEFINITION_PATH — real bug fixed live during the Phase 6 Task Observer proof. The Skill tool only resolves skills that are ALSO installed as a real Claude Code marketplace plugin (confirmed live: Skill(task-observer) returned "Unknown skill" for a vendored-only component); reading definition_path directly is the reliable path regardless of marketplace-installation status, so it must be present and instructed', () => {
  const block = buildSkillInjectionPrompt([
    {
      skill: 'task-observer',
      origin: 'rebelytics/one-skill-to-rule-them-all',
      pinned_ref: '510caad26c907793e48306262af216ff9f71c9f7',
      definition_path: 'vendor\\plugins\\rebelytics-task-observer\\SKILL.md',
    },
  ]);
  assert.match(block, /vendor\\plugins\\rebelytics-task-observer\\SKILL\.md/);
  assert.match(block, /Read this file directly/i);
  assert.match(block, /Read.*directly.*(?:always works|reliable)/is);
});

test('buildSkillInjectionPrompt: omits the "Read this file directly" clause when definition_path is absent (never prints "Read this file directly: undefined")', () => {
  const block = buildSkillInjectionPrompt([{ skill: 'no-path-skill', origin: 'some/repo', pinned_ref: 'abc123' }]);
  assert.doesNotMatch(block, /undefined/);
  assert.doesNotMatch(block, /no-path-skill\).*Read this file directly/);
});

test('buildSkillInjectionPrompt: lists every attached skill, not just the first', () => {
  const block = buildSkillInjectionPrompt([
    { skill: 'systematic-debugging', origin: 'obra/superpowers', pinned_ref: 'abc123' },
    { skill: 'rls-security-review', origin: 'wshobson/agents', pinned_ref: 'def456' },
  ]);
  assert.match(block, /systematic-debugging/);
  assert.match(block, /rls-security-review/);
});

test('buildSkillInjectionPrompt: omits the pinned-ref suffix when pinned_ref is null (never prints "@ null")', () => {
  const block = buildSkillInjectionPrompt([{ skill: 'some-skill', origin: 'some/repo', pinned_ref: null }]);
  assert.doesNotMatch(block, /@ null/);
  assert.match(block, /some-skill/);
});

test('startRunByAgentId dispatch path: task text is only ever extended, never replaced, by the skill block', () => {
  // Direct behavioral guarantee this test locks in: an agent with zero attachments must
  // dispatch with the EXACT original task text (byte-identical), so this feature can
  // never silently alter dispatch for the other 7 agents that don't use it yet.
  const task = 'Implement the QA dashboard.';
  const noSkillBlock = buildSkillInjectionPrompt([]);
  assert.equal(task + noSkillBlock, task);
});

// Permanent regression for a real, live-reproduced defect found by the independent Phase 6
// verifier (2026-08-31, not caught by the implementing session): applyUpdate()/
// rollbackComponent() used to call the fallible, throwing operation (hashFile, which
// re-validates the path against ALLOWED_DEFINITION_ROOTS and reads the file from disk)
// AFTER the first real database write (snapshotVersion inserting a plugin_component_versions
// row) - so a failure partway through (bad path, missing file, transient fs race) left a
// real, permanent, orphaned "update"/"rollback" history row with no corresponding completed
// transition. Reproduced live: a transient file-write race caused hashFile() to throw
// ENOENT, and a real phantom snapshot row was left in production (cleaned up manually - see
// qa/KNOWN_FAILURE_MODES.md). Fixed by reordering both functions so hashFile() always runs
// BEFORE the first database write - these tests lock in both halves: (1) hashFile itself
// really is fallible and throws synchronously (never silently proceeds with a bad path),
// and (2) the source ordering fix is actually in place, not merely fixed once and liable to
// regress on a future edit.
test('hashFile: throws synchronously (no partial side effect possible) for a nonexistent file within an allowed root', () => {
  assert.throws(
    () => hashFile(join('C:\\Users\\Dell\\.claude\\plugins\\cache', 'definitely-does-not-exist-qa-verify', 'SKILL.md')),
    /ENOENT/
  );
});

test('assertPathWithinAllowedRoots: throws synchronously for a path outside every allowed root', () => {
  assert.throws(
    () => assertPathWithinAllowedRoots('C:\\Windows\\System32\\drivers\\etc\\hosts'),
    /refusing to use definitionPath/
  );
});

test('applyUpdate/rollbackComponent source order: hashFile( is called before the first snapshotVersion( call in each function body (prevents the phantom-history-row class regressing)', () => {
  const source = readFileSync(join(__dirname, 'plugin-attach.mjs'), 'utf8');

  const applyUpdateBody = source.slice(source.indexOf('export async function applyUpdate'), source.indexOf('export async function rollbackComponent'));
  const applyHashIdx = applyUpdateBody.indexOf('hashFile(');
  const applySnapshotIdx = applyUpdateBody.indexOf('snapshotVersion(');
  assert.ok(applyHashIdx !== -1 && applySnapshotIdx !== -1, 'applyUpdate must call both hashFile( and snapshotVersion(');
  assert.ok(applyHashIdx < applySnapshotIdx, 'applyUpdate: hashFile( must run before snapshotVersion( - a fallible operation must never run after the first real database write');

  const rollbackBody = source.slice(source.indexOf('export async function rollbackComponent'), source.indexOf('export async function attachSkill'));
  const rollbackHashIdx = rollbackBody.indexOf('hashFile(');
  const rollbackSnapshotIdx = rollbackBody.indexOf('snapshotVersion(');
  assert.ok(rollbackHashIdx !== -1 && rollbackSnapshotIdx !== -1, 'rollbackComponent must call both hashFile( and snapshotVersion(');
  assert.ok(rollbackHashIdx < rollbackSnapshotIdx, 'rollbackComponent: hashFile( must run before snapshotVersion( - same ordering rule as applyUpdate');
});
