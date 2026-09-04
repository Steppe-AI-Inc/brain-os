// SCENARIO 0c — prove the FOUNDER-VISIBLE harm of the D134 finding through the real gate,
// not just the predicate: a truthful "Confirmed — …" negative is DISCARDED and replaced.
import { buildGate } from './gate.mjs';
import { loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';
const F = (n) => loadFile(new URL('./index_' + n + '.ts', import.meta.url).pathname.replace(/^\//, ''));
const G = {
  candidate: buildGate(loadFile(fileURLToPath(INDEX_PATH))),
  fbafded: buildGate(F('fbafded')),
  '9535f0b': buildGate(F('9535f0b')),
};

const cases = [
  'Confirmed — I checked, nothing was archived.',
  'Confirmed — ACME exists, but it was not archived.',
  'Confirmed — the report ran, and no task was completed.',
  'Confirmed — nothing was archived.',
  'ACME was not archived.',
];

// TURN A — an ordinary structured read-only turn: the model emits one STATE claim (so
// rawClaims !== null, which is what the prompt asks it to do) and answers truthfully.
console.log('=== TURN A: read-only turn WITH a claims array (structuredProseDrift path) ===');
for (const c of cases) {
  console.log('\nINPUT   : ' + c);
  for (const [rev, g] of Object.entries(G)) {
    const r = g({
      summary: c, command: 'did you archive ACME?', grounded: true,
      claims: [{ type: 'state', resourceType: 'company', resourceId: '11111111-1111-1111-1111-111111111111', predicate: 'status', expectedValue: 'active' }],
    });
    console.log('  ' + rev.padEnd(10) + (r.corrected ? 'CORRECTED ' : 'kept      ') + JSON.stringify(r.summary).slice(0, 150));
  }
}

// TURN B — ungrounded, no claims at all: the legacyProseFallback path.
console.log('\n=== TURN B: ungrounded, no claims (legacyProseFallback path) ===');
for (const c of cases) {
  console.log('\nINPUT   : ' + c);
  for (const [rev, g] of Object.entries(G)) {
    const r = g({ summary: c, command: 'did you archive ACME?' });
    console.log('  ' + rev.padEnd(10) + (r.corrected ? 'CORRECTED ' : 'kept      ') + JSON.stringify(r.summary).slice(0, 150));
  }
}
