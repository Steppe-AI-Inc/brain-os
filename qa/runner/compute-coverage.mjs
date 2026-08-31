#!/usr/bin/env node
// Recomputes qa/COVERAGE_LEDGER.json from qa/CAPABILITY_INVENTORY.json.
//
// The ledger is NEVER hand-typed. This script exists so release-state claims are a computed
// consequence of the inventory rather than a subjective judgement call - the charter's core
// anti-fabrication mechanism. Run it after any inventory change; the supervisor runs it at
// every campaign checkpoint.
//
// Release-state rule (non-negotiable): if any in-scope capability is still NOT_TESTED,
// E2E VERIFIED is forbidden. BLOCKED items must carry an explicit blocked_reason.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const qaDir = join(here, "..");

const inv = JSON.parse(readFileSync(join(qaDir, "CAPABILITY_INVENTORY.json"), "utf8"));
const caps = inv.capabilities ?? [];

const STATUSES = ["NOT_TESTED", "QUEUED", "RUNNING", "PASS", "FAIL", "BLOCKED", "FLAKY"];

const zero = () => Object.fromEntries(STATUSES.map((s) => [s, 0]));

const totals = zero();
const byDomain = {};
const bySurface = {};
const blocked = [];
const failing = [];
const flaky = [];

for (const c of caps) {
  if (!STATUSES.includes(c.status)) {
    throw new Error(`Unknown status "${c.status}" on ${c.capability_id} — refusing to compute a ledger from an invalid inventory.`);
  }
  totals[c.status]++;

  (byDomain[c.domain] ??= zero())[c.status]++;
  (bySurface[c.surface] ??= zero())[c.status]++;

  if (c.status === "BLOCKED") {
    if (!c.blocked_reason) {
      throw new Error(`${c.capability_id} is BLOCKED with no blocked_reason — the charter forbids silently dropping blocked items.`);
    }
    blocked.push({ capability_id: c.capability_id, domain: c.domain, reason: c.blocked_reason });
  }
  if (c.status === "FAIL") failing.push({ capability_id: c.capability_id, domain: c.domain, bug_id: c.bug_id ?? null });
  if (c.status === "FLAKY") flaky.push({ capability_id: c.capability_id, domain: c.domain, bug_id: c.bug_id ?? null });
}

const required = caps.length;
const executed = totals.PASS + totals.FAIL + totals.FLAKY;

// Deliberately excludes BLOCKED from the numerator: a blocked capability is not evidence of
// working software. Reporting it as covered is exactly the flattering-denominator trick the
// charter forbids.
const coveragePct = required === 0 ? 0 : Number(((executed / required) * 100).toFixed(1));

let releaseState;
if (totals.FAIL > 0) {
  releaseState = "FAILED";
} else if (totals.NOT_TESTED > 0 || totals.QUEUED > 0 || totals.RUNNING > 0 || totals.BLOCKED > 0) {
  releaseState = "PARTIALLY VERIFIED";
} else {
  releaseState = "VERIFIED IN PRODUCTION";
}

const ledger = {
  _doc:
    "COMPUTED, never hand-edited. Regenerate with `node qa/runner/compute-coverage.mjs`. " +
    "Numbers here are a mechanical function of CAPABILITY_INVENTORY.json - that is the whole point: " +
    "it makes 'is the sweep complete?' an arithmetic question rather than an opinion.",
  generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  generator: "qa/runner/compute-coverage.mjs",
  product_commit_under_test: inv.product_commit_under_test ?? null,
  environment: inv.environment ?? null,

  required_capabilities: required,
  executed_capabilities: executed,
  coverage_percentage: coveragePct,
  _coverage_formula:
    "(PASS + FAIL + FLAKY) / required. BLOCKED is EXCLUDED from the numerator - a blocked capability is not evidence of working software.",

  totals,
  by_domain: byDomain,
  by_surface: bySurface,

  blocked_capabilities: blocked,
  failing_capabilities: failing,
  flaky_capabilities: flaky,

  release_state: releaseState,
  _release_state_rule:
    "FAILED if any FAIL. Otherwise PARTIALLY VERIFIED while any NOT_TESTED/QUEUED/RUNNING/BLOCKED remains. " +
    "E2E VERIFIED / VERIFIED IN PRODUCTION is only reachable when every in-scope capability has actually been executed and passed.",

  headline: `Required capabilities: ${required} | PASS: ${totals.PASS} | FAIL: ${totals.FAIL} | FLAKY: ${totals.FLAKY} | BLOCKED: ${totals.BLOCKED} | NOT TESTED: ${totals.NOT_TESTED} -> ${releaseState}`,
};

writeFileSync(join(qaDir, "COVERAGE_LEDGER.json"), JSON.stringify(ledger, null, 2) + "\n");
console.log(ledger.headline);
console.log(`coverage: ${coveragePct}% (${executed}/${required} executed)`);
if (blocked.length) console.log(`blocked: ${blocked.map((b) => b.capability_id).join(", ")}`);
