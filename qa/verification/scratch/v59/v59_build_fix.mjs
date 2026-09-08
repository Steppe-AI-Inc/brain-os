#!/usr/bin/env node
// VERIFIER #59 — PREPARED hardening patch (never applied to the candidate; written to scratch/v59/v59_fix.ts).
// Closes V59-D1..D4 in the model-emits-nothing tier with surgical string replacements on unique anchors.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const raw = readFileSync(SRC, 'utf8');
if (createHash('sha256').update(raw).digest('hex') !== '715246f3be9710b74193529ce9c07d44a6f3ad3739f132b6216ac04e8f519aa9') throw new Error('unexpected candidate bytes');
const NL = '\r\n';
let s = raw;
const one = (a, b, label) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`anchor not unique (${n}) for ${label}`); s = s.replace(a, () => b); };

// D1 — the request lexicon learns the restore idiom the executor already knows ("bring back X", "bring X back").
// lexiconAlways reads the first non-empty CAPTURE GROUP, so the new alternatives must capture (my first draft did not —
// caught by measuring the patch, not by reading it).
one(`|reopen(?:ing)?)\\b|(?<!\\p{L})(архивл\\S*`, `|reopen(?:ing)?)\\b|\\b(bring(?:ing)?\\s+(?:(?:it|them|that|this|the\\s+\\S+|\\S+)\\s+)?back)\\b|\\b(get\\s+(?:the\\s+|that\\s+|this\\s+)?\\S+(?:\\s+\\S+){0,3}?\\s+(?:archived|unarchived|restored|reactivated|deleted|removed|renamed|reassigned|unassigned|approved|rejected|declined|activated|deactivated|invited|revoked|enabled|disabled|promoted|demoted|hired|fired|terminated|dismissed|onboarded|merged|reopened|closed|completed|cancelled|canceled|finished|assigned|updated|changed|moved|transferred|marked|ended|added|created|edited|fixed|modified|done))\\b|(?<!\\p{L})(архивл\\S*`, 'D1 lexicon bring back + causative get');

// D3 — the three Cyrillic alternatives in IMPERATIVE_HEAD_RE are unreachable (\\b is ASCII-only under /u and Mongolian is
// verb-final); a dead alternative is the vacuous-guard class (ledger #101/#105). Removed rather than "fixed": Mongolian
// lifecycle commands execute through the model's requestIntent (verified), never through the English command fallback.
one(`|bring(?:ing)? back|end(?:ing)?|архивла|сэргээ|устга)\\b/u;`, `|bring(?:ing)? back|end(?:ing)?)\\b/u;`, 'D3 dead Cyrillic alternatives');
// D2 (executor frames): "when you get a chance, archive X" / "be a dear and archive X" / "don't forget to archive X" are
// requests to act now, not conditions — admitted as frames so the imperative head test sees the verb.
one(`|hey brain|brain|quick one|time to|make sure to|be sure to|remember to|let['’]?s|`, `|hey brain|brain|quick one|time to|it['’]?s time to|make sure to|be sure to|remember to|don['’]?t forget to|be a dear and|when(?:ever)? you (?:get|have) (?:a chance|a moment|a minute|a sec|time)|if you (?:can|could|would|get a chance)|i(?:['’]d| would) appreciate (?:it )?if you(?: could| would)?|let['’]?s|`, 'D2 executor frames');

// D2 — a read-lead veto must not kill a command whose imperative position was just established: "do me a favour and
// archive Alpha" (head after an allowed frame) and "list the tasks, then archive Alpha" (imperative last clause after a
// non-conditional lead) were admitted by IMPERATIVE_HEAD_RE and then vetoed by commandReadLead, so both allowances were
// dead. The veto now applies to the clause the imperative test looked at.
one(`        const commandImperativePosition = IMPERATIVE_HEAD_RE.test(commandLower) || (commandLeadClause.length > 0 && !commandConditionalLead && IMPERATIVE_HEAD_RE.test(commandLastClause));${NL}        const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLead && `,
  `        const commandImperativePosition = IMPERATIVE_HEAD_RE.test(commandLower) || (commandLeadClause.length > 0 && !commandConditionalLead && IMPERATIVE_HEAD_RE.test(commandLastClause));${NL}        // Verifier #59 V59-D2: the read-lead veto is decided on the clause that carries the imperative, never on a lead${NL}        // clause the imperative test already discounted ("list the tasks, then archive Alpha") or on a frame word${NL}        // IMPERATIVE_HEAD_RE admits ("do me a favour and archive Alpha").${NL}        const commandReadLeadEffective = commandReadLead && !IMPERATIVE_HEAD_RE.test(commandLower) && !(commandLeadClause.length > 0 && !commandConditionalLead && IMPERATIVE_HEAD_RE.test(commandLastClause));${NL}        const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLeadEffective && `, 'D2 executor read-lead veto');
