// Verifier #56 closure — V56-D1 (intent false negatives), V56-D2 (intent false positives),
// V56-D3 (command-name fallback mutates unrelated companies), V56-D4 (restore word inside a name),
// V56-D5 (punctuated names), V56-N1 (questions dropped by the receipt; ambiguity beside a model
// pendingAction offers no options; fuzzy status preference picks without asking).
// Byte discipline: CRLF in, LF patch, CRLF out; every anchor exactly once; detyper-safe code only.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }
function mustRange(startMarker, endMarker, replacement, label) {
  const a = s.indexOf(startMarker); if (a < 0) throw new Error(label + ': start not found');
  const b = s.indexOf(endMarker, a); if (b < 0) throw new Error(label + ': end not found');
  s = s.slice(0, a) + replacement + s.slice(b + endMarker.length); n++;
}

// ---- 1. Schema + prompt: the model classifies the REQUEST (structured, language-independent) ----
must(`  "claims": [{"type": "current_state"|"mutation_result"|"historical_event"|"existence"|"count"|"assignment"|"approval_state"|"verification_state"`,
     `  "requestIntent": {"kind": "mutation"|"confirmation"|"read"|"other", "action": string|null, "entityType": "company"|"person"|"project"|"task"|"goal"|"department"|"lead"|"document"|"approval"|"other"|null, "targetName": string|null},
  "claims": [{"type": "current_state"|"mutation_result"|"historical_event"|"existence"|"count"|"assignment"|"approval_state"|"verification_state"`, 'schema requestIntent');
must(`STRUCTURED CLAIMS ("claims") — how your answer is checked for truth.`,
`REQUEST INTENT ("requestIntent") — ALWAYS classify the founder's request BEFORE you answer, in any
language: "mutation" when they asked you to change data (archive, restore, rename, assign, create,
delete, approve, set a manager, end employment, …), "confirmation" when they answered a pending
question ("yes", "option 2", "go ahead"), "read" when they asked a question or for a list/summary/
status, "other" otherwise. "action" is the verb you understood, "entityType" the kind of record,
"targetName" the exact name they used. This classifies the REQUEST, never your answer, and is
independent of whether you could execute it: the backend uses it to decide whether a truthful
"No change was made" receipt is owed. Never omit it.

STRUCTURED CLAIMS ("claims") — how your answer is checked for truth.`, 'prompt requestIntent');

