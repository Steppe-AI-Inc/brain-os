// #56 closure, pass 3 — measured against verifier #56's own generators:
//  * Cyrillic stems cannot use \b (ASCII word boundary): Unicode letter lookarounds instead;
//  * base/gerund verb forms only in the unconditional lexicon; passive requests ("X should be archived",
//    "I need X archived") are a separate shape, so "a report of archived companies" is not intent;
//  * the proper-noun object guard is CASE-SENSITIVE (under /i, [A-Z] matched "me", "out", "a number");
//  * the belt never decides intent — a read-vetoed lexicon hit is null, full stop;
//  * the command-name fallback: imperative lifecycle command only (no question, no negation lead, no other
//    model target, no model lifecycle field, model intent absent or "mutation"); EXACT normalised name
//    executes; fuzzy hits only ever ASK; the full remainder and the comma-head are both tried.
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

mustRange(`        // Unconditional mutation verbs (any position, any inflection) + Mongolian stems.`, `        const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read');`,
String.raw`        // Unconditional mutation verbs: base and gerund forms anywhere in the command (a participle alone
        // is an adjective — "a report of archived companies"); Mongolian stems with Unicode-letter
        // lookarounds (\b is ASCII-only and never fires next to Cyrillic).
        const MUTATION_VERB_ALWAYS = /\b(archiv(?:e|ing)|un-?archiv(?:e|ing)|restor(?:e|ing)|reactivat(?:e|ing)|delet(?:e|ing)|remov(?:e|ing)|renam(?:e|ing)|retitl(?:e|ing)|reassign(?:ing)?|unassign(?:ing)?|approv(?:e|ing)|reject(?:ing)?|declin(?:e|ing)|activat(?:e|ing)|deactivat(?:e|ing)|invit(?:e|ing)|revok(?:e|ing)|enabl(?:e|ing)|disabl(?:e|ing)|promot(?:e|ing)|demot(?:e|ing)|hir(?:e|ing)|fir(?:e|ing)|terminat(?:e|ing)|dismiss(?:ing)?|onboard(?:ing)?|merg(?:e|ing)|split(?:ting)?|reopen(?:ing)?)\b|(?<!\p{L})(архивл\S*|устга\S*|сэргээ\S*|өөрчл\S*|томил\S*|болго\S*|үүсгэ\S*|нэмэ\S*|соль\S*|хас\S*|оноо\S*)(?!\p{L})/iu;
        // A passive / desiderative request: "ACME should be archived", "I need ACME archived", "Make sure QA-1 is done".
        const MUTATION_PASSIVE_REQUEST = /\b(?:should|must|needs? to|has to|have to|is to|are to|ought to|got to|gotta) (?:be |get )?(?:archived|unarchived|restored|reactivated|deleted|removed|renamed|retitled|reassigned|unassigned|approved|rejected|declined|activated|deactivated|invited|revoked|enabled|disabled|promoted|demoted|hired|fired|terminated|dismissed|onboarded|merged|split|reopened|closed|completed|cancelled|canceled|finished|assigned|updated|changed|moved|transferred|marked|set)\b|\b(?:i (?:need|want)|we (?:need|want)|make sure|ensure|see that) (?:that )?\S+(?: \S+){0,4}? (?:is |are |gets? |to be )?(?:archived|unarchived|restored|reactivated|deleted|removed|renamed|reassigned|approved|rejected|activated|deactivated|invited|revoked|enabled|disabled|promoted|hired|fired|terminated|onboarded|merged|reopened|closed|completed|cancelled|canceled|finished|assigned|updated|changed|moved|transferred|done)\b/i;
        // Verbs that also open ordinary reads: intent only with a mutation-shaped OBJECT (entity noun,
        // a field, a relationship phrase). Case-insensitive; proper nouns are checked separately below.
        const MUTATION_VERB_WITH_OBJECT = /\b(?:(?:creat(?:e|ing)|make|add(?:ing)?|register(?:ing)?) (?:a |an |the |new |another )?(?:compan(?:y|ies)|business unit|person|people|employee|manager|task|goal|project|department|lead|document|proposal|product|memory|note|approval|channel|team|role)\b|make \S+(?: \S+)? (?:the |a )?(?:manager|owner|lead|admin)\b|add \S+(?: \S+)? (?:to|as|under) \b|(?:set|updat(?:e|ing)|chang(?:e|ing)|edit(?:ing)?|fix(?:ing)?|modif(?:y|ying)|correct(?:ing)?) (?:the |a |its |his |her |their )?(?:manager|status|deadline|priority|owner|title|name|description|email|role|stage|value|company|budget|price|start date|end date|due date)\b|(?:set|updat(?:e|ing)|chang(?:e|ing)) \S+(?:'s|’s) \w+(?: \w+)? to\b|(?:clos(?:e|ing)|complet(?:e|ing)|finish(?:ing)?|cancel(?:ling|ing)?|reopen(?:ing)?|mark(?:ing)?|edit(?:ing)?|modif(?:y|ying)|fix(?:ing)?) (?:the |a |that |this )?(?:task|project|goal|approval|department|lead|company|person|employee|document|proposal|\S+-\d+)\b|assign(?:ing)? (?:the |a |that |this )?(?:task|project|goal|lead|ticket|\S+-\d+)\b|mov(?:e|ing) \S+(?: \S+)? (?:to|into|under)\b|transfer(?:ring)? \S+(?: \S+)? (?:to|into|under)\b|end(?:ing)? (?:the |\S+(?:'s|’s) )?(?:employment|assignment|contract)\b|mark \S+(?: \S+){0,3} as (?:done|complete|completed|closed|archived|active|inactive|resolved)\b)/i;
        // Proper-noun objects, CASE-SENSITIVE: "create ACME Robotics", "assign QA-1 to Bob", "Set Bob’s title".
        const MUTATION_VERB_PROPER_OBJECT = /(?:^|[\s,.;:—–-])(?:[Cc]reate|[Cc]reating|[Mm]ake|[Aa]dd|[Aa]dding|[Rr]egister|[Ss]et|[Ss]etting|[Uu]pdate|[Uu]pdating|[Cc]hange|[Cc]hanging|[Ee]dit|[Ee]diting|[Ff]ix|[Mm]odify|[Cc]lose|[Cc]omplete|[Ff]inish|[Cc]ancel|[Rr]eopen|[Mm]ark|[Aa]ssign|[Aa]ssigning|[Mm]ove|[Tt]ransfer|[Hh]ire|[Oo]nboard)\s+(?:the\s+|a\s+|an\s+|new\s+)?(?:[A-Z][A-Za-z0-9_-]+|[A-Z]{2,}|\S+-\d+|"[^"]+"|“[^”]+”|'[^']+')/;
        // A read-shaped request: a question, a wh-opener, or an explicit read verb; a trailing "ok?/right?"
        // on an imperative is not a read. Plus the idioms that only LOOK like lifecycle verbs.
        const READ_SHAPE = /^\s*(?:what|who|whom|whose|when|where|which|how|why|is|are|was|were|does|do|did|can you tell|could you tell|tell me|show|list|give me|summari[sz]e|describe|explain|report on|remind me|any news|status of|update me|brief me|walk me)\b|\b(?:what(?:'|’)?s|who(?:'|’)?s|how many|how much)\b|[:—–-]\s*(?:what|who|which|how|is|are|any|describe|list)\b|\b(?:restore|archive|delete|remove|clear|reset) (?:my |your |our |the )?(?:memory|context|conversation|history|chat|doubt|question|suggestion)s?\b|\b(?:make|create|build|prepare|draft) (?:me )?(?:a |an |the )?(?:list|report|summary|overview|table|chart|comparison|breakdown)\b/i;
        const isQuestion = /\?/.test(commandText) && !/\b(?:ok|okay|right|alright|please|yes)\s*\?\s*$/i.test(commandText);
        const readShaped = isQuestion || READ_SHAPE.test(commandText);
        // A bare confirmation or a choice is a request to execute what was pending.
        const CONFIRMATION_COMMAND = /^\s*(?:yes|yep|yeah|y|ok|okay|sure|confirm(?:ed)?|correct|affirmative|go ahead|do it|proceed|please do|go for it|approved)\b[\s,.!—–-]*(?:(?:go ahead|do it|proceed|please|now|thanks|then)[\s,.!—–-]*)*$|^\s*(?:option|choice|number|the)?\s*(?:\d+|one|two|three|four|five|[a-e]|first|second|third|fourth|last)(?:\s+(?:one|option|choice))?\s*[.!]?\s*$/i;
        const confirmationShaped = CONFIRMATION_COMMAND.test(commandText);
        const lexiconAlways = (commandText.match(MUTATION_VERB_ALWAYS) || []).slice(1).find((g) => typeof g === 'string' && g.length > 0) || null;
        const lexiconPassive = MUTATION_PASSIVE_REQUEST.test(commandText) ? ((commandText.match(/\b(archived|unarchived|restored|reactivated|deleted|removed|renamed|retitled|reassigned|unassigned|approved|rejected|declined|activated|deactivated|invited|revoked|enabled|disabled|promoted|demoted|hired|fired|terminated|dismissed|onboarded|merged|split|reopened|closed|completed|cancelled|canceled|finished|assigned|updated|changed|moved|transferred|marked|set|done)\b/i) || [])[1] || 'update') : null;
        const lexiconObject = (MUTATION_VERB_WITH_OBJECT.test(commandText) || MUTATION_VERB_PROPER_OBJECT.test(commandText)) ? ((commandText.match(/\b(creat|make|add|register|set|updat|chang|edit|fix|modif|correct|clos|complet|finish|cancel|reopen|mark|assign|mov|transfer|end|hire|onboard)\w*/i) || [])[0] || 'update') : null;
        const lexiconVerb: string | null = (lexiconAlways || lexiconPassive || lexiconObject) ? String(lexiconAlways || lexiconPassive || lexiconObject).toLowerCase() : null;
        const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read');`, 'lexicon v3');

