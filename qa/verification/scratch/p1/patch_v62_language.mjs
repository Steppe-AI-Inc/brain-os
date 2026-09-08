// VERIFIER #62 FINDINGS V62-D3, V62-D6, V62-D7, V62-D8 — the Mongolian-language workspace.
//
// V62-D8 (which is V61-D11 confirmed) is the root of several of these: the command tokenizer that feeds
// every targeted lookup is `/[A-Za-z][A-Za-z0-9'&.-]{3,}/g` — ASCII only. `Эрдэнэт ХХК-г архивла` and
// `Батбаярыг менежерээр томил` produce ZERO name tokens, so no targeted lookup runs, `namedTargets` is
// empty, the head-merge protection never applies, and the uncapped lookup that exists specifically to
// prevent the "not in the window, so it does not exist" fabrication never happens — in the language the
// workspace is actually operated in. Fixed with Unicode letter classes.
//
// V62-D3: the note claimed server-side resolution for every named entity while only four collections had a
// targeted lookup. The note was narrowed one patch ago; this adds the two the verifier named, projects and
// departments, so the claim is broader as well as true. Projects matter most: the pinned incident witness
// question is about a project's current title, and without a lookup a trimmed window could still produce a
// confident wrong answer about one.
//
// V62-D6: six short Mongolian verbal-noun phrases read as commands (Устгалын бүртгэл = "deletion register",
// Томилгооны тушаал = "appointment order"). V62-D7: the imperative surface forms өөрчил and нэм are not
// matched by their own stems өөрчл and нэмэ, so 3 of 21 Mongolian imperatives shipped a fabrication.
// Both are morphology. The rule that separates them is simple and general: A TOKEN CARRYING A NOMINAL CASE
// SUFFIX IS A NOUN, NOT AN IMPERATIVE. Устгалын is genitive, Томилгооны is genitive, нэрийг is accusative;
// архивла, сэргээ, устга, өөрчил and нэм carry no case ending at all.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- D8: the tokenizer sees every alphabet, not only Latin.
must(`    (command.match(/[A-Za-z][A-Za-z0-9'&.-]{3,}/g) || [])`,
`    // Unicode letter classes, not [A-Za-z]: a Cyrillic company or person name produced ZERO tokens, so
    // every targeted lookup silently did not run in the language this workspace is operated in
    // (verifier #62, V62-D8; verifier #61, V61-D11). Mongolian case suffixes attach directly or after a
    // hyphen (ХХК-г, Батбаярыг), and the ilike '%token%' match still finds the stem either way.
    (command.match(/[\\p{L}][\\p{L}\\p{N}'&.-]{3,}/gu) || [])`, 'unicode tokens');

// ---- D3: targeted lookups for projects and departments.
must(`  const namedGoalLookupQuery = commandNameTokens.length > 0`,
`  // Same targeted-lookup pattern, for the two collections verifier #62 named: a project or department the
  // founder names must be resolvable whatever the display window holds (V62-D3).
  const namedProjectLookupQuery = commandNameTokens.length > 0
    ? supabase.from('projects').select('id,company_id,title,status,deadline,blockers,risk_score')
        .or(commandNameTokens.map((t) => \`title.ilike.%\${t.replace(/[%,()]/g, ' ')}%\`).join(','))
        .limit(NAMED_LOOKUP_ROW_CAP)
    : Promise.resolve({ data: [] as any[] });
  const namedDepartmentLookupQuery = commandNameTokens.length > 0
    ? supabase.from('departments').select('id,name,company_id')
        .or(commandNameTokens.map((t) => \`name.ilike.%\${t.replace(/[%,()]/g, ' ')}%\`).join(','))
        .limit(NAMED_LOOKUP_ROW_CAP)
    : Promise.resolve({ data: [] as any[] });
  const namedGoalLookupQuery = commandNameTokens.length > 0`, 'project/department lookups');

