// #56 closure, pass 4 — sized against intent_corpus.mjs (11,880 generated mutation requests):
//  * polite-request questions ("could you please archive ACME?", "Can we archive ACME today?") are requests;
//  * one object rule for the read-capable verbs: any entity noun, id-like token or field after the verb,
//    plus case-sensitive proper nouns (lower/Title/UPPER verb forms);
//  * "NAME — verb it" / "NAME: verb" tail shape;
//  * one participle list for the passive/desiderative shape;
//  * Mongolian stems the generator uses (шинэчил, дуусга, хаа, цуцла);
//  * #56 items 6 and 8: history verified=null (unknown) when nothing executed and no intent was recorded;
//    the previous turn's stored pendingAction expires like the durable row (30 minutes).
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }
function mustLine(startsWith, replacement, label) {
  const lines = s.split('\n'); const idx = lines.findIndex((l) => l.startsWith(startsWith));
  if (idx < 0 || lines.findIndex((l, i) => i > idx && l.startsWith(startsWith)) >= 0) throw new Error(label + ': line not unique');
  lines[idx] = replacement; s = lines.join('\n'); n++;
}

const PARTICIPLES = 'archived|unarchived|restored|reactivated|deleted|removed|renamed|retitled|reassigned|unassigned|approved|rejected|declined|activated|deactivated|invited|revoked|enabled|disabled|promoted|demoted|hired|fired|terminated|dismissed|onboarded|merged|split|reopened|closed|completed|cancelled|canceled|finished|assigned|updated|changed|moved|transferred|marked|set|ended|added|created|made|edited|fixed|modified|done';
const ENTITY = 'compan(?:y|ies)|business unit|person|people|employee|staff|manager|task|goal|project|department|lead|document|proposal|product|memory|note|approval|channel|team|role|employment|assignment|contract|ticket';

mustLine('        const MUTATION_VERB_ALWAYS = /',
  String.raw`        const MUTATION_VERB_ALWAYS = /\b(archiv(?:e|ing)|un-?archiv(?:e|ing)|restor(?:e|ing)|reactivat(?:e|ing)|delet(?:e|ing)|remov(?:e|ing)|renam(?:e|ing)|retitl(?:e|ing)|reassign(?:ing)?|unassign(?:ing)?|approv(?:e|ing)|reject(?:ing)?|declin(?:e|ing)|activat(?:e|ing)|deactivat(?:e|ing)|invit(?:e|ing)|revok(?:e|ing)|enabl(?:e|ing)|disabl(?:e|ing)|promot(?:e|ing)|demot(?:e|ing)|hir(?:e|ing)|fir(?:e|ing)|terminat(?:e|ing)|dismiss(?:ing)?|onboard(?:ing)?|merg(?:e|ing)|split(?:ting)?|reopen(?:ing)?)\b|(?<!\p{L})(архивл\S*|устга\S*|сэргээ\S*|өөрчл\S*|томил\S*|болго\S*|үүсгэ\S*|нэмэ\S*|соль\S*|хас\S*|оноо\S*|шинэчил\S*|дуусга\S*|хаа|цуцла\S*|нэрийг)(?!\p{L})/iu;`, 'always');
mustLine('        const MUTATION_PASSIVE_REQUEST = /',
  String.raw`        const MUTATION_PASSIVE_REQUEST = /\b(?:should|must|needs? to|has to|have to|is to|are to|ought to|got to|gotta) (?:be |get )?(?:${PARTICIPLES})\b|\b(?:i (?:need|want)|we (?:need|want)|make sure|ensure|see that) (?:that )?\S+(?: \S+){0,4}? (?:is |are |gets? |to be )?(?:${PARTICIPLES})\b/i;`, 'passive');
mustLine('        const MUTATION_VERB_WITH_OBJECT = /',
  String.raw`        const MUTATION_VERB_WITH_OBJECT = /\b(?:(?:creat(?:e|ing)|make|making|add(?:ing)?|register(?:ing)?|set(?:ting)?|updat(?:e|ing)|chang(?:e|ing)|edit(?:ing)?|fix(?:ing)?|modif(?:y|ying)|correct(?:ing)?|clos(?:e|ing)|complet(?:e|ing)|finish(?:ing)?|cancel(?:ling|ing)?|reopen(?:ing)?|mark(?:ing)?|assign(?:ing)?|mov(?:e|ing)|transfer(?:ring)?|end(?:ing)?) (?:the |a |an |that |this |new |another |its |his |her |their |my |our )?(?:${ENTITY}|manager|status|deadline|priority|owner|title|name|description|email|role|stage|value|budget|price|start date|end date|due date|\S+-\d+)\b|make \S+(?: \S+)? (?:the |a )?(?:manager|owner|lead|admin)\b|add \S+(?: \S+)? (?:to|as|under) \b|(?:set|updat(?:e|ing)|chang(?:e|ing)) \S+(?:'s|’s) \w+(?: \w+)? to\b|mov(?:e|ing) \S+(?: \S+)? (?:to|into|under)\b|transfer(?:ring)? \S+(?: \S+)? (?:to|into|under)\b|mark \S+(?: \S+){0,3} as (?:done|complete|completed|closed|archived|active|inactive|resolved)\b)|[:—–-]\s*(?:assign|set|update|change|edit|fix|modify|close|complete|finish|cancel|reopen|mark|move|transfer|end|create|add|make|archive|restore|delete|remove|rename)(?:\s+(?:it|them|this|that))?\s*[.!]?\s*$/i;`, 'object');
