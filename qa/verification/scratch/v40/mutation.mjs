// VERIFIER #40 mutation proof. Each shipped guard is reverted INDIVIDUALLY and the whole
// corpus re-measured. A guard that changes NOTHING when reverted is dead weight under the
// campaign's only-load-bearing-code rule.
import { buildCandidateGate, buildV92Gate, v92Path } from './v40_belt.mjs';
import { buildCorpus } from './corpus.mjs';

const base = buildCandidateGate();
const v92 = buildV92Gate(v92Path());
const rows = buildCorpus();

const baseVerdicts = rows.map((r) => base.readsAsCompletion(r.text));

// ---- mutations -----------------------------------------------------------------
function killFlag(name) {
  return (src) => {
    // whole-line replacement: several of these declarations contain `;` inside a for-head
    const lines = src.split('\n');
    let hit = -1;
    for (let i = 0; i < lines.length; i++) if (new RegExp('^\\s*const ' + name + ' =').test(lines[i])) { hit = i; break; }
    if (hit < 0) throw new Error('flag not found: ' + name);
    if (!/;\s*$/.test(lines[hit])) throw new Error('flag decl not single-line: ' + name);
    lines[hit] = '            const ' + name + ' = false;';
    return lines.join('\n');
  };
}

// remove a `.replace(` call whose argument text starts with `startsWith`, by scanning
// balanced parens from that `.replace(`.
function killReplace(marker, label) {
  return (src) => {
    const idx = src.indexOf(marker);
    if (idx < 0) throw new Error('replace-call not found: ' + label);
    // walk back to the '.replace(' that owns it
    const callStart = src.lastIndexOf('.replace(', idx);
    if (callStart < 0) throw new Error('no .replace( before ' + label);
    let i = callStart + '.replace('.length - 1; // at '('
    let depth = 0; let mode = 0; let prev = '';
    for (; i < src.length; i++) {
      const c = src[i];
      if (mode === 0) {
        if (c === '"' || c === "'" || c === '`') { mode = 1; prev = c; continue; }
        if (c === '/' && '=(,:[!&|?{};+*%~^<>'.includes(prev)) {
          // regex literal
          let j = i + 1; let inClass = false;
          while (j < src.length) {
            if (src[j] === '\\') { j += 2; continue; }
            if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false;
            else if (src[j] === '/' && !inClass) break;
            j++;
          }
          j++;
          while (j < src.length && /[gimsuyvd]/.test(src[j])) j++;
          i = j - 1; prev = '/'; continue;
        }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) { return src.slice(0, callStart) + src.slice(i + 1); } }
        if (!/\s/.test(c)) prev = c;
      } else {
        if (c === '\\') { i++; continue; }
        if (c === prev) { mode = 0; prev = c; }
      }
    }
    throw new Error('unbalanced .replace for ' + label);
  };
}

const MUTATIONS = [
  ['FIX-1  nameInternal (name-safe negator scan)', killFlag('nameInternal')],
  ['FIX-1b objectName', killFlag('objectName')],
  ['FIX-2  titleHead (Pending/Awaiting title)', killFlag('titleHead')],
  ['FIX-3  ppInternal (prepositional-phrase negator)', killFlag('ppInternal')],
  ['       relInternal', killFlag('relInternal')],
  ['       newSubject', killFlag('newSubject')],
  ['       quotedHead', killFlag('quotedHead')],
  ['       adjective (pending/awaiting after determiner)', killFlag('adjective')],
  ['       fewQuant', killFlag('fewQuant')],
  ['       detName', killFlag('detName')],
  ['FIX-4a reassurance idiom strip (dash form)', killReplace('no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*[—–-]', 'idiom-dash')],
  ['FIX-4b reassurance idiom strip (bare form)', killReplace("no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)", 'idiom-bare')],
  ['FIX-5  R-AUXGAP whole-summary aux-gap collapse', killReplace('couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don', 'r-auxgap')],
  ['       none/nobody appositive re-join', killReplace('[Nn]one|[Nn]obody|[Nn]o one', 'none-appositive')],
  ['       comma appositive pre-pass', killReplace('(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)[^,.\\x3b:!?()]){1,40}?', 'comma-appositive')],
  ['       modal hedge span blanking', killReplace('may|might|could|can|would|should)\\s+(?:(?:not|never|also|already', 'modal-blank')],
];

let dead = 0;
for (const [label, mut] of MUTATIONS) {
  let gate;
  try { gate = buildCandidateGate(undefined, mut); } catch (e) { console.log(label.padEnd(52) + ' BUILD ERROR: ' + e.message); continue; }
  const changed = [];
  rows.forEach((r, i) => {
    const now = gate.readsAsCompletion(r.text);
    if (now !== baseVerdicts[i]) changed.push({ r, from: baseVerdicts[i], to: now });
  });
  const fabReopened = changed.filter((c) => c.r.label === 'fabrication' && c.from === true && c.to === false);
  const truthDestroyed = changed.filter((c) => c.r.label === 'truth' && c.from === false && c.to === true);
  const other = changed.length - fabReopened.length - truthDestroyed.length;
  if (changed.length === 0) dead++;
  console.log(label.padEnd(52) + ' delta=' + String(changed.length).padStart(4)
    + '  fabrications re-opened=' + String(fabReopened.length).padStart(3)
    + '  truths destroyed=' + String(truthDestroyed.length).padStart(3)
    + '  other=' + other
    + (changed.length === 0 ? '   <<< NO-OP ON THIS CORPUS' : ''));
  for (const c of changed.slice(0, 4)) console.log('        e.g. [' + c.r.label + '] ' + JSON.stringify(c.r.text) + '  ' + c.from + '->' + c.to);
}
console.log('\nmutations with zero effect on this corpus: ' + dead + ' / ' + MUTATIONS.length);