// D2 (lexicon side) — READ_SHAPE vetoes at the head of the WHOLE command; a mutation verb heading the LAST clause after a
// non-conditional lead ("list the tasks, then archive ACME"; "when you get a chance, archive ACME" — conditional lead, still a
// request for a receipt) or after an admitted frame ("do me a favour and archive ACME") is a request, so the veto is decided
// on the clause that carries the verb.
one(`        const readShaped = isQuestion || READ_SHAPE.test(commandText);`,
  `        const REQUEST_FRAME_PREFIX = /^\\s*(?:(?:ok|okay|please|pls|plz|kindly|just|now|also|then|and|so|right|well|next|first|finally|again|yes|sure|hey brain|brain|quick one|go ahead(?: and)?|do me a favou?r(?: and)?|be a dear and|don['’]?t forget to|remember to|make sure to|be sure to|time to|it['’]?s time to|its time to|when(?:ever)? you (?:get|have) (?:a chance|a moment|a minute|a sec|time)|if you (?:can|could|would|get a chance)|before (?:eod|end of day|you go|lunch|tomorrow)|i(?:['’]d| would) appreciate (?:it )?if you(?: could| would)?|could you(?: please)?|can you(?: please)?|would you(?: please| mind)?|will you|can we|could we|shall we|let['’]?s|we need to|i need you to|i want you to|i['’]?d like you to|you should|you need to|need you to|you can)[\\s,:—–-]+)+/i;${NL}        const commandForRead = commandText.replace(REQUEST_FRAME_PREFIX, '');${NL}        const commandClausesForRead = commandText.split(/[,;]\\s+|\\s[—–-]\\s+|\\s+(?:so|then|and then|and)\\s+/i);${NL}        const lastClauseForRead = (commandClausesForRead[commandClausesForRead.length - 1] || commandText).replace(REQUEST_FRAME_PREFIX, '');${NL}        const lastClauseIsMutation = commandClausesForRead.length > 1 && /^\\s*(?:archiv|un-?archiv|restor|reactivat|delet|remov|renam|retitl|reassign|unassign|approv|reject|declin|activat|deactivat|invit|revok|enabl|disabl|promot|demot|hir|fir|terminat|dismiss|onboard|merg|split|reopen|bring)/i.test(lastClauseForRead) && !/\\?/.test(lastClauseForRead);${NL}        const readShaped = isQuestion || (READ_SHAPE.test(commandForRead) && !lastClauseIsMutation);`, 'D2 lexicon read veto');

// D2d — READ_SHAPE's bare "do" alternative (meant for "do you…?") also vetoes "do not archive Alpha" and "do me a favour and
// archive Alpha"; a negated request is a request (the receipt owes "you asked me not to"), not a read.
one(`(?:what|who|whom|whose|when|where|which|how|why|is|are|was|were|does|do|did|can you tell|could you tell|tell me|show|list|give me|summari[sz]e|describe|explain|report on|remind me|any news|status of|update me|brief me|walk me)\\b|\\b(?:what(?:'|’)?s`,
  `(?:what|who|whom|whose|when|where|which|how|why|is|are|was|were|does|do(?!\\s+not\\b|n['’]t\\b|\\s+me\\s+a\\s+favou?r\\b)|did|can you tell|could you tell|tell me|show|list|give me|summari[sz]e|describe|explain|report on|remind me|any news|status of|update me|brief me|walk me)\\b|\\b(?:what(?:'|’)?s`, 'D2d READ_SHAPE do-not');

// D3 (receipt reason) + D4 (receipt entity) — a Cyrillic lexicon verb maps to the operation it names so the reason is
// "could not resolve which <entity>" rather than "not an operation I can execute"; the entity comes from the command noun
// when the model emitted neither requestIntent.entityType nor a typed field.
one(`          const verb = requestedIntent.verb;${NL}          const UNSUPPORTED_FROM_CHAT`,
  `          const verb = /^архивл/i.test(String(requestedIntent.verb || '')) ? 'archive' : /^сэргээ/i.test(String(requestedIntent.verb || '')) ? 'restore' : /^устга/i.test(String(requestedIntent.verb || '')) ? 'delete' : /^bring/i.test(String(requestedIntent.verb || '')) ? 'restore' : requestedIntent.verb;${NL}          const commandEntityNoun = ((commandText.match(/\\b(task|goal|person|people|employee|staff|project|department|compan(?:y|ies)|business unit)\\b/i) || [])[1] || '').toLowerCase();${NL}          const commandEntity = /^task/.test(commandEntityNoun) ? 'task' : /^goal/.test(commandEntityNoun) ? 'goal' : /^(person|people|employee|staff)/.test(commandEntityNoun) ? 'person' : /^project/.test(commandEntityNoun) ? 'project' : /^department/.test(commandEntityNoun) ? 'department' : null;${NL}          const UNSUPPORTED_FROM_CHAT`, 'D3/D4 receipt verb + entity');
one(`                : /Task/.test(String(requestedIntent.field || '')) ? 'task' : /Goal/.test(String(requestedIntent.field || '')) ? 'goal' : 'company')`,
  `                : /Task/.test(String(requestedIntent.field || '')) ? 'task' : /Goal/.test(String(requestedIntent.field || '')) ? 'goal' : (commandEntity || 'company'))`, 'D4 entity default');

const out = resolve(HERE, 'v59_fix.ts');
writeFileSync(out, s);
console.log('wrote ' + out + ' sha256 ' + createHash('sha256').update(s).digest('hex') + ' bare LF: ' + (s.replace(/\r\n/g, '').match(/\n/g) || []).length);