// ---- 2. Request intent v2 ----
mustRange(`        const MUTATION_INTENT_ALWAYS = /`, `        const executedVerifiedCount = claimExecutionEvidence.filter((e) => e.postconditionPassed).length;`,
`        // MutationIntent v2 (verifier #56 V56-D1/D2; governance/OPERATING_TRUTH_MODEL.md §3 rule 3).
        // Three request-side signals, none of them the response text:
        //   (1) the model's structured classification of the REQUEST (requestIntent), language-independent;
        //   (2) the model's action arrays (it decided to act);
        //   (3) a request lexicon: a mutation verb ANYWHERE in the command (polite prefixes, participles
        //       after need/want/should, Mongolian stems), with OBJECT GUARDS for the verbs that also open
        //       ordinary read requests, and a READ-SHAPE veto (a question, a wh-opener, "show/list/tell me").
        // A lexicon-only hit never outranks the model saying "read" unless the belt independently reads the
        // reply as a completion (defence-in-depth, decided below once the belt exists) — so a truthful read
        // answer is never rewritten on a verb alone, and a fabricated completion on a real mutation request
        // never ships on a phrasing the lexicon missed.
        const MUTATION_ARRAY_FIELDS = ['tasks','deleteTaskIds','archiveTaskIds','restoreTaskIds','deleteChannelIds','deleteApprovalIds','pendingDeleteTaskIds','pendingDeleteChannelIds','createCompanies','updateCompanies','archiveCompanyIds','restoreCompanyIds','archiveCompanyNames','restoreCompanyNames','permanentDeleteFixtureCompanyIds','createPeople','endEmploymentPersonIds','restoreEmploymentPersonIds','createProjects','createGoals','archiveGoalIds','restoreGoalIds','createFactoryWorkOrders','createDepartments','updateDepartments','createLeads','updateLeads','createDocuments','createProductLines','updateProductLines','deleteProductLineIds','createProductSpecs','updateProductSpecs','deleteProductSpecIds','createEngineeringDrawings','deleteEngineeringDrawingIds','createAiProviders','deleteAiProviderIds','deleteMcpConnectorIds','createProposals','updateProposals','deleteProposalIds','createCompanyRelationships','createPersonAssignments'];
        const commandText = String(command || '');
        const resultRecord = result as Record<string, unknown>;
        const modelIntentRaw = resultRecord.requestIntent;
        const modelIntent = modelIntentRaw && typeof modelIntentRaw === 'object' ? modelIntentRaw as Record<string, unknown> : null;
        const modelIntentKind: string | null = modelIntent && typeof modelIntent.kind === 'string' && ['mutation', 'confirmation', 'read', 'other'].includes(modelIntent.kind) ? modelIntent.kind : null;
        const modelIntentAction: string | null = modelIntent && typeof modelIntent.action === 'string' && modelIntent.action.trim().length > 0 ? modelIntent.action.trim().toLowerCase().slice(0, 40) : null;
        const modelMutationField: string | null = MUTATION_ARRAY_FIELDS.find((f) => Array.isArray(resultRecord[f]) && (resultRecord[f] as unknown[]).length > 0)
          || (typeof resultRecord.activateAiProviderId === 'string' ? 'activateAiProviderId' : null);
        // Unconditional mutation verbs (any position, any inflection) + Mongolian stems.
        const MUTATION_VERB_ALWAYS = /\\b(archiv(?:e|ed|ing)|un-?archiv(?:e|ed|ing)|restor(?:e|ed|ing)|reactivat(?:e|ed|ing)|delet(?:e|ed|ing)|remov(?:e|ed|ing)|renam(?:e|ed|ing)|retitl(?:e|ed|ing)|reassign(?:ed|ing)?|unassign(?:ed|ing)?|approv(?:e|ed|ing)|reject(?:ed|ing)?|declin(?:e|ed|ing)|activat(?:e|ed|ing)|deactivat(?:e|ed|ing)|invit(?:e|ed|ing)|revok(?:e|ed|ing)|enabl(?:e|ed|ing)|disabl(?:e|ed|ing)|promot(?:e|ed|ing)|demot(?:e|ed|ing)|hir(?:e|ed|ing)|fir(?:e|ed|ing)|terminat(?:e|ed|ing)|dismiss(?:ed|ing)?|onboard(?:ed|ing)?|merg(?:e|ed|ing)|split(?:ting)?|reopen(?:ed|ing)?|архивл\\S*|устга\\S*|сэргээ\\S*|өөрчл\\S*|томил\\S*|болго\\S*|үүсгэ\\S*|нэмэ?\\S*)\\b/iu;
        // Verbs that also open ordinary reads: intent only with a mutation-shaped OBJECT.
        const MUTATION_VERB_WITH_OBJECT = /\\b(?:(?:creat(?:e|ing)|make|add(?:ing)?) (?:a |an |the |new |another )?(?:compan(?:y|ies)|business unit|person|people|employee|manager|task|goal|project|department|lead|document|proposal|product|memory|note|approval|channel)\\b|make \\S+ (?:the |a )?manager\\b|add \\S+(?: \\S+)? (?:to|as|under) \\b|(?:set|updat(?:e|ing)|chang(?:e|ing)|edit(?:ing)?|fix(?:ing)?|modif(?:y|ying)) (?:the |a )?(?:manager|status|deadline|priority|owner|title|name|description|email|role|stage|value|company)\\b|(?:set|updat(?:e|ing)|chang(?:e|ing)) \\S+(?:'s|’s) \\w+ to\\b|(?:set|updat(?:e|ing)|chang(?:e|ing)|edit(?:ing)?|modif(?:y|ying)|fix(?:ing)?|clos(?:e|ing)|complet(?:e|ing)|finish(?:ing)?|cancel(?:ling|ing)?|reopen(?:ing)?|mark(?:ing)?) (?:the |a |that )?(?:task|project|goal|approval|department|lead|company|person|employee|document|proposal|\\S+-\\d+|[A-Z][\\w-]+)\\b|assign(?:ing)? (?:the |a )?(?:task|project|goal|\\S+-\\d+|[A-Z][\\w-]+)\\b|mov(?:e|ing) \\S+(?: \\S+)? (?:to|into|under)\\b|transfer(?:ring)? \\S+(?: \\S+)? (?:to|into|under)\\b|end(?:ing)? (?:the |\\S+(?:'s|’s) )?(?:employment|assignment|contract)\\b|mark \\S+.* as (?:done|complete|completed|closed|archived|active|inactive)\\b)/i;
        // A read-shaped request: a question, a wh-opener, or an explicit read verb; a trailing
        // "ok?/right?" on an imperative is not a read. Also the idioms that only LOOK like lifecycle verbs.
        const READ_SHAPE = /^\\s*(?:what|who|whom|whose|when|where|which|how|why|is|are|was|were|does|do|did|can you tell|could you tell|tell me|show|list|give me|summari[sz]e|describe|explain|report on|remind me|any news|status of)\\b|\\b(?:what(?:'|’)?s|who(?:'|’)?s|how many|how much)\\b|[:—–-]\\s*(?:what|who|which|how|is|are|any|describe|list)\\b|\\b(?:restore|archive|delete|remove|clear|reset) (?:my |your |our |the )?(?:memory|context|conversation|history|chat|doubt|question|suggestion)s?\\b/i;
        const isQuestion = /\\?/.test(commandText) && !/\\b(?:ok|okay|right|alright|please|yes)\\s*\\?\\s*$/i.test(commandText);
        const readShaped = isQuestion || READ_SHAPE.test(commandText);
        // A bare confirmation or a choice is a request to execute what was pending.
        const CONFIRMATION_COMMAND = /^\\s*(?:yes|yep|yeah|y|ok|okay|sure|confirm(?:ed)?|correct|affirmative|go ahead|do it|proceed|please do|go for it|approved)\\b[\\s,.!—–-]*(?:(?:go ahead|do it|proceed|please|now|thanks|then)[\\s,.!—–-]*)*$|^\\s*(?:option|choice|number|the)?\\s*(?:\\d+|one|two|three|four|five|[a-e]|first|second|third|fourth|last)(?:\\s+(?:one|option|choice))?\\s*[.!]?\\s*$/i;
        const confirmationShaped = CONFIRMATION_COMMAND.test(commandText);
        const lexiconAlways = (commandText.match(MUTATION_VERB_ALWAYS) || [])[1] || null;
        const lexiconObject = MUTATION_VERB_WITH_OBJECT.test(commandText) ? ((commandText.match(/\\b(creat|make|add|set|updat|chang|edit|fix|modif|clos|complet|finish|cancel|reopen|mark|assign|mov|transfer|end)\\w*/i) || [])[0] || 'update') : null;
        const lexiconVerb: string | null = (lexiconAlways || lexiconObject) ? String(lexiconAlways || lexiconObject).toLowerCase() : null;
        const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read');
        // Primary intent, in authority order. The lexicon-only case is decided after the belt exists.
        const requestedIntentPrimary: MutationIntent | null = modelMutationField
          ? { verb: modelIntentAction || lexiconVerb, field: modelMutationField }
          : (modelIntentKind === 'mutation' || modelIntentKind === 'confirmation')
            ? { verb: modelIntentAction || lexiconVerb || (modelIntentKind === 'confirmation' ? 'confirm' : null), field: null }
            : (confirmationShaped && modelIntentKind !== 'read')
              ? { verb: 'confirm', field: null }
              : (lexiconVerb !== null && !lexiconReadVetoed)
                ? { verb: lexiconVerb, field: null }
                : null;
        const executedVerifiedCount = claimExecutionEvidence.filter((e) => e.postconditionPassed).length;`, 'intent v2');

