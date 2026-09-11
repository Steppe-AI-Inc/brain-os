#!/usr/bin/env node
// QA_DENOMINATOR_CANNOT_SHRINK_SILENTLY — the permanent regression for #88's measurement defect.
//
// THE REAL EVENT this encodes, so the rows are not abstract. A comparison table's denominator moved
// 3 549 -> 3 469 between two candidates. I saw the drift and attributed it to corpus generation. Verifier
// #88 found the cause: 80 rows became INELIGIBLE because the new candidate gets their CONTROL sentences
// wrong. The table therefore showed an improvement that was partly a regression hiding inside a shrinking
// denominator — and every row of it was individually honest.
//
// Each row below FAILS on a fixture exhibiting the defect, because a rule with no failing fixture is a
// slogan.
import { checkDenominator, requireDenominator, DenominatorViolation }
  from '../../scripts/factory-runner/denominator-integrity.mjs';

const NL = String.fromCharCode(10);
let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); }
  else { failures.push(name); console.log('FAIL ' + name + (detail ? NL + '       ' + detail : '')); }
};

// ── The healthy case must pass, or the rule is just a rejecter ──────────────────────────────────────
{
  const r = checkDenominator({
    label: 'healthy', expectedRowCount: 300, controlRowCount: 100, testRowCount: 200,
    droppedRowCount: 0, controlsFailed: 0, baselineRowCount: 300,
  });
  check('D0 a measurement that states all four counts, reconciles, and has no control failures PASSES',
    r.ok === true, JSON.stringify(r.findings));
}

// ── THE CENTRAL RULE: a failing control is a defect, never a smaller denominator ────────────────────
{
  const r = checkDenominator({
    label: 'the #88 shape', expectedRowCount: 3469, controlRowCount: 1000, testRowCount: 2469,
    droppedRowCount: 0, controlsFailed: 80, baselineRowCount: 3549,
    claimedImprovement: '465 leaks, down from 1620',
  });
  check('D1 CONTROL ROWS THAT FAIL are reported as a DEFECT, not excluded from the denominator',
    r.ok === false && r.findings.some((f) => /CONTROL ROWS FAILED \(80\)/.test(f)),
    JSON.stringify(r.findings));
  check('D2 a SHRINKING denominator is named, because counts across different denominators are not'
    + ' comparable',
    r.findings.some((f) => /DENOMINATOR SHRANK: 3549 -> 3469/.test(f)), JSON.stringify(r.findings));
  check('D3 an IMPROVEMENT claimed on an ineligible denominator is rejected by name',
    r.findings.some((f) => /IMPROVEMENT CLAIMED ON AN INELIGIBLE DENOMINATOR/.test(f)),
    JSON.stringify(r.findings));
}

// ── The four counts must be STATED, and must reconcile ─────────────────────────────────────────────
{
  const missing = checkDenominator({ label: 'no counts', expectedRowCount: 100 });
  check('D4 a measurement that cannot state all four counts is not comparable and is rejected',
    missing.ok === false && missing.findings.some((f) => /MISSING COUNT/.test(f)),
    JSON.stringify(missing.findings));

  const wrong = checkDenominator({
    label: 'unreconciled', expectedRowCount: 300, controlRowCount: 100, testRowCount: 150,
    droppedRowCount: 0, controlsFailed: 0,
  });
  check('D5 counts that do not RECONCILE are rejected — rows went somewhere nobody recorded',
    wrong.ok === false && wrong.findings.some((f) => /COUNTS DO NOT RECONCILE/.test(f)),
    JSON.stringify(wrong.findings));
}

// ── A drop that is NOT caused by control failure is allowed, but must be stated ────────────────────
{
  const r = checkDenominator({
    label: 'declared drop', expectedRowCount: 300, controlRowCount: 100, testRowCount: 180,
    droppedRowCount: 20, controlsFailed: 0, baselineRowCount: 300,
  });
  check('D6 rows dropped for a DECLARED reason, with the counts reconciling, are not a violation',
    r.ok === true, JSON.stringify(r.findings)
    + ' — the rule is about SILENT shrinkage, not about ever excluding a row');
}

// ── The enforcing wrapper must actually throw, or suites will quietly ignore it ────────────────────
{
  let threw = false;
  try {
    requireDenominator({
      label: 'enforced', expectedRowCount: 100, controlRowCount: 50, testRowCount: 50,
      droppedRowCount: 0, controlsFailed: 3,
    });
  } catch (e) { threw = e instanceof DenominatorViolation; }
  check('D7 requireDenominator THROWS on a violation, so a suite cannot record the number and carry on',
    threw, 'a check whose result can be ignored is a comment');
}

console.log('');
console.log('denominator_cannot_shrink_silently: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('');
console.log('A candidate may not look better because its own failures made rows ineligible. #88 found this');
console.log('in a real table: 80 rows left a denominator because the candidate got their CONTROLS wrong.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