must(`        // Final request intent: primary, else the lexicon+belt agreement (defence-in-depth — the belt is
        // never the sole reason: the request carried a mutation verb AND the reply claims a completion
        // AND nothing executed). A plain read answer on a read-shaped request stays untouched.
        const requestedIntent: MutationIntent | null = requestedIntentPrimary
          ?? ((lexiconVerb !== null && executedVerifiedCount === 0 && readsAsCompletion(String(result.summary || ''))) ? { verb: lexiconVerb, field: null } : null);`,
`        // Final request intent: the request-side derivation alone. The belt (a property of the REPLY) never
        // decides whether a request carried intent — a read-vetoed lexicon hit is null, full stop
        // (verifier #56 V56-D2: the defence-in-depth tier rewrote truthful dated history on read requests).
        const requestedIntent: MutationIntent | null = requestedIntentPrimary;
        void lexiconReadVetoed;`, 'final intent v3');

// Resolver: imperative-lifecycle gate; exact executes, fuzzy asks; full remainder + comma head.
must(`        const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && (commandMentionsCompany || modelRequestIntentIsCompanyMutation) && (!modelRequestIntent || modelRequestIntent.kind === 'mutation');`,
String.raw`        // The raw command is a lifecycle target source only for an IMPERATIVE lifecycle command: not a
        // question, not a negated / hypothetical lead, no other entity type resolved by the model this
        // turn, no model lifecycle field, and the model's own classification (when present) is a mutation.
        const commandLower = String(command || '').toLowerCase();
        const commandIsQuestion = /\?/.test(commandLower) && !/\b(?:ok|okay|right|alright|please|yes)\s*\?\s*$/.test(commandLower);
        const commandNegatedLead = /^\s*(?:do not|don['’]t|never|please do not|please don['’]t|stop|without|instead of|rather than|not|no)\b/.test(commandLower) || /\b(?:do not|don['’]t|never|instead of|rather than|not going to|no need to|should not|shouldn['’]t|must not|mustn['’]t|won['’]t|will not|cannot|can['’]t)\s+(?:\w+\s+){0,3}(?:archive|restore|delete|remove|unarchive|reactivate)/.test(commandLower);
        const commandReadLead = /^\s*(?:what|who|whom|whose|when|where|which|how|why|is|are|was|were|does|do|did|can you tell|could you tell|tell me|show|list|give me|summari[sz]e|describe|explain|report on|remind me|any news|status of|update me|if|when|before|after|should i|shall i|could we|can we|would it|what if)\b/.test(commandLower);
        const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLead && (!modelRequestIntent || modelRequestIntent.kind === 'mutation');`, 'fallback gate v3');