mustLine('        const MUTATION_VERB_PROPER_OBJECT = /',
  String.raw`        const MUTATION_VERB_PROPER_OBJECT = /(?:^|[\s,.;:—–-])(?:[Cc]reate|CREATE|[Cc]reating|[Mm]ake|MAKE|[Aa]dd|ADD|[Aa]dding|[Rr]egister|[Ss]et|SET|[Ss]etting|[Uu]pdate|UPDATE|[Uu]pdating|[Cc]hange|CHANGE|[Cc]hanging|[Ee]dit|EDIT|[Ee]diting|[Ff]ix|FIX|[Mm]odify|MODIFY|[Cc]lose|CLOSE|[Cc]omplete|COMPLETE|[Ff]inish|FINISH|[Cc]ancel|CANCEL|[Rr]eopen|REOPEN|[Mm]ark|MARK|[Aa]ssign|ASSIGN|[Aa]ssigning|[Mm]ove|MOVE|[Tt]ransfer|TRANSFER|[Hh]ire|HIRE|[Oo]nboard|ONBOARD|[Ee]nd|END)\s+(?:the\s+|a\s+|an\s+|new\s+|THE\s+)?(?:[A-Z][A-Za-z0-9_-]+|[A-Z]{2,}|\S+-\d+|"[^"]+"|“[^”]+”|'[^']+')/;`, 'proper');
must(`        const isQuestion = /\\?/.test(commandText) && !/\\b(?:ok|okay|right|alright|please|yes)\\s*\\?\\s*$/i.test(commandText);
        const readShaped = isQuestion || READ_SHAPE.test(commandText);`,
  String.raw`        // A polite request phrased as a question is still a request ("could you please archive ACME?").
        const POLITE_REQUEST = /^\s*(?:would you mind|would you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|could you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|can you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|will you|can we|could we|shall we|shall i|may i ask you to|please)\b/i;
        const isQuestion = /\?/.test(commandText) && !/\b(?:ok|okay|right|alright|please|yes)\s*\?\s*$/i.test(commandText) && !POLITE_REQUEST.test(commandText);
        const readShaped = isQuestion || READ_SHAPE.test(commandText);`, 'polite');
mustLine('        const lexiconPassive = MUTATION_PASSIVE_REQUEST.test(commandText)',
  String.raw`        const lexiconPassive = MUTATION_PASSIVE_REQUEST.test(commandText) ? ((commandText.match(new RegExp('\\b(' + '${PARTICIPLES}' + ')\\b', 'i')) || [])[1] || 'update') : null;`, 'passive verb');

// #56 item 8: the previous turn's stored pendingAction expires like the durable row.
must(`    ? supabase.from('work_orders').select('command,output').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(8)`,
     `    ? supabase.from('work_orders').select('command,output,created_at').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(8)`, 'history select');
must(`  const lastTurnOutput = conversationRowsChronological?.[conversationRowsChronological.length - 1]?.output as {
    pendingAction?: PendingAction | null;
    pendingConfirmation?: { summary?: string; action?: Record<string, unknown> } | null;
    resolvedEntities?: ResolvedEntities | null;
  } | undefined;`,
`  // Verifier #56 item 8: the previous turn's STORED pendingAction carries the same 30-minute expiry as
  // the durable row — an old, unanswered question must not bind a bare "yes" hours later.
  const lastTurnRow = conversationRowsChronological?.[conversationRowsChronological.length - 1];
  const lastTurnCreatedAt = lastTurnRow && typeof lastTurnRow.created_at === 'string' ? new Date(lastTurnRow.created_at).getTime() : NaN;
  const lastTurnPendingFresh = Number.isNaN(lastTurnCreatedAt) || (Date.now() - lastTurnCreatedAt) <= 30 * 60 * 1000;
  const lastTurnOutputRaw = lastTurnRow?.output as {
    pendingAction?: PendingAction | null;
    pendingConfirmation?: { summary?: string; action?: Record<string, unknown> } | null;
    resolvedEntities?: ResolvedEntities | null;
  } | undefined;
  const lastTurnOutput = lastTurnOutputRaw && !lastTurnPendingFresh ? { ...lastTurnOutputRaw, pendingAction: null, pendingConfirmation: null } : lastTurnOutputRaw;`, 'ttl');

// #56 item 6: verified is UNKNOWN (null), never true, when nothing executed and no intent was recorded.
must(`    return { turn: historyWindowStart + idx, command: r.command, summary, verified: executedOperationCount === null ? null : !unverified, executedOperationCount, rejectedClaimCount };`,
     `    const verified: boolean | null = executedOperationCount === null ? null : unverified ? false : (executedOperationCount > 0 ? true : null);
    return { turn: historyWindowStart + idx, command: r.command, summary, verified, executedOperationCount, rejectedClaimCount };`, 'verified null');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