// The final intent is decided once the belt exists: a lexicon hit the model called "read" (or a
// question-shaped command) counts only when the reply independently reads as a completion.
must(`        const legacyProseFallback = !hasSupportedMutationClaim`,
`        // Final request intent: primary, else the lexicon+belt agreement (defence-in-depth — the belt is
        // never the sole reason: the request carried a mutation verb AND the reply claims a completion
        // AND nothing executed). A plain read answer on a read-shaped request stays untouched.
        const requestedIntent: MutationIntent | null = requestedIntentPrimary
          ?? ((lexiconVerb !== null && executedVerifiedCount === 0 && readsAsCompletion(String(result.summary || ''))) ? { verb: lexiconVerb, field: null } : null);
        const legacyProseFallback = !hasSupportedMutationClaim`, 'final intent');

// ---- 3. Receipt keeps the model's questions / proposed actions ----
must("          result.summary = [receiptPrefix, `No change was made — ${reason}.`, pendingQuestion].filter(Boolean).join(' ');",
     "          const receiptQuestions = (Array.isArray(envelopeQuestions) ? envelopeQuestions : []).map((q) => String(q).trim()).filter((q) => q.length > 0 && q !== pendingQuestion);\n          result.summary = [receiptPrefix, `No change was made — ${reason}.`, ...receiptQuestions, pendingQuestion].filter(Boolean).join(' ');", 'receipt questions');

