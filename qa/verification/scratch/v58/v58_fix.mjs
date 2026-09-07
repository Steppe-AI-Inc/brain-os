// VERIFIER #58 — PREPARED FIX for V58-D1 (scratch copy only; index.ts is never written).
// The command-name lifecycle fallback's "imperative-only" gate is a DENY-LIST of non-imperative leads, so any
// declarative the list does not name executes when the model emits nothing ("I nearly archived Alpha",
// "we discussed archiving Alpha", "Bob will archive Alpha": 27/56 on my corpus). The fix adds an ALLOW-LIST: the
// raw command is a target source only when its lifecycle verb sits in IMPERATIVE POSITION — at the head of the
// command (after optional politeness / adverb / connective / polite-frame words), or at the head of the last clause
// after a non-conditional lead clause. Everything else keeps the existing deny-list checks and is refused; the
// never-silent receipt still fires downstream. Regex LITERALS (no string double-escaping); CRLF line endings.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const base = readFileSync(SRC, 'utf8');
const shaBefore = createHash('sha256').update(base).digest('hex');
function one(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`anchor not unique (${n}) for ${label}`); return s.replace(a, () => b); }
const CRLF = '\r\n';
const anchor = `        const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLead && `;
const inserted = [
  `        // Verifier #58 V58-D1: a deny-list of leads cannot enumerate every declarative ("I nearly archived Alpha",`,
  `        // "we discussed archiving Alpha", "Bob will archive Alpha" all executed). The verb must sit in IMPERATIVE`,
  `        // POSITION: head of the command after optional politeness / adverb / connective / polite-frame words, or head`,
  `        // of the LAST clause after a non-conditional lead clause ("since Alpha is done, archive Alpha"). A conditional`,
  `        // lead ("if / unless / once / when / only if …, archive X") is not an instruction to act now.`,
  String.raw`        const IMPERATIVE_HEAD_RE = /^\s*(?:(?:ok|okay|please|pls|plz|kindly|just|now|also|then|and|so|right|well|next|first|finally|again|yes|sure|go ahead(?: and)?|do me a favou?r and|hey brain|brain|quick one|time to|make sure to|be sure to|remember to|let['’]?s|we need to|(?:i think )?(?:we|you) should|i need you to|i want you to|i['’]?d like you to|you should|you need to|need you to|you can|could you(?: please)?|can you(?: please)?|would you(?: please| mind)?|will you|can we|could we|shall we)[\s,:—–-]+)*(?:archiv(?:e|ing)|un-?archiv(?:e|ing)|restor(?:e|ing)|reactivat(?:e|ing)|delet(?:e|ing)|remov(?:e|ing)|bring(?:ing)? back|end(?:ing)?|архивла|сэргээ|устга)\b/u;`,
  String.raw`        const commandClauses = commandLower.split(/[,;]\s+|\s[—–-]\s+|\s+(?:so|then|and then)\s+/);`,
  `        const commandLastClause = commandClauses[commandClauses.length - 1] || commandLower;`,
  `        const commandLeadClause = commandClauses.length > 1 ? commandClauses.slice(0, -1).join(' ') : '';`,
  String.raw`        const commandConditionalLead = /^\s*(?:if|unless|once|when|whenever|after|before|as soon as|only if|provided|providing|assuming|in case|until|while|should)\b/.test(commandLeadClause);`,
  `        const commandImperativePosition = IMPERATIVE_HEAD_RE.test(commandLower) || (commandLeadClause.length > 0 && !commandConditionalLead && IMPERATIVE_HEAD_RE.test(commandLastClause));`,
  `        const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLead && `,
].join(CRLF);
let s = one(base, anchor, inserted, 'F1 allow-list');

