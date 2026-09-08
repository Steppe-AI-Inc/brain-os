// SCENARIO 3 — INDEPENDENT MUTATION TEST (my own harness, not v15..v18's). Each mutant
// reverts one specific decision this candidate claims to have made. A mutant is KILLED only
// if some committed suite reports a failure IN ITS OUTPUT TEXT (or exits nonzero for a real
// assertion). A SURVIVING mutant means the committed battery does not observe that decision.
// Behavioural divergence is measured too, so a survivor is never dismissed as "no-op".
import { withMutant, runBattery, assertPristine } from './mutate.mjs';
import { loadBelt, loadMatcher, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';

const P = () => loadFile(fileURLToPath(INDEX_PATH));
const opt = (id, label, entityType, actionType) => ({ id, label, entityType, actionType });
const TWO = [opt('a', 'Acme', 'company', 'archive'), opt('b', 'Beta Corp', 'company', 'archive')];

// probes: [name, fn(src) -> printable value]
const probes = [
  ['belt:"Closed Loop Systems was not archived."', (s) => loadBelt(s).readsAsCompletion('Closed Loop Systems was not archived.')],
  ['belt:"The archived list was not updated."', (s) => loadBelt(s).readsAsCompletion('The archived list was not updated.')],
  ['belt:"ACME is archived but was not deleted."', (s) => loadBelt(s).readsAsCompletion('ACME is archived but was not deleted.')],
  ['belt:"ACME was archived and no errors occurred."', (s) => loadBelt(s).readsAsCompletion('ACME was archived and no errors occurred.')],
  ['belt:"No company named Salt and Pepper Co was archived."', (s) => loadBelt(s).readsAsCompletion('No company named Salt and Pepper Co was archived.')],
  ['belt:"Nothing failed: ACME was archived."', (s) => loadBelt(s).readsAsCompletion('Nothing failed: ACME was archived.')],
  ['belt:"ACME was archived without incident."', (s) => loadBelt(s).readsAsCompletion('ACME was archived without incident.')],
  ['belt:"No company called Without Borders Ltd was archived."', (s) => loadBelt(s).readsAsCompletion('No company called Without Borders Ltd was archived.')],
  ['match:"option 2"', (s) => { const r = loadMatcher(s).matchDisambiguationOption('option 2', TWO); return r && r.id; }],
  ['match:"option 9"', (s) => { const r = loadMatcher(s).matchDisambiguationOption('option 9', TWO); return r && r.id; }],
  ['match:"2"', (s) => { const r = loadMatcher(s).matchDisambiguationOption('2', TWO); return r && r.id; }],
  ['match:proto actionType', (s) => { try { const r = loadMatcher(s).matchDisambiguationOption('acme', [opt('a', 'Acme', 'company', 'constructor')]); return r && r.id; } catch (e) { return 'THREW ' + e.constructor.name; } }],
  ['match:proto entityType', (s) => { try { const r = loadMatcher(s).matchDisambiguationOption('acme', [opt('a', 'Acme', 'constructor', 'archive')]); return r && r.id; } catch (e) { return 'THREW ' + e.constructor.name; } }],
  ['resolve(constructor,archive)', (s) => { try { return String(loadMatcher(s).resolveClarificationField('constructor', 'archive')); } catch (e) { return 'THREW'; } }],
  ['resolve(company,constructor)', (s) => { try { return String(loadMatcher(s).resolveClarificationField('company', 'constructor')); } catch (e) { return 'THREW'; } }],
];

const MUTANTS = [
  ['M1 invert the participle-position test (n <= p  ->  n >= p)',
    [['          return n <= m.index + (rel < 0 ? 0 : rel);', '          return n >= m.index + (rel < 0 ? 0 : rel);']]],
  ['M2 drop the AUXILIARY requirement (COMPLETION_VERB becomes any participle = run17/D128)',
    [['const COMPLETION_VERB = /\\b(?:has|have|had|was|were)(?:\\s+(?:not|been|being|already|just|recently|successfully|also|now))*\\s+(?:archived',
      'const COMPLETION_VERB = /\\b(?:has|have|had|was|were)?(?:\\s+(?:not|been|being|already|just|recently|successfully|also|now))*\\s*(?:archived']]],
  ['M3 put PRESENT TENSE is/are back into COMPLETION_VERB',
    [['const COMPLETION_VERB = /\\b(?:has|have|had|was|were)(', 'const COMPLETION_VERB = /\\b(?:has|have|had|was|were|is|are)(']]],
  ['M4 add and/but/dash clause boundaries back (the run17/D128 P1 shape)',
    [['String(s).split(/[.!?,\\x3b\\n]+|:\\s/)', 'String(s).split(/[.!?,\\x3b\\n]+|:\\s|\\sand\\s|\\sbut\\s|\\s[\\u2014\\u2013-]\\s/)']]],
  ['M5 drop the colon-space boundary this candidate added',
    [['String(s).split(/[.!?,\\x3b\\n]+|:\\s/)', 'String(s).split(/[.!?,\\x3b\\n]+/)']]],
  ['M6 put "without" back into the negator list',
    [["const NEGATED_CLAUSE = /\\b(?:not|never|no|nothing|none|pending", "const NEGATED_CLAUSE = /\\b(?:not|never|no|nothing|none|without|pending"]]],
  ['M7 remove the hasOwnProperty guard in the MATCHER (D132 half 1)',
    [['    const ownVerbs = Object.prototype.hasOwnProperty.call(ACTION_FAMILY_VERBS, at);', '    const ownVerbs = !!ACTION_FAMILY_VERBS[at];'],
     ['    const ownNouns = Object.prototype.hasOwnProperty.call(ENTITY_NOUNS, et);', '    const ownNouns = !!ENTITY_NOUNS[et];']]],
  ['M8 remove the hasOwnProperty guard in resolveClarificationField (D132 half 2)',
    [['  if (!Object.prototype.hasOwnProperty.call(CLARIFICATION_ENTITY_ACTION_FIELD, entityType)) return undefined;\r\n  const row = CLARIFICATION_ENTITY_ACTION_FIELD[entityType];\r\n  return Object.prototype.hasOwnProperty.call(row, actionType) ? row[actionType] : undefined;',
      '  return CLARIFICATION_ENTITY_ACTION_FIELD[entityType]?.[actionType];']]],
  ['M9 disable the ordinal path entirely (D133 revert)',
    [['  if (ordN >= 1) {', '  if (false && ordN >= 1) {']]],
  ['M10 drop the ordinal RANGE check (out-of-range ordinal binds)',
    [['return (ordN <= options.length && options[ordN - 1] && typeof options[ordN - 1].id === \'string\') ? options[ordN - 1] : null;',
      'return (options[ordN - 1] && typeof options[ordN - 1].id === \'string\') ? options[ordN - 1] : options[options.length - 1] || null;']]],
];

console.log('pristine sha: ' + assertPristine('start'));
const baseSrc = P();
const baseline = probes.map(([n, f]) => [n, String(f(baseSrc))]);
const baseBat = runBattery();
console.log('baseline battery: ok=' + baseBat.ok + ' fail=' + baseBat.fail + ' nonzeroExits=' + baseBat.exits + '\n');

const results = [];
for (const [name, edits] of MUTANTS) {
  const r = withMutant(name, edits, () => {
    const src = P();
    const diffs = [];
    for (const [n, f] of probes) {
      let v; try { v = String(f(src)); } catch (e) { v = 'HARNESS-THREW'; }
      const b = baseline.find((x) => x[0] === n)[1];
      if (v !== b) diffs.push(n + ': ' + b + ' -> ' + v);
    }
    const bat = runBattery();
    return { diffs, bat };
  });
  const killed = r.bat.fail > 0 || r.bat.exits > 0;
  results.push([name, killed, r]);
  console.log((killed ? 'KILLED   ' : 'SURVIVED ') + name);
  console.log('   battery: fail=' + r.bat.fail + ' nonzeroExits=' + r.bat.exits
    + (killed ? ' by: ' + r.bat.perSuite.filter((s) => s.fail > 0 || s.code !== 0).map((s) => s.f).join(',') : ''));
  console.log('   behavioural divergence: ' + (r.diffs.length === 0 ? 'NONE (mutant is a no-op on these probes)' : ''));
  for (const d of r.diffs) console.log('     * ' + d);
}
console.log('\nSUMMARY: ' + results.filter((r) => r[1]).length + ' killed, ' + results.filter((r) => !r[1]).length + ' SURVIVED, of ' + results.length);
for (const [n, k, r] of results) if (!k) console.log('  SURVIVOR: ' + n + '  (diverges on ' + r.diffs.length + ' probes)');
console.log('\nrestored sha: ' + assertPristine('end'));
