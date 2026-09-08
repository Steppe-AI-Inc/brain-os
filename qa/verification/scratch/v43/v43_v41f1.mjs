// v43: independently re-derive verifier #42's RETRACTION of ledger #104's "reverting V41-F1
// re-opens 144 destroyed truths". V41-F1 is the object-AGNOSTIC finite-verb guard on the
// EXECUTION_IN_PROGRESS arm. Revert it and count how many ordinary product-help sentences flip,
// in a GENERAL combinatorial space and in a space ENGINEERED to isolate the bare-subject shape.
import { readSrc, buildBelt, makeV92Fires, CAND_PATH, V92_PATH } from './v43_belt.mjs';
const SRC = readSrc(CAND_PATH);
const v92 = makeV92Fires(readSrc(V92_PATH));
const ANCHOR = '|sending|processing|executing|working|starting|kicking)';
const n = SRC.split(ANCHOR).length - 1;
console.log('V41-F1 anchor occurrences: ' + n + ' (expect 1)');
const base = buildBelt(SRC);
const reverted = buildBelt(SRC.replace(ANCHOR, ANCHOR + 'zzzzNEVERMATCHzzzz'));

const GER = ['Archiving', 'Restoring', 'Deleting', 'Removing', 'Assigning', 'Reassigning', 'Updating',
  'Creating', 'Moving', 'Renaming', 'Closing', 'Clearing', 'Granting', 'Approving', 'Completing',
  'Activating', 'Deactivating', 'Adding', 'Sending', 'Ending', 'Declining', 'Rejecting'];
const OBJ = ['a company', 'a business unit', 'a task', 'a goal', 'a project', 'a document', 'an approval',
  'a person', 'a department', 'the roster', 'the proposal', 'this record', 'that entry', 'an invoice',
  'a work order', 'the goal list', 'a lead', 'a product line', 'the inventory item', 'a channel',
  'a memory', 'the audit trail', 'a KPI', 'a salary record', 'an agent', 'the strategic map',
  'a contract', 'a milestone', 'the org chart', 'a policy'];
const PRED = ['hides it from the active list.', 'is reversible.', 'is not reversible.',
  'requires an active membership.', 'needs founder approval.', 'takes effect immediately.',
  'keeps its full history.', 'ends every assignment on it.', 'leaves dependents untouched.',
  'means no further action is possible.', 'happens without a confirmation step.',
  'stays visible in historical lookups.', 'remains available to admins.', 'gets logged in the audit trail.',
  'becomes permanent after 30 days.', 'costs nothing.', 'involves two approvals.',
  'depends on your role.', 'applies to the whole company.', 'allows a later restore.',
  'lets you undo it.', 'makes the record read-only.', 'does not notify anyone.',
  'notifies the owner.', 'switches the status to archived.', 'drops it from every selector.'];
const general = [];
for (const g of GER) for (const o of OBJ) for (const p of PRED) general.push(`${g} ${o} ${p}`);

// engineered: the BARE-SUBJECT shape, no object at all
const MODAL = ['can be undone.', 'cannot be undone.', 'is reversible.', 'is permanent.',
  'requires approval.', 'is logged.', 'is available to admins.', 'takes a moment.'];
const engineered = [];
for (const g of GER) for (const m of MODAL) { engineered.push(`${g} ${m}`); engineered.push(`${g} it ${m.replace(/^(can|cannot|is|requires|takes)/, (x) => x)}`); }

const count = (space) => space.filter((s) => !v92(s) && base(s) !== reverted(s)).length;
const destroyedByReverted = (space) => space.filter((s) => !v92(s) && !base(s) && reverted(s));
console.log(`\nGENERAL space    : ${general.length} sentences; v92 preserves ${general.filter((s) => !v92(s)).length}`);
console.log(`   candidate destroys      : ${general.filter((s) => !v92(s) && base(s)).length}`);
console.log(`   V41-F1 REVERTED destroys: ${general.filter((s) => !v92(s) && reverted(s)).length}`);
console.log(`   flipped by the revert   : ${count(general)}`);
console.log(`\nENGINEERED space : ${engineered.length} sentences; v92 preserves ${engineered.filter((s) => !v92(s)).length}`);
console.log(`   candidate destroys      : ${engineered.filter((s) => !v92(s) && base(s)).length}`);
console.log(`   V41-F1 REVERTED destroys: ${engineered.filter((s) => !v92(s) && reverted(s)).length}`);
console.log(`   flipped by the revert   : ${count(engineered)}`);
const ex = destroyedByReverted(engineered).slice(0, 8);
if (ex.length) { console.log('   examples the revert destroys:'); for (const s of ex) console.log('     ' + s); }
