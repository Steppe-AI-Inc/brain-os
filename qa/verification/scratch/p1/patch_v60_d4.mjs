// VERIFIER #60 FINDING V60-D4 (P1). With the model emitting no classification, 33 of 37 ordinary business
// imperatives were outside the request lexicon entirely — cancel, schedule, send, publish, share, upload,
// duplicate, copy, stop, pause, resume, link, attach, flag, tag, reset, clear, grant, post, notify, email,
// message, order, reserve, issue, pay, refund, charge, import, export, empty — so a fabricated completion
// shipped verbatim. Measured end to end against deployed v92 on the shipped summary, 290 of 920 pairs
// (31.5%) were cases where v92 corrects and the candidate ships. That is a truth regression against
// production, not an intended departure.
//
// The fix stays on the request side, as the founder required: intent comes from the FOUNDER'S COMMAND, by
// VERB POSITION, never from the tense, shape or wording of the reply. A command whose first meaningful
// token (after the ordinary request frames: "please", "can you", "when you get a chance", ...) is a
// mutation verb in base form, followed by an object, is a mutation request. Read-shaped commands still
// veto, so "show me the archived companies" and "clear my memory" are untouched.
//
// A verb the product cannot execute from chat is INTENDED to land here: the receipt then says truthfully
// that no change was made and why, which is the correct answer to "email the report to the client" — far
// better than the model's own "Sent." (OPERATING_TRUTH_MODEL.md §4.2, MutationIntentNeverSilent).
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); }

const VERBS = [
  'archive', 'unarchive', 'un-archive', 'restore', 'reactivate', 'delete', 'remove', 'rename', 'retitle',
  'reassign', 'unassign', 'approve', 'reject', 'decline', 'activate', 'deactivate', 'invite', 'revoke',
  'enable', 'disable', 'promote', 'demote', 'hire', 'fire', 'terminate', 'dismiss', 'onboard', 'merge',
  'split', 'reopen', 'create', 'add', 'register', 'update', 'change', 'edit', 'modify', 'correct',
  'close', 'complete', 'finish', 'cancel', 'mark', 'assign', 'move', 'transfer', 'schedule', 'reschedule',
  'send', 'publish', 'unpublish', 'share', 'unshare', 'upload', 'duplicate', 'copy', 'stop', 'pause',
  'resume', 'link', 'unlink', 'attach', 'detach', 'flag', 'unflag', 'tag', 'untag', 'reset', 'clear',
  'grant', 'deny', 'post', 'notify', 'email', 'message', 'order', 'reserve', 'unreserve', 'issue', 'pay',
  'refund', 'charge', 'import', 'export', 'empty', 'archive', 'submit', 'withdraw', 'apply', 'install',
  'uninstall', 'subscribe', 'unsubscribe', 'rollback', 'deploy', 'sync', 'block', 'unblock', 'mute',
  'unmute', 'lock', 'unlock', 'suspend', 'unsuspend', 'renew', 'extend', 'shorten', 'increase', 'decrease',
  'raise', 'lower', 'convert', 'migrate', 'replace', 'swap', 'combine', 'separate', 'set', 'make', 'end', 'fix',
];
const alt = [...new Set(VERBS)].sort((a, b) => b.length - a.length).join('|');

must(`        const lexiconVerb: string | null = (lexiconAlways || lexiconPassive || lexiconObject) ? String(lexiconAlways || lexiconPassive || lexiconObject).toLowerCase() : null;`,
`        // IMPERATIVE POSITION (verifier #60, V60-D4). The founder's command, with its ordinary request
        // frames stripped, beginning with a mutation verb in base form and carrying an object. Position is
        // request-side evidence: it is a property of what was ASKED, never of what the model replied.
        // Read-shaped commands veto this exactly as they veto the other lexicon tiers.
        const MUTATION_IMPERATIVE_HEAD = /^\\s*(?:${alt})\\b\\s+\\S/i;
        const imperativeSource = MUTATION_IMPERATIVE_HEAD.test(commandForRead)
          ? commandForRead
          : (commandClausesForRead.length > 1 && MUTATION_IMPERATIVE_HEAD.test(lastClauseForRead) ? lastClauseForRead : null);
        const lexiconImperative: string | null = imperativeSource
          ? String((imperativeSource.trim().match(/^[A-Za-z-]+/) || [''])[0]).toLowerCase() || null
          : null;
        const lexiconVerb: string | null = (lexiconAlways || lexiconPassive || lexiconObject || lexiconImperative) ? String(lexiconAlways || lexiconPassive || lexiconObject || lexiconImperative).toLowerCase() : null;`, 'imperative lexicon');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('imperative lexicon applied with ' + [...new Set(VERBS)].length + ' verbs');
