// Evidence records for Factory V1 acceptance.
//
// A FAIL is a RESULT, not a harness error. Every check records what it OBSERVED; the node:test
// assertion is only "a verdict was observed and recorded". A thrown harness error is different:
// it becomes NO_VERDICT and fails the test, because a harness that cannot observe has a defect
// that must be visible.
//
// Secret hygiene: every stdout/stderr excerpt is scrubbed through the pinned qa/lib/
// secret_evidence.mjs classifier before it is stored (KNOWN_FAILURE_MODES #63).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pinnedPath } from './provenance.mjs';

export const VERDICTS = Object.freeze(['PASS', 'FAIL', 'ABSENT', 'PARTIAL', 'NO_VERDICT']);
export const METHODS = Object.freeze(['PGLITE_EXEC', 'PGLITE_SUITE_RERUN', 'SOURCE_GREP', 'PURE_FN', 'NODE_TEST_RERUN', 'REAL_PG_EXEC', 'REAL_PG_RACE', 'MACHINE_PROBE', 'SHELL_REVIEW']);
export const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

let classifySecret = null;
async function loadScrubber() {
  if (classifySecret) return classifySecret;
  try {
    const mod = await import(pathToFileURL(pinnedPath('p1', 'qa/lib/secret_evidence.mjs')).href);
    classifySecret = mod.classifySecret;
  } catch { classifySecret = () => ({ state: 'ABSENT' }); }
  return classifySecret;
}

/** Replace any line whose value the pinned classifier calls PRESENT/VALIDATED_LIVE. Never stores a value. */
export async function scrub(text) {
  const cls = await loadScrubber();
  return String(text ?? '').split(/\r?\n/).map((line) => {
    let st = 'ABSENT';
    try { st = (cls(line) || {}).state || 'ABSENT'; } catch { st = 'ABSENT'; }
    return st === 'PRESENT' || st === 'VALIDATED_LIVE' ? '[SCRUBBED: ' + st + ' secret-shaped line removed]' : line;
  }).join('\n');
}

export function suiteRecorder(suite) {
  const records = [];
  const harnessErrors = [];
  return {
    suite,
    records,
    harnessErrors,
    /**
     * Run one check. `fn` returns { verdict, evidence, ...fields }. Any throw -> NO_VERDICT +
     * harness_error (a harness defect, surfaced by the test).
     */
    async check(id, spec, fn) {
      const base = { id, suite, observed_at: nowIso(), ...spec };
      let rec;
      try {
        const out = await fn();
        rec = { ...base, ...out };
        if (!VERDICTS.includes(rec.verdict)) throw new Error('check ' + id + ' produced unknown verdict ' + rec.verdict);
        if (rec.evidence === undefined) throw new Error('check ' + id + ' produced no evidence');
      } catch (e) {
        rec = { ...base, verdict: 'NO_VERDICT', no_verdict_reason: 'HARNESS_ERROR', harness_error: String(e && e.stack || e).slice(0, 1500), evidence: null };
        harnessErrors.push({ id, error: String(e && e.message || e) });
      }
      if (rec.evidence && typeof rec.evidence === 'object') {
        for (const k of ['stdout_excerpt', 'stderr_excerpt']) if (typeof rec.evidence[k] === 'string') rec.evidence[k] = await scrub(rec.evidence[k]);
      }
      records.push(rec);
      console.log((rec.verdict + ' ').padEnd(11) + id.padEnd(9) + (rec.claim || '').slice(0, 110) + (rec.verdict === 'NO_VERDICT' && rec.harness_error ? '  !! ' + rec.harness_error.split('\n')[0] : ''));
      return rec;
    },
    write() {
      mkdirSync(RESULTS_DIR, { recursive: true });
      const path = join(RESULTS_DIR, suite + '.checks.json');
      const totals = {};
      for (const v of VERDICTS) totals[v] = records.filter((r) => r.verdict === v).length;
      writeFileSync(path, JSON.stringify({ suite, generated_at: nowIso(), totals, harness_errors: harnessErrors, checks: records }, null, 2) + '\n');
      return path;
    },
  };
}

export function readSuiteResults(suite) {
  const p = join(RESULTS_DIR, suite + '.checks.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

/** Parse `node --test --test-reporter=tap` output into per-test results. */
export function parseTap(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*(not ok|ok)\s+(\d+)\s+-\s+(.*)$/);
    if (m) out.push({ ok: m[1] === 'ok', n: Number(m[2]), name: m[3].replace(/\s+#.*$/, '').trim(), skipped: /# SKIP/i.test(line) });
  }
  return out;
}