must(`          const fromCommand: string[] = names.length === 0 && resolved.size === 0 && commandName ? [commandName] : [];
          for (const name of [...names, ...fromCommand]) {
            const isCommandGuess = fromCommand.includes(name);
            const wantStatus = action === 'restore' ? 'archived' : 'active';
            const target = normaliseName(name);
            if (target.length < 2) continue;`,
`          // A command guess is tried as the FULL remainder first and then as the head before the first
          // comma/period — "restore Acme, Inc." is one name, "restore Acme, then Beta" is two clauses.
          const commandCandidates: string[] = names.length === 0 && resolved.size === 0 && commandName
            ? [...new Set([commandName, commandName.split(/[,.;]/)[0].trim()].filter((x) => x.length >= 2))] : [];
          let commandGuessDone = false;
          for (const name of [...names, ...commandCandidates]) {
            const isCommandGuess = commandCandidates.includes(name);
            if (isCommandGuess && commandGuessDone) continue;
            const wantStatus = action === 'restore' ? 'archived' : 'active';
            const target = normaliseName(name);
            if (target.length < 2) continue;`, 'candidates');

must(`            const exact = rows.filter((r) => normaliseName(r.name) === target);
            let pick: CompanyLookupRow[] = exact;
            let fuzzy = false;
            if (pick.length === 0 && !isCommandGuess) { pick = rows.filter((r) => normaliseName(r.name).includes(target)); fuzzy = true; }
            if (pick.length > 1 && !fuzzy) { const preferred = pick.filter((r) => r.status === wantStatus); if (preferred.length === 1) pick = preferred; }
            if (pick.length === 1) { resolved.add(pick[0].id); companyNameById.set(pick[0].id, pick[0].name); }
            else if (pick.length === 0) { if (!isCommandGuess || commandMentionsCompany) lifecycleUnresolvedLines.push(\`\${name}: no company by that name (searched the active and archived companies you can access) — nothing was \${action === 'restore' ? 'restored' : 'archived'}.\`); }
            else { lifecycleDisambiguation.push({ action, name, options: pick.map((r) => ({ id: r.id, name: r.name, status: r.status })) }); for (const r of pick) companyNameById.set(r.id, r.name); }
          }`,
`            const exact = rows.filter((r) => normaliseName(r.name) === target);
            let pick: CompanyLookupRow[] = exact;
            let fuzzy = false;
            if (pick.length === 0) { pick = rows.filter((r) => normaliseName(r.name).includes(target)); fuzzy = true; }
            if (pick.length > 1 && !fuzzy) { const preferred = pick.filter((r) => r.status === wantStatus); if (preferred.length === 1) pick = preferred; }
            // A fuzzy hit from the raw COMMAND never executes — it asks (verifier #56 V56-D3: "delete Alpha"
            // archived "Alpha Holdings"). A fuzzy hit from a MODEL-emitted name executes only when unique.
            if (isCommandGuess && fuzzy && pick.length > 0) { commandGuessDone = true; lifecycleDisambiguation.push({ action, name, options: pick.map((r) => ({ id: r.id, name: r.name, status: r.status })) }); for (const r of pick) companyNameById.set(r.id, r.name); continue; }
            if (pick.length === 1) { resolved.add(pick[0].id); companyNameById.set(pick[0].id, pick[0].name); if (isCommandGuess) commandGuessDone = true; }
            else if (pick.length === 0) { if (!isCommandGuess) lifecycleUnresolvedLines.push(\`\${name}: no company by that name (searched the active and archived companies you can access) — nothing was \${action === 'restore' ? 'restored' : 'archived'}.\`); }
            else { commandGuessDone = commandGuessDone || isCommandGuess; lifecycleDisambiguation.push({ action, name, options: pick.map((r) => ({ id: r.id, name: r.name, status: r.status })) }); for (const r of pick) companyNameById.set(r.id, r.name); }
          }
          // A command guess that matched nothing at all still leaves a line when the command named a company.
          if (commandCandidates.length > 0 && !commandGuessDone && commandMentionsCompany) lifecycleUnresolvedLines.push(\`\${commandCandidates[0]}: no company by that name (searched the active and archived companies you can access) — nothing was \${action === 'restore' ? 'restored' : 'archived'}.\`);`, 'pick v3');

// lifecycleCommandName: keep the full remainder (no comma/period split) — the resolver splits itself.
must(`          const name = after.split(/[.,;!?\\n]|\\s+(?:and|then|please|now|again|from|to|so|because)\\s+/i)[0]`,
     `          const name = after.split(/[!?\\n]|\\s+(?:and|then|please|now|again|from|to|so|because)\\s+/i)[0].replace(/[.,;]+$/, '')`, 'name split');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