// ---- 4. Resolver v2 ----
mustRange(`        const commandMentionsCompany = /`, `          RESTORE_VERB_PATTERN.test(String(command || '')) ? lifecycleCommandName(RESTORE_VERB_PATTERN) : null);`,
`        // Verifier #56 V56-D3/D4/D5. The command-derived fallback runs ONLY when the command is about a
        // company: the model resolved no other mutation target (a task/person/goal request never becomes a
        // company archive), the model emitted no company lifecycle field of the other direction, and either
        // the command names a company noun or the model classified the request's entity as a company. The
        // direction is decided by the FIRST lifecycle verb in the command (a restore word inside a company
        // name never flips an archive). Command-derived names resolve by EXACT normalised name only; model-
        // emitted names may also match as a whole-phrase substring, and several hits always ask.
        const commandMentionsCompany = /\\b(compan(?:y|ies)|business unit|subsidiar(?:y|ies)|holding|entity|org(?:anization)?s?|brand|компани)\\b/iu.test(String(command || ''));
        const modelRequestIntentEntity: string | null = (() => { const ri = (result as Record<string, unknown>).requestIntent; return ri && typeof ri === 'object' && typeof (ri as Record<string, unknown>).entityType === 'string' ? String((ri as Record<string, unknown>).entityType) : null; })();
        const OTHER_MUTATION_FIELDS = ['tasks','deleteTaskIds','archiveTaskIds','restoreTaskIds','deleteChannelIds','deleteApprovalIds','pendingDeleteTaskIds','pendingDeleteChannelIds','createCompanies','updateCompanies','permanentDeleteFixtureCompanyIds','createPeople','endEmploymentPersonIds','restoreEmploymentPersonIds','createProjects','createGoals','archiveGoalIds','restoreGoalIds','createFactoryWorkOrders','createDepartments','updateDepartments','createLeads','updateLeads','createDocuments','createProductLines','updateProductLines','deleteProductLineIds','createProductSpecs','updateProductSpecs','deleteProductSpecIds','createEngineeringDrawings','deleteEngineeringDrawingIds','createAiProviders','deleteAiProviderIds','deleteMcpConnectorIds','createProposals','updateProposals','deleteProposalIds','createCompanyRelationships','createPersonAssignments'];
        const modelResolvedOtherTarget = OTHER_MUTATION_FIELDS.some((f) => Array.isArray((result as Record<string, unknown>)[f]) && ((result as Record<string, unknown>)[f] as unknown[]).length > 0);
        const modelEmittedArchive = requestedArchiveIds.length > 0 || (Array.isArray(result.archiveCompanyNames) && result.archiveCompanyNames.length > 0);
        const modelEmittedRestore = requestedRestoreIds.length > 0 || (Array.isArray(result.restoreCompanyNames) && result.restoreCompanyNames.length > 0);
        const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && (commandMentionsCompany || modelRequestIntentEntity === 'company');
        const normaliseName = (v: unknown): string => String(v || '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
        const resolveCompanyLifecycleTargets = async (action: string, rawIds: unknown, rawNames: unknown, commandName: string | null): Promise<string[]> => {
          const ids: string[] = [...new Set((Array.isArray(rawIds) ? rawIds : []).filter((x) => typeof x === 'string' && COMPANY_UUID_RE.test(x)) as string[])];
          const names: string[] = [...new Set(((Array.isArray(rawNames) ? rawNames : []).filter((x) => typeof x === 'string' && x.trim().length > 0) as string[]).map((x) => x.trim().slice(0, 120)))];
          const resolved: Set<string> = new Set();
          if (ids.length > 0) {
            const { data } = await supabase.from('companies').select('id,name,status').in('id', ids);
            for (const c of (data || []) as CompanyLookupRow[]) { resolved.add(String(c.id)); companyNameById.set(String(c.id), String(c.name)); }
            for (const id of ids) if (!resolved.has(id)) lifecycleUnresolvedLines.push(\`\${companyNameById.get(id) || 'That company'}: could not be found (searched the active and archived companies you can access) — nothing was \${action === 'restore' ? 'restored' : 'archived'}.\`);
          }
          const fromCommand: string[] = names.length === 0 && resolved.size === 0 && commandName ? [commandName] : [];
          for (const name of [...names, ...fromCommand]) {
            const isCommandGuess = fromCommand.includes(name);
            const wantStatus = action === 'restore' ? 'archived' : 'active';
            const target = normaliseName(name);
            if (target.length < 2) continue;
            // Candidate rows by the longest word; exactness is decided on the normalised name in code
            // (punctuation, case and spacing never decide — V56-D5).
            const anchorWord = target.split(' ').sort((a, b) => b.length - a.length)[0];
            const { data: candidates } = await supabase.from('companies').select('id,name,status').ilike('name', \`%\${anchorWord}%\`).limit(50);
            const rows = (candidates || []) as CompanyLookupRow[];
            const exact = rows.filter((r) => normaliseName(r.name) === target);
            let pick: CompanyLookupRow[] = exact;
            let fuzzy = false;
            if (pick.length === 0 && !isCommandGuess) { pick = rows.filter((r) => normaliseName(r.name).includes(target)); fuzzy = true; }
            if (pick.length > 1 && !fuzzy) { const preferred = pick.filter((r) => r.status === wantStatus); if (preferred.length === 1) pick = preferred; }
            if (pick.length === 1) { resolved.add(pick[0].id); companyNameById.set(pick[0].id, pick[0].name); }
            else if (pick.length === 0) { if (!isCommandGuess || commandMentionsCompany) lifecycleUnresolvedLines.push(\`\${name}: no company by that name (searched the active and archived companies you can access) — nothing was \${action === 'restore' ? 'restored' : 'archived'}.\`); }
            else { lifecycleDisambiguation.push({ action, name, options: pick.map((r) => ({ id: r.id, name: r.name, status: r.status })) }); for (const r of pick) companyNameById.set(r.id, r.name); }
          }
          return [...resolved];
        };
        const lifecycleCommandName = (pattern: RegExp): string | null => {
          const text = String(command || '');
          const m = text.match(pattern);
          if (!m) return null;
          const after = text.slice((m.index ?? 0) + m[0].length)
            .replace(/^\\s*(?:the|this|that|our|my)\\s+/i, '')
            .replace(/^\\s*(?:company|business unit|entity|organization|org)\\s+/i, '')
            .trim();
          const name = after.split(/[.,;!?\\n]|\\s+(?:and|then|please|now|again|from|to|so|because)\\s+/i)[0]
            .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
            .replace(/\\s+(?:company|business unit|entity)$/i, '')
            .replace(/\\s+(?:now|please|again|immediately|asap|today|right away)$/i, '')
            .trim();
          return name.length >= 2 && name.length <= 80 && !/^(it|them|that|this|those|these|him|her)$/i.test(name) ? name : null;
        };
        const lifecycleVerbAt = (pattern: RegExp): number => { const m = String(command || '').match(pattern); return m && typeof m.index === 'number' ? m.index : -1; };
        const archiveVerbAt = lifecycleVerbAt(ARCHIVE_VERB_PATTERN);
        const restoreVerbAt = lifecycleVerbAt(RESTORE_VERB_PATTERN);
        const headLifecycleAction: string | null = archiveVerbAt < 0 && restoreVerbAt < 0 ? null : restoreVerbAt < 0 ? 'archive' : archiveVerbAt < 0 ? 'restore' : (archiveVerbAt <= restoreVerbAt ? 'archive' : 'restore');
        const archiveCompanyIds = await resolveCompanyLifecycleTargets('archive', requestedArchiveIds, result.archiveCompanyNames,
          commandFallbackAllowed && headLifecycleAction === 'archive' ? lifecycleCommandName(ARCHIVE_VERB_PATTERN) : null);
        const restoreCompanyIds = await resolveCompanyLifecycleTargets('restore', requestedRestoreIds, result.restoreCompanyNames,
          commandFallbackAllowed && headLifecycleAction === 'restore' ? lifecycleCommandName(RESTORE_VERB_PATTERN) : null);`, 'resolver v2');

// ---- 5. Disambiguation always offered, even beside a model-armed pendingAction ----
must(`        if (lifecycleDisambiguation.length > 0 && !result.pendingAction) {`,
     `        if (lifecycleDisambiguation.length > 0) {`, 'disambiguation always');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out);
console.log('applied', n, 'edits');
