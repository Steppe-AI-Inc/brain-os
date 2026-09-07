// VERIFIER #51 — broader witnesses for the idiom-strip (both replaces) and R-AUXGAP mutants that stayed no-op.
import { buildGate } from '../../lib/belt_extract.mjs';
import { CAND_PATH } from './harness.mjs';
const NM = ['Erdenet Copper Works', 'No Limits Inc'];
const once = (t, from, to, n) => { const k = t.split(from).length - 1; if (k !== 1) throw new Error(n + ' applies ' + k + ' times'); return t.split(from).join(to); };
const base = buildGate(CAND_PATH, (c) => c, NM);
const f4a = buildGate(CAND_PATH, (c) => once(c, "(?:\\s+at all)?\\s*[—–-]\\s*)+/i, '')", "(?:\\s+at all)?\\s*[—–-]\\s*)+/i, '$&')", 'F4a'), NM);
const f4b = buildGate(CAND_PATH, (c) => once(c, "(i0, o0, t0) => (LEGACY_PAST_COMPLETION.test(t0.slice(o0 + i0.length)) ? '' : i0)", "(i0, o0, t0) => i0", 'F4b'), NM);
const f5 = buildGate(CAND_PATH, (c) => once(c, "', 'gi'), '$1 ')", "', 'gi'), '$&')", 'F5'), NM);
const W4 = ['No problem — Erdenet Copper Works was archived.', 'No worries — archived Erdenet Copper Works.', 'Sure thing — Erdenet Copper Works archived successfully.', 'Not to worry — I archived Erdenet Copper Works.', 'No problem the task was deleted.', 'No worries the company was archived.', 'No problem at all — No Limits Inc was archived.', 'Of course — done, Erdenet Copper Works was archived.', 'No issues — renamed: Erdenet Copper Works -> Erdenet Copper', 'No problem — the company was archived.', 'No worries — it was archived.'];
const W5 = ['No Limits Inc was, as requested, archived.', 'No Limits Inc has been, per your note, archived.', 'Erdenet Copper Works was, with no objections, archived.', 'The task was, as no one objected, deleted.', 'No Limits Inc was — as requested — archived.', 'Nothing Bundt Cakes was, as you asked, archived.'];
const show = (name, g, W) => { const fl = W.filter((s) => base.readsAsCompletion(s) !== g.readsAsCompletion(s)); console.log(name.padEnd(16) + (fl.length ? 'LOAD-BEARING' : 'NO-OP') + '  base=' + W.map((s) => +base.readsAsCompletion(s)).join('') + ' mut=' + W.map((s) => +g.readsAsCompletion(s)).join('') + '  flipped: ' + fl.map((s) => JSON.stringify(s)).join(' ')); };
show('F4a strip(dash)', f4a, W4); show('F4b strip(det)', f4b, W4); show('F5 rAuxGap', f5, W5);
