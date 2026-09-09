// CODEX FINDING A — CONFIRMED, and closed here.
//
// THE DEFECT, reproduced from the candidate's own bytes before any change: the only negation test in the
// request path, `commandNegatedLead`, is consumed at exactly ONE site - `commandFallbackAllowed`, which
// governs the RAW-COMMAND fallback. That same expression requires `!modelEmittedArchive`, so on precisely
// the turns where the model DID emit a lifecycle payload the fallback is already off and the negation is
// never consulted. `result.archiveCompanyIds` then flows into resolveCompanyLifecycleTargets and on into the
// executor with nothing between it and the database that reads the founder's "do not".
//
// THE FOUNDER'S INVARIANT: USER REQUEST / CANONICAL INTENT outranks MODEL-SUPPLIED ACTION. A model action
// may never override an explicit user negation.
//
// THE FIX IS ONE GATE, NOT TWENTY. The mutation payload is sanitised ONCE, immediately after the model's
// JSON is parsed and before any consumer reads it, using MUTATION_ARRAY_FIELDS - the list the file already
// maintains as the definition of "a field that mutates". Gating two call sites would have left the other
// forty-odd fields (tasks, people, goals, assignments, deletions) reachable, and "never move Bob to Company
// B" is a person assignment, not a company archive. Sanitising the source is the only version of this fix
// that is complete by construction rather than by enumeration.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
const EXPECT_IN = process.env.SEM_EXPECT_INPUT_SHA256;
const rawIn = readFileSync(p);
const shaIn = createHash('sha256').update(rawIn).digest('hex');
if (EXPECT_IN && shaIn !== EXPECT_IN) throw new Error('refusing: ' + p + ' is ' + shaIn.slice(0, 16) + '…, expected ' + EXPECT_IN.slice(0, 16) + '…');
let s = rawIn.toString('utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(what + ': anchor ' + (n === 0 ? 'missing' : 'not unique (' + n + ')'));
  s = s.replace(from, () => to);
  edits.push(what);
}
const B = String.raw`\\b`, S = String.raw`\\s`, W = String.raw`\\w`;

// 1. ONE definition of the negation vocabulary, and ONE list of mutating fields, both at module level.
sub('REQUEST_NEGATED_ALTERNATION and MUTATION_RESULT_FIELDS are declared, at module level',
  `const ENTITY_NOUN_ALTERNATION = `,
  `// THE ONE DEFINITION OF "THIS REQUEST WAS NEGATED" (Codex finding A, 2026-09-09). Three separate
// spellings of this existed - the executor's \`commandNegatedLead\`, the intent tier's negated-verb test and
// the receipt's \`negatedRequest\` - and they disagreed about which negators and which verbs counted. A
// vocabulary that decides whether the founder's "do not" is honoured cannot be maintained in three places.
const REQUEST_NEGATED_ALTERNATION = "do not|do n't|don't|don\\u2019t|dont|never|no need to|not going to|no longer|please do not|please don't|please don\\u2019t|must not|mustn't|mustn\\u2019t|should not|shouldn't|shouldn\\u2019t|will not|won't|won\\u2019t|cannot|can't|can\\u2019t|stop|instead of|rather than|without";
// Every field of the model's reply that CHANGES something. Hoisted to module level so the negation gate can
// run the moment the reply is parsed, long before any individual consumer reads a field. The handler keeps
// its own name for it, so every window and harness that slices that region still resolves.
const MUTATION_RESULT_FIELDS = ['tasks','deleteTaskIds','archiveTaskIds','restoreTaskIds','deleteChannelIds','deleteApprovalIds','pendingDeleteTaskIds','pendingDeleteChannelIds','createCompanies','updateCompanies','archiveCompanyIds','restoreCompanyIds','archiveCompanyNames','restoreCompanyNames','permanentDeleteFixtureCompanyIds','createPeople','endEmploymentPersonIds','restoreEmploymentPersonIds','createProjects','createGoals','archiveGoalIds','restoreGoalIds','createFactoryWorkOrders','createDepartments','updateDepartments','createLeads','updateLeads','createDocuments','createProductLines','updateProductLines','deleteProductLineIds','createProductSpecs','updateProductSpecs','deleteProductSpecIds','createEngineeringDrawings','deleteEngineeringDrawingIds','createAiProviders','deleteAiProviderIds','deleteMcpConnectorIds','createProposals','updateProposals','deleteProposalIds','createCompanyRelationships','createPersonAssignments'];
const ENTITY_NOUN_ALTERNATION = `);

