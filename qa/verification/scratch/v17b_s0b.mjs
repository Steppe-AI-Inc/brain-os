// VERIFIER #17 / SCENARIO 0b — does a residual mis-bind actually ARM a destructive field?
// Executes the real matcher + commandContradictsActionType + resolveClarificationField.
import { readSrc, balancedFrom, statementFrom, ts2js, buildMatcherAny, opt } from './v17b_lib.mjs';
import { readFileSync } from 'node:fs';

function buildDecider(src) {
  const body = ts2js([
    statementFrom(src, 'const CLARIFICATION_ENTITY_ACTION_FIELD'),
    balancedFrom(src, 'function resolveClarificationField'),
    statementFrom(src, 'const ARCHIVE_VERB_PATTERN ='),
    statementFrom(src, 'const RESTORE_VERB_PATTERN ='),
    balancedFrom(src, 'function commandContradictsActionType'),
    balancedFrom(src, 'function matchDisambiguationOption'),
  ].join('\n'))
    .replace(/const CLARIFICATION_ENTITY_ACTION_FIELD\s*:\s*Record<string,\s*Record<string,\s*string>>\s*=/, 'const CLARIFICATION_ENTITY_ACTION_FIELD =')
    .replace(/function resolveClarificationField\([^)]*\)\s*:\s*string \| undefined \{/, 'function resolveClarificationField(entityType, actionType) {')
    .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean \{/, 'function commandContradictsActionType(command, actionType) {');
  for (const lit of ['CLARIFICATION_ENTITY_ACTION_FIELD', 'function commandContradictsActionType', 'function matchDisambiguationOption']) {
    if (!body.includes(lit)) throw new Error('V17 refusing: missing ' + lit);
  }
  return new Function(body + `
    return function decide(command, options) {
      const matchedOption = matchDisambiguationOption(command, options);
      const contradicted = !!matchedOption && commandContradictsActionType(command, matchedOption.actionType);
      const field = matchedOption && !contradicted ? resolveClarificationField(matchedOption.entityType, matchedOption.actionType) : undefined;
      return (matchedOption && !contradicted && field)
        ? { armed: field, id: matchedOption.id }
        : { armed: null, id: matchedOption ? matchedOption.id : null, contradicted };
    };`)();
}

const decideNow = buildDecider(readSrc());
const decide52 = buildDecider(readFileSync('qa/verification/scratch/v17b_idx_52e830f.ts', 'utf8'));

// A pending ARCHIVE disambiguation over two real companies.
const ARCH = [opt('c1', 'Acme', 'company', 'archive'), opt('c2', 'Beta Corp', 'company', 'archive')];
const REST = [opt('c1', 'Acme', 'company', 'restore'), opt('c2', 'Beta Corp', 'company', 'restore')];
const PEOPLE = [opt('p1', 'Bob Smith', 'person', 'archive'), opt('p2', 'Jane Doe', 'person', 'archive')];

const probes = [
  ['reject acme', ARCH], ['rename acme', ARCH], ['assign acme', ARCH], ['approve acme', ARCH],
  ['reassign acme', ARCH], ['update acme', ARCH], ['activate acme', ARCH], ['deactivate acme', ARCH],
  ['restore acme', ARCH], ['delete acme', ARCH], ['close acme', ARCH],
  ['archive acme tasks', ARCH], ['acme employees', ARCH], ['acme people', ARCH],
  ['archive acme', REST], ['delete acme', REST], ['rename acme', REST], ['reject acme', REST],
  ['end acme', PEOPLE], ['reject bob smith', PEOPLE], ['rename bob smith', PEOPLE],
  ['acme', ARCH], ['yes archive acme', ARCH],
];
console.log('reply'.padEnd(24) + 'pendingAction'.padEnd(22) + 'CANDIDATE'.padEnd(34) + '52e830f');
for (const [reply, options] of probes) {
  const kind = options === ARCH ? 'company/archive' : options === REST ? 'company/restore' : 'person/archive';
  const a = decideNow(reply, options), b = decide52(reply, options);
  const f = (x) => (x.armed ? `ARMED ${x.armed}=[${x.id}]` : `refused (matched=${x.id}, contra=${!!x.contradicted})`);
  console.log(JSON.stringify(reply).padEnd(24) + kind.padEnd(22) + f(a).padEnd(34) + f(b));
}