// ---- F2: V58-D2 — task and goal lifecycle targets resolve SERVER-SIDE under the caller's RLS (CWC §2), never by
// membership in the capped window. (a) the pack finally carries archivedTasks (queried and enveloped since v92, never
// placed in the pack, so restoreTaskIds could never resolve); (b) model-emitted task/goal ids are re-read from the
// canonical tables (any status) instead of filtered against the window; unresolved ids leave a truthful line.
s = one(s, `mcpConnectors:mcpConnectors.data||[], pendingAction, recentlyResolvedEntities,`, `mcpConnectors:mcpConnectors.data||[], archivedTasks:archivedTasks.data||[], pendingAction, recentlyResolvedEntities,`, 'F2a pack archivedTasks');
s = one(s, `type CompanyLookupRow = { id: string; name: string; status: string };`, `type CompanyLookupRow = { id: string; name: string; status: string };${CRLF}type LifecycleLookupRow = { id: string; title: string; status: string };`, 'F2 type alias');
s = one(s, [
  `        const archiveTaskIds = [...new Set(requestedArchiveTaskIds.filter((id): id is string => typeof id === 'string' && contextTaskIds.has(id)))];`,
  `        const requestedRestoreTaskIds = Array.isArray(result.restoreTaskIds) ? result.restoreTaskIds as unknown[] : [];`,
  `        const restoreTaskIds = [...new Set(requestedRestoreTaskIds.filter((id): id is string => typeof id === 'string' && contextArchivedTaskIds.has(id)))];`,
  `        const taskTitleById = new Map([`,
  `          ...((contextPack?.tasks || []).map((t: any) => [t.id, t.title])),`,
  `          ...((contextPack?.archivedTasks || []).map((t: any) => [t.id, t.title])),`,
  `        ]);`,
].join(CRLF), [
  `        // Verifier #58 V58-D2 (CONTEXT_WINDOW_AS_UNIVERSE for tasks; governance/CANONICAL_WORK_CONTRACT.md §2): task`,
  `        // lifecycle targets resolve SERVER-SIDE under the caller's RLS across every status — never by membership in`,
  `        // the capped window. context.archivedTasks was queried and enveloped but never placed in the pack, so a chat`,
  `        // restore could never execute; an archive of a task outside the 15-row window was silently dropped.`,
  `        const requestedRestoreTaskIds = Array.isArray(result.restoreTaskIds) ? result.restoreTaskIds as unknown[] : [];`,
  `        const LIFECYCLE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`,
  `        const requestedTaskLifecycleIds: string[] = [...new Set([...requestedArchiveTaskIds, ...requestedRestoreTaskIds].filter((id): id is string => typeof id === 'string' && LIFECYCLE_UUID_RE.test(id)))];`,
  `        const taskLifecycleRows = requestedTaskLifecycleIds.length > 0`,
  `          ? (((await supabase.from('tasks').select('id,title,status').in('id', requestedTaskLifecycleIds)).data || []) as LifecycleLookupRow[])`,
  `          : ([] as LifecycleLookupRow[]);`,
  `        const taskLifecycleById = new Map(taskLifecycleRows.map((t) => [t.id, t]));`,
  `        const archiveTaskIds = [...new Set(requestedArchiveTaskIds.filter((id): id is string => typeof id === 'string' && taskLifecycleById.has(id)))];`,
  `        const restoreTaskIds = [...new Set(requestedRestoreTaskIds.filter((id): id is string => typeof id === 'string' && taskLifecycleById.has(id)))];`,
  `        void contextArchivedTaskIds;`,
  `        const taskTitleById = new Map([`,
  `          ...((contextPack?.tasks || []).map((t: any) => [t.id, t.title])),`,
  `          ...((contextPack?.archivedTasks || []).map((t: any) => [t.id, t.title])),`,
  `          ...taskLifecycleRows.map((t) => [t.id, t.title]),`,
  `        ]);`,
].join(CRLF), 'F2b task re-read');
s = one(s, `        const taskArchiveRestoreLines: string[] = [];${CRLF}        for (const id of archiveTaskIds) {`, [
  `        const taskArchiveRestoreLines: string[] = [];`,
  `        for (const id of requestedTaskLifecycleIds) if (!taskLifecycleById.has(id)) taskArchiveRestoreLines.push(\`Task "\${taskTitleById.get(id) || 'that task'}": could not be found (searched the active and archived tasks you can access) — nothing was \${requestedRestoreTaskIds.includes(id) ? 'restored' : 'archived'}.\`);`,
  `        for (const id of archiveTaskIds) {`,
].join(CRLF), 'F2c task unresolved lines');
s = one(s, [
  `        const archiveGoalIds = [...new Set(requestedArchiveGoalIds.filter((id): id is string => typeof id === 'string' && contextGoalIds.has(id)))];`,
  `        const requestedRestoreGoalIds = Array.isArray(result.restoreGoalIds) ? result.restoreGoalIds as unknown[] : [];`,
  `        const restoreGoalIds = [...new Set(requestedRestoreGoalIds.filter((id): id is string => typeof id === 'string' && contextGoalIds.has(id)))];`,
  `        const goalTitleById = new Map((contextPack?.goals || []).map((g: any) => [g.id, g.title]));`,
  `        const goalArchiveRestoreLines: string[] = [];`,
].join(CRLF), [
  `        // Verifier #58 V58-D2 (same class for goals): re-read model-emitted goal ids under RLS across every status.`,
  `        const requestedRestoreGoalIds = Array.isArray(result.restoreGoalIds) ? result.restoreGoalIds as unknown[] : [];`,
  `        const requestedGoalLifecycleIds: string[] = [...new Set([...requestedArchiveGoalIds, ...requestedRestoreGoalIds].filter((id): id is string => typeof id === 'string' && LIFECYCLE_UUID_RE.test(id)))];`,
  `        const goalLifecycleRows = requestedGoalLifecycleIds.length > 0`,
  `          ? (((await supabase.from('goals').select('id,title,status').in('id', requestedGoalLifecycleIds)).data || []) as LifecycleLookupRow[])`,
  `          : ([] as LifecycleLookupRow[]);`,
  `        const goalLifecycleById = new Map(goalLifecycleRows.map((g) => [g.id, g]));`,
  `        const archiveGoalIds = [...new Set(requestedArchiveGoalIds.filter((id): id is string => typeof id === 'string' && goalLifecycleById.has(id)))];`,
  `        const restoreGoalIds = [...new Set(requestedRestoreGoalIds.filter((id): id is string => typeof id === 'string' && goalLifecycleById.has(id)))];`,
  `        const goalTitleById = new Map([...((contextPack?.goals || []).map((g: any) => [g.id, g.title])), ...goalLifecycleRows.map((g) => [g.id, g.title])]);`,
  `        const goalArchiveRestoreLines: string[] = [];`,
  `        for (const id of requestedGoalLifecycleIds) if (!goalLifecycleById.has(id)) goalArchiveRestoreLines.push(\`Goal "\${goalTitleById.get(id) || 'that goal'}": could not be found (searched the active and archived goals you can access) — nothing was \${requestedRestoreGoalIds.includes(id) ? 'restored' : 'archived'}.\`);`,
].join(CRLF), 'F2d goal re-read');
// ---- F3: the never-silent receipt names the entity the request was about, not always "company".
s = one(s, `            : (verb === 'restore' || verb === 'unarchive' || verb === 'un-archive' || verb === 'archive') ? 'I could not resolve which company you meant (searched the active and archived companies you can access)'`, [
  `            : (verb === 'restore' || verb === 'unarchive' || verb === 'un-archive' || verb === 'archive') ? ((entity: string) => \`I could not resolve which \${entity} you meant (searched the active and archived \${entity === 'company' ? 'companies' : entity + 's'} you can access)\`)(`,
  `                (modelIntent && typeof modelIntent.entityType === 'string' && ['company', 'task', 'goal', 'person', 'project', 'department'].includes(modelIntent.entityType)) ? String(modelIntent.entityType)`,
  `                : /Task/.test(String(requestedIntent.field || '')) ? 'task' : /Goal/.test(String(requestedIntent.field || '')) ? 'goal' : 'company')`,
].join(CRLF), 'F3 receipt entity');
const out = resolve(HERE, 'index.fixed.ts');
writeFileSync(out, s);
const shaAfter = createHash('sha256').update(readFileSync(SRC)).digest('hex');
if (shaBefore !== shaAfter) throw new Error('index.ts changed!');
console.log('index.ts sha256 (unchanged):', shaAfter);
console.log('index.fixed.ts sha256:', createHash('sha256').update(s).digest('hex'), 'bytes', s.length, 'bare LF:', (s.match(/(?<!\r)\n/g) || []).length);
