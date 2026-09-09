// VERIFIER #69 — PRIMARY MISSION. The axes the record says are unswept, each run through the REAL tiers:
//   VERB (all ~120 lexicon verbs) x OBJECT x FRAME, MODIFIER BOUNDARY (both sides), PUNCTUATION/CASING,
//   NEGATION in non-leading position, MULTI-ENTITY, LANGUAGE (Mongolian loan verbs), MODEL-FIELD DISAGREEMENT,
//   and the RECEIPT PLURALISER over every canonical noun.
// A "ship" = a mutation request that derives NO intent and the executor does not act (so the model's own
// prose would be the whole answer). A "destroyed" = a truthful read that acquires intent (the receipt
// would replace the answer).
import fs from 'node:fs';
import { turn, intent, receipt, execGate } from './tiers_harness.mjs';

const src = fs.readFileSync(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts', 'utf8');
const VERBS = src.match(/const MUTATION_VERB_ALTERNATION = "([^"]+)"/)[1].split('|');
const NOUN_SRC = (() => { const a = src.indexOf('const ENTITY_NOUN_ALTERNATION = '); const b = src.indexOf(';', a); return src.slice(a, b); })();
const NOUN_ALT = NOUN_SRC.match(/"([^"]+)"/g).map((s) => s.slice(1, -1)).join('');
// Expand the regex alternation into concrete surface forms.
function expand(alt) {
  const out = [];
  for (const m of alt.split('|')) {
    if (!/[()?\[]/.test(m)) { out.push(m); continue; }
    if (m === 'compan(?:y|ies)') out.push('company', 'companies');
    else if (m === 'organi[sz]ation') out.push('organisation', 'organization');
    else if (m === 'categor(?:y|ies)') out.push('category', 'categories');
    else if (/\?$/.test(m)) { const b = m.replace(/s\?$/, ''); out.push(b, b + 's'); }
    else out.push(m.replace(/[()?:]/g, ''));
  }
  return out;
}
const NOUNS = expand(NOUN_ALT);
const FIX = [{ name: 'ACME', status: 'active' }, { name: 'Beta', status: 'archived' }, { name: 'Nomin Holding', status: 'active' }];
const report = { verb_axis: {}, modifier: {}, punct: {}, negation: {}, multi_entity: {}, mongolian: {}, model_disagree: {}, pluraliser: {} };
const shipList = [];
const rec = (bucket, key, cmd, t, expectIntent, note = '') => {
  const got = t.intent !== null;
  const ok = got === expectIntent;
  report[bucket][key] = report[bucket][key] || { n: 0, bad: 0, examples: [] };
  const r = report[bucket][key]; r.n++;
  if (!ok) { r.bad++; if (r.examples.length < 6) r.examples.push({ cmd, intent: t.intent, executes: t.executes, asks: t.asks, gate: { allowed: t.gate.allowed, name: t.gate.name }, note }); }
  if (!ok && expectIntent && !t.executes) shipList.push({ bucket, key, cmd });
  return ok;
};

// ---------------------------------------------------------------- A. VERB AXIS
const OBJECTS = { acme: 'ACME', task: 'task QA-1', wo: 'the work order WO-1', bob: 'Bob', approval: 'purchase approval A-1', quoted: '"Nomin Holding"', lower_noun: 'the invoice' };
const FRAMES = { bare: (v, o) => `${v} ${o}`, please: (v, o) => `please ${v} ${o}`, couldyou: (v, o) => `could you ${v} ${o}?`, canwe: (v, o) => `can we ${v} ${o}?`, then_list: (v, o) => `${v} ${o} and list them`, lead_clause: (v, o) => `since we are done, ${v} ${o}`, lower: (v, o) => `${v} ${o}`.toLowerCase(), upper: (v, o) => `${v} ${o}`.toUpperCase() };
for (const v of VERBS) for (const [ok, o] of Object.entries(OBJECTS)) for (const [fk, f] of Object.entries(FRAMES)) {
  const cmd = f(v, o);
  rec('verb_axis', fk + '/' + ok, cmd, turn(cmd, { fixture: FIX }), true);
}

// ---------------------------------------------------------------- B. MODIFIER BOUNDARY, both sides
const twoMod = ['archive old duplicate work order WO-1', 'delete stale draft purchase approval A-1', 'archive expired engineering task QA-1',
  'restore last quarter business unit Beta', 'archive old duplicate work order WO-1 and list the rest', 'delete stale draft purchase approval A-1, then update me',
  'please archive old duplicate work order WO-1', 'archive dead legacy project Alpha', 'end former contractor employment for Bob'];
for (const c of twoMod) rec('modifier', 'two_modifiers_no_determiner (must derive)', c, turn(c, { fixture: FIX }), true);
const twoModDet = ['archive the old duplicate work order WO-1', 'delete the stale draft purchase approval A-1'];
for (const c of twoModDet) rec('modifier', 'two_modifiers_with_determiner', c, turn(c, { fixture: FIX }), true);
// One modifier, truthful READ headlines (a lexicon verb heads a noun phrase; an entity noun sits one word in).
const oneModReads = ['Fire drill report for the department', 'Post mortem report for the project', 'Order status report for the board', 'Share price report for investors',
  'Issue log report for the team', 'Set piece budget for the project', 'Order book status for Q3', 'Post launch project review', 'Close call report from the site',
  'Transfer pricing document for Q3', 'Split shift schedule for the team', 'Merge conflict report for the project', 'Email digest report for the team', 'Charge back report for the account'];
for (const c of oneModReads) rec('modifier', 'one_modifier_read_headline (must NOT derive)', c, turn(c, { fixture: FIX }), false);
const zeroModReads = ['Transfer pricing for the business unit', 'Close call on the Beta deal today', 'Share price fell after the announcement', 'Archive policy needs a review', 'Order book for Q3', 'Fire safety for the department'];
for (const c of zeroModReads) rec('modifier', 'v68_pins (must NOT derive)', c, turn(c, { fixture: FIX }), false);

// ---------------------------------------------------------------- C. PUNCTUATION / CASING
const punct = ['ARCHIVE ACME', 'Archive: ACME', 'archive: ACME', 'archive - ACME', 'archive — ACME', 'archive «ACME»', 'archive ACME.', 'archive ACME!!!', 'archive\nACME', 'archive:ACME', 'archive (ACME)', 'Archive → ACME', 'archive task: QA-1', 'archive task - QA-1', 'archive: task QA-1', 'Archive: the work order WO-1', 'archive ‘ACME’', 'archive `ACME`', 'ARCHIVE: ACME', 'archive… ACME', 'archive; ACME'];
for (const c of punct) rec('punct', 'punctuated_imperative (must derive)', c, turn(c, { fixture: FIX }), true);

// ---------------------------------------------------------------- D. NEGATION, non-leading position
const negs = [
  ['ACME — do not archive it', true], ['please, never archive ACME', true], ['ok, do not archive ACME', true], ['archive Beta but do not archive ACME', true],
  ['restore Beta, but do not suspend ACME', true], ['I said do not promote Bob', true], ['ok do not hire Bob', true], ['archive ACME — actually no, do not', true],
  ['do NOT archive ACME', true], ['never, ever archive ACME', true], ['ACME: do not restore', true], ['make sure you do not archive ACME', true],
];
for (const [c, e] of negs) {
  const t = turn(c, { fixture: FIX });
  rec('negation', 'non_leading_negation (intent must exist, executor must NOT act)', c, t, e);
  if (t.executes) { report.negation.EXECUTED = report.negation.EXECUTED || []; report.negation.EXECUTED.push(c); }
  if (t.intent) { const r = receipt(c, t.intent); report.negation.reasons = report.negation.reasons || {}; report.negation.reasons[c] = r.reason; }
}

// ---------------------------------------------------------------- E. MULTI-ENTITY
const multi = ['archive task QA-1 and company ACME', 'archive ACME and restore Beta', 'archive ACME and Beta', "archive ACME and end Bob's employment", 'restore Beta and archive ACME', 'archive ACME, Nomin Holding', 'archive ACME and Nomin Holding'];
for (const c of multi) { const t = turn(c, { fixture: FIX }); rec('multi_entity', 'derives', c, t, true); report.multi_entity[c] = { intent: t.intent, executes: t.executes, asks: t.asks, gate_name: t.gate.name, head: t.gate.head }; }

// ---------------------------------------------------------------- F. MONGOLIAN loan verbs and native
const mn = [['ACME-г archive хийнэ үү', true], ['ACME-г fire хийнэ үү', true], ['Bob-г hire хий', true], ['ACME-г suspend хийнэ үү', true], ['Bob-г promote хийнэ үү', true], ['ACME-г terminate хий', true],
  ['ACME компанийг архивла', true], ['ACME компанийг сэргээ', true], ['ACME архивлагдсан уу?', false], ['архивлагдсан компаниудыг харуул', false], ['Bob-г dismiss хийнэ үү', true], ['ACME-г split хийнэ үү', true], ['ACME-г rename хийнэ үү', true]];
for (const [c, e] of mn) rec('mongolian', e ? 'mn_request (must derive)' : 'mn_read (must NOT derive)', c, turn(c, { fixture: FIX }), e);

// ---------------------------------------------------------------- G. MODEL FIELD DISAGREES WITH THE COMMAND
{
  const id = '11111111-1111-4111-8111-111111111111';
  const t = turn('archive ACME', { result: { restoreCompanyIds: [id] }, fixture: FIX });
  report.model_disagree['archive ACME + model restoreCompanyIds'] = { gate_allowed: t.gate.allowed, intent: t.intent, note: 'executor takes the MODEL direction; command verb is archive' };
  const g = execGate('archive ACME', { restoreCompanyIds: [id] });
  report.model_disagree.gate = g;
  const t2 = turn('restore Beta', { result: { archiveCompanyIds: [id] }, fixture: FIX });
  report.model_disagree['restore Beta + model archiveCompanyIds'] = { intent: t2.intent };
  const t3 = turn('archive ACME', { result: { requestIntent: { kind: 'read' } }, fixture: FIX });
  report.model_disagree['archive ACME + model kind:read'] = { intent: t3.intent, executes: t3.executes };
  const t4 = turn('what is archived?', { result: { requestIntent: { kind: 'mutation', action: 'archive' } }, fixture: FIX });
  report.model_disagree['read + model kind:mutation'] = { intent: t4.intent, executes: t4.executes };
}

// ---------------------------------------------------------------- H. RECEIPT PLURALISER, every canonical noun
const plur = {};
for (const n of NOUNS) {
  const r = receipt(`restore ${n} X-1`, { verb: 'restore', field: null });
  plur[n] = { entity: r.commandEntity, plural: r.plural, reason: r.reason };
}
report.pluraliser = plur;
const badPlural = Object.entries(plur).filter(([n, r]) => r.entity && (!/^[a-z][a-z ]*$/.test(r.entity) || /(statu|acces|addresse|busines|proces|categorie)$/.test(r.entity) || /ss$/.test(r.plural) && !/^(access|business|address)/.test(r.entity) || /^(statu|acces)/.test(r.plural)));
report.pluraliser_defects = badPlural.map(([n, r]) => ({ noun: n, entity: r.entity, plural: r.plural, reason: r.reason }));

// ---------------------------------------------------------------- summary
const lines = [];
for (const [bucket, keys] of Object.entries(report)) {
  if (bucket === 'pluraliser' || bucket === 'pluraliser_defects' || bucket === 'model_disagree') continue;
  for (const [k, r] of Object.entries(keys)) if (r && typeof r.n === 'number') lines.push(`${bucket.padEnd(13)} ${k.padEnd(62)} ${String(r.bad).padStart(4)} / ${String(r.n).padStart(4)} bad`);
}
console.log(lines.join('\n'));
console.log('\nSHIP LIST (mutation request, no intent, executor idle):', shipList.length);
for (const s of shipList.slice(0, 80)) console.log('  ' + s.bucket + '/' + s.key + '  ' + JSON.stringify(s.cmd));
console.log('\nPLURALISER DEFECTS:', report.pluraliser_defects.length);
for (const d of report.pluraliser_defects) console.log('  ' + JSON.stringify(d));
console.log('\nMODEL DISAGREE:', JSON.stringify(report.model_disagree, null, 1));
console.log('\nMULTI-ENTITY:', JSON.stringify(report.multi_entity, null, 1));
console.log('\nNEGATION REASONS:', JSON.stringify(report.negation.reasons, null, 1), 'EXECUTED:', JSON.stringify(report.negation.EXECUTED || []));
fs.writeFileSync('qa/verification/scratch/v69/axis_attack.json', JSON.stringify({ report, shipList }, null, 1));