must(`    namedGoalLookupQuery,`, `    namedGoalLookupQuery,\n    namedProjectLookupQuery,\n    namedDepartmentLookupQuery,`, 'lookup in promise.all');
must(`goals, namedGoalLookup, companyRelationships,`, `goals, namedGoalLookup, namedProjectLookup, namedDepartmentLookup, companyRelationships,`, 'destructure');

// The resolved rows join the pack the same way the other four do: merged at the head, and carried in
// namedTargets so no trim can remove them.
must(`  const namedTargets = {
    companies: (namedCompanyLookup.data || []),
    people: (namedPersonLookup.data || []),
    tasks: (namedTaskLookup.data || []),
    goals: (namedGoalLookup.data || []),
  };`,
`  const namedTargets = {
    companies: (namedCompanyLookup.data || []),
    people: (namedPersonLookup.data || []),
    tasks: (namedTaskLookup.data || []),
    goals: (namedGoalLookup.data || []),
    projects: (namedProjectLookup.data || []),
    departments: (namedDepartmentLookup.data || []),
  };`, 'named targets extended');

must(`    supabase.from('projects').select('id,company_id,title,status,deadline,blockers,risk_score', { count: 'exact' }).limit(20),`,
     `    supabase.from('projects').select('id,company_id,title,status,deadline,blockers,risk_score', { count: 'exact' }).limit(20),`, 'projects query untouched');

// ---- D6 + D7: Mongolian morphology.
must(`        const MN_NOT_A_COMMAND = /(?:сан|сэн|сон|сөн|лт|лга|лгэ|даг|дэг|дог|дөг|маар|мээр|х)(?:ыг|ийг|ын|ий|ийн|ын|аас|ээс|оос|өөс|д|т|тай|тэй|той|нь)?$/u;`,
`        // A token carrying a NOMINAL CASE SUFFIX is a noun, not an imperative: Устгалын (genitive of
        // устгал, "deletion"), Томилгооны (genitive of томилгоо, "appointment"), нэрийг (accusative of
        // нэр, "name"). A Mongolian imperative carries no case ending at all — архивла, сэргээ, устга,
        // өөрчил, нэм (verifier #62, V62-D6). Kept separate from the participle/verbal-noun test so each
        // rule stays readable and independently checkable.
        const MN_CASE_SUFFIX = /(?:ын|ийн|ны|ний|ыг|ийг|аас|ээс|оос|өөс|аар|ээр|оор|өөр|тай|тэй|той|луу|рүү|д|т)$/u;
        const MN_NOT_A_COMMAND = /(?:сан|сэн|сон|сөн|лт|лга|лгэ|даг|дэг|дог|дөг|маар|мээр|х)(?:ыг|ийг|ын|ий|ийн|ын|аас|ээс|оос|өөс|д|т|тай|тэй|той|нь)?$/u;`, 'case suffix rule');

must(`        const mnCandidates = MN_READ_SHAPE.test(commandText) ? [] : [...commandText.matchAll(MN_STEMS_GLOBAL)].map((m) => m[1]);`,
`        const mnCandidates = MN_READ_SHAPE.test(commandText) ? [] : [...commandText.matchAll(MN_STEMS_GLOBAL)].map((m) => m[1]);
        const mnIsCommandForm = (w: string) => !MN_NOT_A_COMMAND.test(w) && !MN_CASE_SUFFIX.test(w);`, 'command form helper');

must(`          ? (mnCandidates.find((w) => !MN_NOT_A_COMMAND.test(w) && mnFinalWindow.includes(w)) || null)`,
     `          ? (mnCandidates.find((w) => mnIsCommandForm(w) && mnFinalWindow.includes(w)) || null)`, 'use command form');

// V62-D7: өөрчил and нэм are the imperative surface forms of өөрчл- and нэмэ-.
for (const [from, to] of [['өөрчл\\S*', 'өөрч(?:л|ил)\\S*'], ['нэмэ\\S*', 'нэм(?:э)?\\S*']]) {
  const before = s;
  s = s.split(from).join(to);
  if (s === before) throw new Error('stem not widened: ' + from);
  n++;
}

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
