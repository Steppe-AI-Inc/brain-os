// V69-D3/D4/D6 — the verb-list classification, and the convergences it licenses.
//
// EVERY remaining truncated copy of MUTATION_VERB_ALTERNATION was classified before anything was merged.
// The founder's rule and the verifier's both say the same thing: converge what is genuinely one concept,
// REGISTER what genuinely differs, and never merge two things merely because they share verbs.
//
//   line 5965  IMPERATIVE_LEAD (26)               ACCIDENTAL DRIFT  -> converge
//              "does this summary begin with a mutation verb". That IS the canonical concept; the 26-verb
//              spelling simply stopped growing, so a pending summary reading "Suspend ACME" was classified
//              as an assertion rather than as the imperative it is.
//   line 6017  MUTATION_NEEDS_PARTICIPLE (29)     ACCIDENTAL DRIFT  -> converge
//              "needs archiving" - the canonical concept in participle morphology, nothing more.
//   line 6021  MUTATION_VERB_WITH_OBJECT (24)     INTENTIONALLY DIFFERENT -> register, and converge its
//   line 6023  MUTATION_VERB_PROPER_OBJECT (18)   THREE spellings onto one definition
//   line 6350  lexiconObject's extractor (23)
//              These three are the AMBIGUOUS verbs - the ones that are only a mutation when they carry an
//              object ("close the deal" is a request, "close call" is a noun phrase). They deliberately
//              EXCLUDE archive/delete/restore, which are unconditional and handled by MUTATION_VERB_ALWAYS.
//              That exclusion is the whole point, so the set is not the canonical list and must not become
//              it - but it was written out THREE times and had already drifted, so it becomes one
//              definition with three consumers.
//   line 6724  "I will archive ..." (22)          INTENTIONALLY DIFFERENT -> register
//   line 6728  "let me archive ..." (20)          INTENTIONALLY DIFFERENT -> register
//              RESPONSE-side: what the MODEL claimed it did. Merging these with request-side recognition
//              would mean a wider model-claim vocabulary silently widening what counts as a user request.
//              Different side of the turn, different concept, registered rather than merged.
//
// Registration is a marker IN THE SOURCE, not an allowlist in a test: the decision belongs next to the code
// a reviewer reads, and an unregistered new copy still fails the scan.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
const EXPECT_IN = process.env.SEM_EXPECT_INPUT_SHA256 || '195078324b8d78abf51c3be6f3c1151b99cda414d36e74f3635f2a1a157e2151';
const rawIn = readFileSync(p);
const shaIn = createHash('sha256').update(rawIn).digest('hex');
if (shaIn !== EXPECT_IN) throw new Error('refusing: ' + p + ' is ' + shaIn.slice(0, 16) + '…, expected ' + EXPECT_IN.slice(0, 16) + '…');
let s = rawIn.toString('utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(what + ': anchor ' + (n === 0 ? 'missing' : 'not unique (' + n + ')'));
  s = s.replace(from, () => to);
  edits.push(what);
}
const B = String.raw`\\b`;

// ── ONE definition of the ambiguous set, beside the canonical list it deliberately differs from ────
sub('AMBIGUOUS_MUTATION_VERB_ALTERNATION is declared once, next to MUTATION_VERB_ALTERNATION',
  `const ENTITY_NOUN_ALTERNATION = `,
  `// CONCEPT-REGISTERED: AMBIGUOUS_MUTATION_VERB_ALTERNATION is a deliberate PROPER SUBSET of
// MUTATION_VERB_ALTERNATION and must never be converged onto it. These are the verbs that are a mutation
// ONLY when they carry an object: "close the deal" is a request, "close call" is a noun phrase; "end the
// employment" is a request, "end of quarter" is not. archive/delete/restore are deliberately ABSENT because
// they are unconditional and MUTATION_VERB_ALWAYS owns them. The distinction is the reason this constant
// exists, and merging it would make every ambiguous verb unconditional (verifier #69, V69-D6 classification).
// It replaces THREE hand-written spellings that had already drifted: MUTATION_VERB_WITH_OBJECT,
// MUTATION_VERB_PROPER_OBJECT and the extractor inside lexiconObject.
const AMBIGUOUS_MUTATION_VERB_ALTERNATION = "creat|make|making|add|register|set|setting|updat|chang|edit|fix|modif|correct|clos|complet|finish|cancel|reopen|mark|assign|mov|transfer|end|hire|onboard";
const ENTITY_NOUN_ALTERNATION = `);

