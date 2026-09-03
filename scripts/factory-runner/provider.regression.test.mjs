// Permanent regression test for the real, disclosed defect fixed in commit 47cd870
// ("Fix real dispatch-tooling bug: startRun() ANSI-parsing failure on providerRunId"),
// found live during Phase 8 repeatability dispatch under Work Order
// 3b28e447-4a9c-4f79-9419-80638a39e457.
//
// Root cause: the `claude` CLI wraps the backgrounded session's hex id in ANSI color
// codes (observed live: "backgrounded · \x1b[36m4bf0806d\x1b[39m"). startRun()'s regex
// was matched against raw, un-stripped stdout/stderr and could not see past the escape
// codes, even though getLogs()/getArtifacts() already stripped ANSI before matching.
// Real consequence: the underlying `claude --bg` dispatch genuinely succeeded (and later
// produced real commit aae7dad), but startRun() threw before the provider_run_id could be
// captured, so no agent_runs row was ever recorded for that run.
//
// The fix commit itself shipped no committed automated test (only inline comments
// claiming "regression-verified against the exact failing byte sequence observed live") -
// a real gap under CLAUDE.md §12 ("write an automated regression test first/alongside the
// fix"). This file is that missing regression test, added by independent verification of
// Work Order 3b28e447-4a9c-4f79-9419-80638a39e457. It requires no `claude` CLI, no network,
// no database - pure, fast, deterministic unit coverage of parseProviderRunId().
//
// Run with: node --test scripts/factory-runner/provider.regression.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProviderRunId, classifyProviderOutput, PROVIDER_CAPACITY_BLOCKED } from './provider.mjs';

test('parseProviderRunId: parses the exact live-observed ANSI-wrapped byte sequence', () => {
  // Exact bytes observed live 2026-08-29 during the Phase 8 dispatch that produced
  // commit aae7dad, before this fix existed: "backgrounded · <ANSI cyan>4bf0806d<ANSI reset>"
  const raw = 'backgrounded · \x1b[36m4bf0806d\x1b[39m';
  assert.equal(parseProviderRunId(raw), '4bf0806d');
});

test('parseProviderRunId: reproduces the pre-fix failure mode if ANSI stripping regresses', () => {
  // This asserts what the OLD, buggy regex (matched against raw output with no ANSI
  // stripping) actually did: fail to match. If a future refactor accidentally removes the
  // stripAnsi() call inside parseProviderRunId, this exact input must still parse
  // correctly - the companion test above already covers that. This test independently
  // documents *why*: matching the bare pre-fix regex against unstripped output finds
  // nothing, proving the ANSI codes are what broke it, not the base pattern.
  const raw = 'backgrounded · \x1b[36m4bf0806d\x1b[39m';
  const preFixRegex = /backgrounded\s*(?:·|\|)\s*([0-9a-f]{6,})/i;
  assert.equal(preFixRegex.test(raw), false, 'expected the bare pre-fix regex to fail against raw ANSI-wrapped output');
});

test('parseProviderRunId: parses plain output with no ANSI codes (no regression on the common case)', () => {
  const raw = 'backgrounded · abcdef12';
  assert.equal(parseProviderRunId(raw), 'abcdef12');
});

test('parseProviderRunId: parses the pipe-delimited alternate separator form', () => {
  const raw = 'backgrounded | \x1b[36mdeadbeef\x1b[39m';
  assert.equal(parseProviderRunId(raw), 'deadbeef');
});

test('parseProviderRunId: throws with the raw output included when nothing matches', () => {
  const raw = 'some unrelated CLI output with no session id at all';
  assert.throws(
    () => parseProviderRunId(raw),
    (err) => {
      assert.match(err.message, /could not parse a provider_run_id/);
      assert.match(err.message, /some unrelated CLI output/);
      return true;
    }
  );
});

test('parseProviderRunId: strips cursor-control and clear-line ANSI sequences too, not just color codes', () => {
  // stripAnsi() also strips \x1b[<n><letter> cursor codes and bare "[K"/"[2J[H" clear
  // sequences seen in real `claude` terminal output - confirm those don't interfere either.
  const raw = 'backgrounded · \x1b[2K\x1b[1Gaa11bb22[K';
  assert.equal(parseProviderRunId(raw), 'aa11bb22');
});

// ============================================================================
// PROVIDER_CAPACITY_BLOCKED (2026-09-02 incident). An independent-verifier dispatch
// exited code 0 while its ONLY output was the provider's session-limit message —
// nothing ran, but a naive "exit 0 = success" reading would have certified it. The
// founder's standing rule from that incident, pinned here as a permanent regression:
// exit code 0 + provider error text is NOT a successful Agent Run.
// ============================================================================

test('classifyProviderOutput: the EXACT live 2026-09-02 shape classifies PROVIDER_CAPACITY_BLOCKED', () => {
  const raw = "You've hit your session limit · resets 1am (Asia/Ulaanbaatar)";
  const result = classifyProviderOutput(raw);
  assert.ok(result, 'the exact observed live output must classify, not pass silently');
  assert.equal(result.classification, PROVIDER_CAPACITY_BLOCKED);
  assert.match(result.matched, /hit your session limit/i);
});

test('classifyProviderOutput: ANSI-wrapped and usage-limit variants classify too', () => {
  assert.ok(classifyProviderOutput("\x1b[33mYou've hit your usage limit\x1b[39m"));
  assert.ok(classifyProviderOutput('Usage limit reached for this billing period'));
  assert.ok(classifyProviderOutput('Your credit balance is too low to run this request'));
});

test('classifyProviderOutput: ordinary successful dispatch output does NOT classify', () => {
  assert.equal(classifyProviderOutput('backgrounded · abcdef12'), null);
  assert.equal(classifyProviderOutput(''), null);
  assert.equal(classifyProviderOutput(null), null);
});

test('classifyProviderOutput: an agent DISCUSSING limits in prose is not a provider refusal', () => {
  // Guard against over-matching: analysis text about rate limits in general must not
  // reclassify a healthy run. The patterns are first-person provider sentences.
  assert.equal(classifyProviderOutput('The API applies a rate limit of 50 rpm; we should batch requests.'), null);
  assert.equal(classifyProviderOutput('Consider what happens when a user hits their own app quota someday.'), null);
});

test('startRun contract: capacity output raises a TYPED error, never a generic parse failure', () => {
  // startRun itself spawns a process, so the contract is asserted at the classifier
  // boundary it delegates to: capacity output classifies BEFORE parseProviderRunId
  // would throw its generic error — the caller sees .classification and can mark the
  // run blocked/retryable instead of failed-unknown. (The wiring in startRun is three
  // lines above the parse call; this test pins the classifier the wiring depends on.)
  const capacityOutput = "You've hit your session limit · resets 1am (Asia/Ulaanbaatar)";
  assert.ok(classifyProviderOutput(capacityOutput));
  assert.throws(() => parseProviderRunId(capacityOutput)); // and the old path alone would have been generic
});