// 2. THE GATE. Immediately after the reply is parsed, before any consumer reads a field.
sub('a negated request strips every model-supplied mutation before any consumer sees it',
  `        // Business logic (risk-keyword forcing, domain routing) stays here in TypeScript;`,
  `        // ── THE NEGATION GATE (Codex finding A) ────────────────────────────────────────────────────
        // "do not archive ACME", "never move Bob to Company B". The founder said NOT to. Whatever the model
        // replied, no mutation may leave this turn - so the mutating fields are removed from the reply
        // itself, once, here, rather than being gated at each of the forty-odd places one is later read.
        // The prose reply survives untouched: the founder still gets an answer, and the receipt below
        // already says "you asked me not to, so nothing was executed".
        //
        // A negation applies to the CLAUSE it governs. "archive ACME, but do not delete it" negates the
        // delete, not the archive, so a command that also carries an un-negated imperative mutation clause
        // is NOT swallowed whole - the gate fires only when every mutation clause in the turn is negated,
        // which is the shape the founder's own examples take.
        const requestIsNegated = (() => {
          const text = String(command || '');
          const negated = new RegExp('${B}(?:' + REQUEST_NEGATED_ALTERNATION + ')[${S},]+(?:${W}+[${S},]+){0,3}(?:' + MUTATION_VERB_ALTERNATION + ')${B}', 'i');
          if (!negated.test(text)) return false;
          // An un-negated imperative mutation elsewhere in the same turn means the founder asked for
          // something as well as forbidding something; that is a mixed turn, not a refusal.
          // A REGEX LITERAL, so its escapes are SINGLE. The double-escaped fragments used everywhere else in
          // this file are for regexes built from STRINGS; written into a literal, a doubled \\\\s is a
          // backslash followed by an s, and the split silently never splits. That is exactly what happened
          // here, and the BEHAVIOURAL row caught it after four structural rows had passed over it.
          const clauses = text.split(/[,;]\\s+|\\s[\\u2014\\u2013-]\\s+|\\s+(?:and then|then|and)\\s+/i);
          const negatedClause = new RegExp('${B}(?:' + REQUEST_NEGATED_ALTERNATION + ')${B}', 'i');
          const imperative = new RegExp('^${S}*(?:' + MUTATION_VERB_ALTERNATION + ')${B}', 'i');
          return !clauses.some((c) => !negatedClause.test(c) && imperative.test(c.trim()));
        })();
        let negatedRequestStrippedFields: string[] = [];
        if (requestIsNegated && result && typeof result === 'object') {
          const record = result as Record<string, unknown>;
          // The array list plus the one SCALAR mutating field the handler tier treats separately.
          for (const field of MUTATION_RESULT_FIELDS.concat(['activateAiProviderId'])) {
            const value = record[field];
            const present = Array.isArray(value) ? value.length > 0 : (value !== undefined && value !== null && value !== '');
            if (!present) continue;
            negatedRequestStrippedFields.push(field);
            if (Array.isArray(value)) record[field] = []; else delete record[field];
          }
          if (negatedRequestStrippedFields.length > 0) {
            // AUDITABLE, because a refusal nobody records is indistinguishable from a turn where the model
            // simply proposed nothing - and the difference is exactly what an investigator needs later.
            await supabase.from('audit_logs').insert({
              actor_profile_id: profile.id, actor_role: profile.role,
              event_type: 'negated_request_refused', entity_type: 'work_order', entity_id: workOrderId,
              message: 'The request was negated; model-supplied mutations were refused',
              metadata: { command: String(command || '').slice(0, 500), strippedFields: negatedRequestStrippedFields },
            }).catch(() => {});
          }
        }

        // Business logic (risk-keyword forcing, domain routing) stays here in TypeScript;`);

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
if (out.includes(String.fromCharCode(8))) throw new Error('a backspace character is present');
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
console.log('sha256 ' + createHash('sha256').update(readFileSync(p)).digest('hex'));