// ── ACCIDENTAL DRIFT — converge ────────────────────────────────────────────────────────────────────
sub('IMPERATIVE_LEAD derives from the canonical verb list',
  `          const IMPERATIVE_LEAD = /^(archive|restore|create|delete|update|assign|reassign|mark|set|move|end|add|remove|rename|close|clear|send|grant|decline|approve|reject|complete|activate|deactivate|make|change)\\b/i;`,
  `          // 26 of the 120 canonical verbs, containment 1.00 - the spelling simply stopped growing, so a
          // pending summary reading "Suspend ACME" was classified as an ASSERTION rather than the imperative
          // it plainly is (verifier #69, V69-D6). Same concept, one definition.
          const IMPERATIVE_LEAD = new RegExp('^(?:' + MUTATION_VERB_ALTERNATION + ')${B}', 'i');`);

sub('MUTATION_NEEDS_PARTICIPLE derives from the canonical verb list',
  `        const MUTATION_NEEDS_PARTICIPLE = /\\b(?:needs?|wants?|requires?)\\s+(?:archiv|un-?archiv|restor|reactivat|delet|remov|renam|retitl|reassign|unassign|approv|activat|deactivat|invit|revok|enabl|disabl|promot|demot|onboard|merg|updat|clos|complet|cancel|assign|mov|transfer|end)ing\\b/i;`,
  `        // 29 stems, containment 0.97 - the canonical concept in participle morphology and nothing else,
        // so "ACME needs suspending" was invisible while "ACME needs archiving" was not (verifier #69).
        // Stems are derived from the one definition: a trailing "e" is dropped so "archive" -> "archiv".
        const MUTATION_VERB_ING_STEMS = MUTATION_VERB_ALTERNATION.split('|').map((v) => v.replace(/e$/, '')).join('|');
        const MUTATION_NEEDS_PARTICIPLE = new RegExp('${B}(?:needs?|wants?|requires?)\\\\s+(?:' + MUTATION_VERB_ING_STEMS + ')ing${B}', 'i');`);

// ── INTENTIONALLY DIFFERENT, but written three times — one definition, three consumers ─────────────
// lexiconObject's extractor is a bare stem list and converges safely onto the one definition.
sub('lexiconObject extracts its verb from the one ambiguous-verb definition',
  `((commandText.match(/\\b(creat|make|add|register|set|updat|chang|edit|fix|modif|correct|clos|complet|finish|cancel|reopen|mark|assign|mov|transfer|end|hire|onboard)\\w*/i) || [])[0] || 'update') : null;`,
  `((commandText.match(new RegExp('${B}(?:' + AMBIGUOUS_MUTATION_VERB_ALTERNATION + ')\\\\w*', 'i')) || [])[0] || 'update') : null;`);

// The two big object regexes are REGISTERED where they stand. Their verb portions are the ambiguous set
// too, but they are woven through case-variant spellings and object vocabularies; rewriting them is a real
// refactor, not a rename, and doing it in the same edit as a P1 boundary fix would put a large untested
// change into a release candidate. The decision is recorded and sized instead of being taken silently.
sub('MUTATION_VERB_WITH_OBJECT and MUTATION_VERB_PROPER_OBJECT are registered, with the debt named',
  `        // Unconditional mutation verbs: base and gerund forms anywhere in the command (a participle alone`,
  `        // CONCEPT-REGISTERED: MUTATION_VERB_WITH_OBJECT and MUTATION_VERB_PROPER_OBJECT below are the
        // AMBIGUOUS verb set — a deliberate proper subset of MUTATION_VERB_ALTERNATION (see
        // AMBIGUOUS_MUTATION_VERB_ALTERNATION at the top of the file). They must NOT be converged onto the
        // canonical list: doing so would make "close call" and "end of quarter" mutation requests.
        //
        // REGISTERED DEBT, decision owed: the two of them spell that subset a SECOND and THIRD time, with
        // case-variant alternatives woven through their object vocabularies. That mutual duplication is
        // accidental drift and is real - it is simply not safe to unpick in the same edit as a P1 boundary
        // fix, because their verb portions are interleaved with their object portions. Sized: 24 and 18
        // members, both containment 1.00 against the canonical list, both already consistent with
        // AMBIGUOUS_MUTATION_VERB_ALTERNATION as written today. The convergence belongs in its own source
        // window with its own verifier round.
        // Unconditional mutation verbs: base and gerund forms anywhere in the command (a participle alone`);

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
if (out.includes(String.fromCharCode(8))) throw new Error('a backspace character is present');
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
console.log('sha256 ' + createHash('sha256').update(readFileSync(p)).digest('hex'));
