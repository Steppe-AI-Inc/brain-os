// Round 3: keep v92's declared identifiers (v46 C1a), give the historical verifier suites the
// request-side globals, and supersede their pendingAction-term pins (founder ruling 2026-09-07).
import { readFileSync, writeFileSync } from 'node:fs';
function rw(p, fn) {
  const raw = readFileSync(p, 'utf8'); const nl = raw.includes('\r\n') ? '\r\n' : '\n'; const s = raw.replace(/\r\n/g, '\n');
  const out = fn(s); if (out === s) throw new Error('no change: ' + p); writeFileSync(p, out.replace(/\n/g, nl)); console.log('ok', p);
}
function must(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(label + ': found ' + n); return s.replace(a, () => b); }

// index.ts: requestedArchiveIds / requestedRestoreIds stay declared (v92 identifier parity, v46 C1a).
rw('supabase/functions/sem-ai-command/index.ts', (s) => {
  s = must(s, `        const archiveCompanyIds = await resolveCompanyLifecycleTargets('archive', result.archiveCompanyIds, result.archiveCompanyNames,`,
    `        const requestedArchiveIds = Array.isArray(result.archiveCompanyIds) ? result.archiveCompanyIds as unknown[] : [];
        const requestedRestoreIds = Array.isArray(result.restoreCompanyIds) ? result.restoreCompanyIds as unknown[] : [];
        const archiveCompanyIds = await resolveCompanyLifecycleTargets('archive', requestedArchiveIds, result.archiveCompanyNames,`, 'archive');
  s = must(s, `        const restoreCompanyIds = await resolveCompanyLifecycleTargets('restore', result.restoreCompanyIds, result.restoreCompanyNames,`,
    `        const restoreCompanyIds = await resolveCompanyLifecycleTargets('restore', requestedRestoreIds, result.restoreCompanyNames,`, 'restore');
  return s;
});

const GLOBALS = `// P1 (2026-09-07, governance/OPERATING_TRUTH_MODEL.md §3): the consumer windows read request-side
// names. This suite's rows are mutation-intent turns; the belt is measured behind that intent.
globalThis.command = 'archive ACME Holdings'; globalThis.factLines = []; globalThis.lifecycleReports = [];
globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-harness' };
globalThis.requestedIntent = { verb: 'archive', field: null }; globalThis.executedVerifiedCount = 0;
`;
const NOTE = "founder ruling 2026-09-07: a pendingAction never exempts a claim; the belt consumers gate on REQUEST intent (see architecture_final_claim_contract.mjs)";
const SUP = {
  49: ['V49-C3'],
  50: ['V50-C4', 'V50-C5', 'V50-C11', 'V50-D1'],
  51: ['V51-C3', 'V51-C4', 'V51-C5'],
  52: ['V52-C0'],
  53: [],
};
for (const v of [49, 50, 51, 52, 53]) {
  rw(`qa/verification/proposed/v${v}_regression_additions.mjs`, (s) => {
    // globals after the last top-level import line
    const lines = s.split('\n'); let last = -1;
    for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
    if (last < 0) throw new Error('no imports in v' + v);
    lines.splice(last + 1, 0, GLOBALS);
    s = lines.join('\n');
    const set = `const SUPERSEDED_BY_FOUNDER = new Set(${JSON.stringify(SUP[v])});\nconst SUPERSEDED_NOTE = ${JSON.stringify(NOTE)};\n`;
    if (v === 49 || v === 50) {
      s = must(s, 'function check(kind, id, desc, fn) {', set + "function check(kind, id, desc, fn) {\n  if (SUPERSEDED_BY_FOUNDER.has(id)) { console.log('SKIP  [SUPERSEDED] ' + id + ' — ' + SUPERSEDED_NOTE); return; }", 'check v' + v);
    } else if (v === 51 || v === 52) {
      s = must(s, 'const check = (kind, id, desc, fn) => {', set + "const check = (kind, id, desc, fn) => {\n  if (SUPERSEDED_BY_FOUNDER.has(id)) { console.log('SKIP  [SUPERSEDED] ' + id + ' — ' + SUPERSEDED_NOTE); return; }", 'check v' + v);
    }
    return s;
  });
}
