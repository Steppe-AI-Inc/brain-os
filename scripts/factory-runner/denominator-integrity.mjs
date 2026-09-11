#!/usr/bin/env node
// A CANDIDATE MAY NOT LOOK BETTER BECAUSE ITS OWN FAILURES MADE ROWS INELIGIBLE.
//
// THE DEFECT, confirmed independently by verifier #88. A paired corpus measures GAIN rows only where their
// CONTROL row holds — the control is what proves a gain row is about the thing being tested rather than
// about the sentence. Sound, until the candidate starts failing controls: those rows then drop out of the
// denominator, and the score improves because the candidate got WORSE.
//
// It happened here. A comparison table's denominator moved 3 549 -> 3 469 between candidates. I noticed the
// drift and attributed it to corpus generation. #88 found the real cause: 80 rows became ineligible because
// THE CANDIDATE NOW GETS THEIR CONTROL SENTENCES WRONG. A regression was hiding inside an improvement.
//
// THE INVARIANT: a dropped control row is a DEFECT REPORT, never a smaller denominator. Four counts must be
// stated explicitly, and they must reconcile:
//
//     EXPECTED_ROW_COUNT  what the generator produced
//     CONTROL_ROW_COUNT   how many of those are controls
//     TEST_ROW_COUNT      how many are the rows under test
//     DROPPED_ROW_COUNT   how many were excluded, and WHY
//
// A measurement that cannot say all four is not comparable to any other measurement.
const NL = String.fromCharCode(10);

export class DenominatorViolation extends Error {}

/**
 * Check one measurement's denominator integrity.
 *
 * `controlsFailed` is the count of CONTROL rows the candidate got wrong. Any value above zero is a defect:
 * the controls are the premise of every gain row, so a failing control invalidates the rows that depend on
 * it rather than merely removing them.
 */
export function checkDenominator({
  label = 'measurement',
  expectedRowCount, controlRowCount, testRowCount, droppedRowCount = 0,
  controlsFailed = 0, baselineRowCount = null, claimedImprovement = null,
} = {}) {
  const findings = [];
  const need = { expectedRowCount, controlRowCount, testRowCount };
  for (const [k, v] of Object.entries(need)) {
    if (!Number.isFinite(v)) {
      findings.push('MISSING COUNT: ' + k + ' is not a number. A measurement that cannot state all four'
        + ' counts is not comparable to any other measurement.');
    }
  }
  if (findings.length) return { ok: false, findings };

  // The counts must reconcile, or one of them is a guess.
  if (controlRowCount + testRowCount + droppedRowCount !== expectedRowCount) {
    findings.push('COUNTS DO NOT RECONCILE: control ' + controlRowCount + ' + test ' + testRowCount
      + ' + dropped ' + droppedRowCount + ' != expected ' + expectedRowCount
      + '. Rows went somewhere nobody recorded.');
  }

  // THE CENTRAL RULE.
  if (controlsFailed > 0) {
    findings.push('CONTROL ROWS FAILED (' + controlsFailed + '): this is a DEFECT, not a smaller'
      + ' denominator. A control is the premise of every gain row that depends on it, so a failing control'
      + ' invalidates those rows rather than excluding them — and excluding them makes the candidate look'
      + ' better for getting worse.');
  }

  // A shrinking denominator against a baseline is the observable symptom, and it is never benign.
  if (Number.isFinite(baselineRowCount) && expectedRowCount < baselineRowCount) {
    findings.push('DENOMINATOR SHRANK: ' + baselineRowCount + ' -> ' + expectedRowCount
      + '. Counts across different denominators are not comparable, and an improvement claimed across one'
      + ' is not an improvement. State why the corpus changed, or re-run both candidates against the same'
      + ' frozen corpus.');
  }

  if (claimedImprovement && (controlsFailed > 0
    || (Number.isFinite(baselineRowCount) && expectedRowCount < baselineRowCount))) {
    findings.push('IMPROVEMENT CLAIMED ON AN INELIGIBLE DENOMINATOR: ' + JSON.stringify(claimedImprovement)
      + '. Withdraw the claim or re-measure on a frozen corpus.');
  }

  return { ok: findings.length === 0, findings, label };
}

/** Print a report and exit non-zero on violation. Used by suites that own a generated corpus. */
export function requireDenominator(opts) {
  const r = checkDenominator(opts);
  if (r.ok) {
    console.log('OK   [DENOMINATOR] ' + (r.label || 'measurement') + ': ' + opts.expectedRowCount
      + ' rows (' + opts.controlRowCount + ' control, ' + opts.testRowCount + ' test, '
      + (opts.droppedRowCount || 0) + ' dropped), 0 control failures');
    return r;
  }
  console.log('FAIL [DENOMINATOR] ' + (r.label || 'measurement'));
  for (const f of r.findings) console.log('       ' + f);
  throw new DenominatorViolation(r.findings.join(NL));
}
