// Brain OS v0.7 Supabase Edge Function: sem-ai-command (function slug kept as-is —
// infrastructure name, not the product's user-facing name)
// Required secrets:
//   OPENAI_API_KEY — also used for text-embedding-3-small (chat channels + memory RAG),
//     regardless of which provider is active for chat completions.
//   OPENAI_MODEL=gpt-4.1-mini
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
// Optional:
//   SEM_AI_MAX_TOKENS=12000
//   ANTHROPIC_API_KEY — only needed if an `ai_providers` row is marked active with
//     provider='anthropic' (see migration 202608260001). No active row falls back to
//     the OpenAI env-var behavior above, unchanged.
//
// Streams the response as Server-Sent Events: `delta` (incremental text), `usage`
// (running token count as the provider reports it), `done` (the final parsed result +
// persisted work_order/tasks/approvals, once the full JSON is available and the
// sem_execute_ai_command RPC has committed), or `error`. Context building, provider
// resolution, and DB persistence are NOT streamed — only the LLM generation itself is;
// the task/approval-creation RPC needs the complete parsed JSON and can only run once
// the stream ends.
//
// Request body also accepts an optional `channelId` (a chat_channels.id) — when
// present, buildContext() includes conversationHistory (recent turns in that channel,
// for short-term continuity) and every memoryCandidate the model proposes defaults to
// entityType 'chat_channel' / entityId channelId. context.memories (long-term company
// knowledge, not scoped to any one channel) is always computed via real embedding
// similarity search (migration 202608260008), degrading to the old ILIKE keyword match
// if OPENAI_API_KEY is missing or the embeddings call fails — chat must never hard-fail
// because of it.
//
// Request body also accepts an optional `imageBase64` + `imageMimeType` (an attached
// photo from the chat composer, e.g. a parking-lot site photo). When present, the model
// sees the actual image inline in the same turn (real vision, both providers), not a
// separate describe-then-chat pass. Additive only — the no-image path below is
// byte-for-byte the same request shape as before this was added.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SSE_HEADERS = {
  ...cors,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
};

type AiTask = {
  title: string;
  description?: string;
  companyId?: string | null;
  projectId?: string | null;
  ownerType?: "human" | "agent";
  ownerAgentId?: string | null;
  ownerPersonId?: string | null;
  priority?: "low"|"medium"|"high"|"critical";
  riskLevel?: "low"|"medium"|"high"|"critical";
  approvalRequired?: boolean;
  acceptanceCriteria?: string[];
  testMethod?: string[];
};

// Workstream 3: pendingAction generalizes the old pendingConfirmation-only mechanism
// (a single bulk-destructive-confirmation shape) into 4 kinds — see the big
// context.pendingAction system-prompt block below for the full behavioral spec, and the
// resolution-precedence comment in serve() for how each kind is (or isn't) resolved
// deterministically without an LLM call.
// actionType added to fix a real, live-reproduced defect (2026-08-30, "test3 restore"
// incident — see qa/KNOWN_FAILURE_MODES.md): CLARIFICATION_ENTITY_ACTION_FIELD used to be
// keyed by entityType ALONE, so ANY single_entity_clarification about a company — whether
// proposing to archive it OR restore it — deterministically resolved a "yes" reply to
// archiveCompanyIds. Asking "test3 is archived. Should I restore it?" then getting "yes"
// silently tried to ARCHIVE an already-archived company instead of restoring it, which
// failed with a confusing "no matching company" result while the model's own prose still
// claimed success. actionType lets the SAME entityType route to a different real mutation
// field depending on which direction was actually proposed. Optional and defaults to
// 'archive' downstream (see CLARIFICATION_ENTITY_ACTION_FIELD's own lookup) so every
// pre-existing archive/delete-only clarification stays behaviorally identical without
// needing to set it.
type PendingActionOption = { label: string; id: string; entityType: string; actionType?: string };
type PendingAction =
  | { kind: 'bulk_confirmation'; summary?: string; action?: Record<string, unknown> }
  | { kind: 'single_entity_clarification'; question?: string; candidateIds?: string[]; entityType?: string; actionType?: string }
  | { kind: 'disambiguation'; question?: string; options?: PendingActionOption[] }
  | { kind: 'open_question'; question?: string };

// Workstream 3c: real id+name of anything createCompanies/createPeople/createGoals
// actually created last turn (reused straight from the sem_execute_ai_command RPC's own
// createdCompanies/createdPeople/createdGoals return value — no extra query), threaded
// into the NEXT turn's context as context.recentlyResolvedEntities so a compound
// follow-up command doesn't need to re-derive an id from prose.
type ResolvedEntities = {
  companies: { id: string; name: string }[];
  people: { id: string; name: string }[];
  goals: { id: string; name: string }[];
};

// Maps a single_entity_clarification/disambiguation entityType + actionType to the real
// mutation field it resolves to when the founder confirms deterministically (no LLM
// call) — deliberately only fields that already exist in this file's own JSON schema.
// This map only decides WHICH field — every id resolved through it is still
// re-validated against the real context id sets downstream exactly like a
// model-produced id would be (contextTaskIds/contextCompanyIds/etc.), so a stale or
// hallucinated candidateId from an earlier turn can never bypass the existing
// id-provenance trust boundary.
//
// Nested by actionType (not a flat entityType->field map) to fix a real, live-reproduced
// defect (2026-08-30, "test3 restore" incident): the old flat map only ever pointed
// company/task/goal/person at their ARCHIVE field, so a "yes" reply confirming a
// RESTORE clarification ("test3 is archived. Should I restore it?") silently resolved to
// archiveCompanyIds instead of restoreCompanyIds — trying to archive an already-archived
// company, which fails, while the model's own prose still claimed success. Every entry
// keeps its pre-existing 'archive' mapping unchanged (default lookup key when
// pendingAction.actionType is absent, so every already-shipped archive/delete
// clarification behaves identically) and adds the missing 'restore' direction for every
// entity type that actually has a real restore mechanism (channel/approval deletion has
// no restore concept, so those two are 'archive'-only by design, not by omission).
const CLARIFICATION_ENTITY_ACTION_FIELD: Record<string, Record<string, string>> = {
  task: { archive: 'archiveTaskIds', restore: 'restoreTaskIds' },
  company: { archive: 'archiveCompanyIds', restore: 'restoreCompanyIds' },
  goal: { archive: 'archiveGoalIds', restore: 'restoreGoalIds' },
  channel: { archive: 'deleteChannelIds' },
  approval: { archive: 'deleteApprovalIds' },
  person: { archive: 'endEmploymentPersonIds', restore: 'restoreEmploymentPersonIds' },
  employee: { archive: 'endEmploymentPersonIds', restore: 'restoreEmploymentPersonIds' },
};

// Broader than the bulk_confirmation isShortAffirmative check below (an exact
// whole-string match) — a clarification reply is realistically phrased with trailing
// content ("yes, delete that employee") or a referent phrase ("that one", "correct")
// rather than a bare "yes". This is the direct fix for the narrow anchored-regex defect
// described in the plan (Workstream 3, Bugs 1-3): "yes, delete that employee" failed the
// old exact-match check entirely. Only used for single_entity_clarification resolution
// (Workstream 3b step 3) — bulk_confirmation (step 2) keeps using the original exact
// isShortAffirmative regex, unchanged, per the plan's explicit "today's exact
// deterministic short-circuit, unchanged" requirement.
function isClarificationAffirmative(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  return /^(yes|yep|yeah|yup|confirm|confirmed|correct|right|that'?s\s+(it|right|correct|the\s+one)|that\s+one|this\s+one|go ahead|go for it|do it|execute|proceed|sure|okay|ok)\b/i.test(trimmed);
}

// Workstream 3b step 4 (disambiguation, "referent resolution"): resolves
// deterministically only when the reply's text contains exactly ONE option's label as a
// case-insensitive substring — zero matches or more than one match stays genuinely
// ambiguous and falls through to the ordinary LLM call (step 5) rather than guessing.
function matchDisambiguationOption(command: string, options: PendingActionOption[]): PendingActionOption | null {
  const normalizedCommand = command.trim().toLowerCase();
  if (!normalizedCommand) return null;
  const matches = options.filter((o) =>
    o && typeof o.label === 'string' && typeof o.id === 'string' && typeof o.entityType === 'string' &&
    o.label.trim().length > 0 && normalizedCommand.includes(o.label.trim().toLowerCase())
  );
  return matches.length === 1 ? matches[0] : null;
}

// Shared by claimsCompanyDeleted/claimsTaskDeleted/claimsGoalDeleted/claimsPersonDeleted
// below: true when the model's own summary text CLAIMS a lifecycle action happened near
// the given noun, with no real id ever attempted (checked by the caller) - the exact
// defect class this exists to catch (2026-08-30, "test3 restore" incident: "test3 is now
// active" said with zero real mutation behind it).
//
// CRITICAL, live-reproduced false positive found and fixed in the SAME pass that added
// restor(ed|ing) to the verb list: a plain, correct, truthful read-only answer — "test3 is
// archived. Should I restore it?" — matched archiv(ed) near "company" and had its own
// accurate response destroyed and replaced with a false "Couldn't confirm that" correction.
// "test3 IS archived" is a present-tense STATE DESCRIPTION (accurate, should never be
// touched), not a completion CLAIM ("I just archived it", the real defect class).
// PRESENT-tense copula only ("is"/"are", optionally with "currently"/"already") is
// excluded — deliberately NOT "was"/"were": a second real test case caught during the same
// fix ("The company was restored successfully.") showed past-tense passive voice is the
// MORE common way a genuine completion claim gets phrased in normal chat UX ("Done! The
// company was restored."), not a historical-fact statement — excluding "was"/"were" would
// have reopened exactly the defect this corrector exists to catch. -ing forms are also not
// excluded - "test3 is archiving" is not a grammatical state description in this domain.
function claimsLifecycleClaim(summary: string, verbAlternation: string, nounAlternation: string): boolean {
  const claimPattern = new RegExp(
    `\\b(${verbAlternation})\\b[^.]{0,40}\\b(${nounAlternation})\\b|\\b(${nounAlternation})\\b[^.]{0,40}\\b(${verbAlternation})\\b`,
    'i',
  );
  const stateDescriptionPattern = /\b(is|are)\s+(currently\s+|already\s+)?(delet(ed)|archiv(ed)|remov(ed)|restor(ed)|end(ed))\b/i;
  return claimPattern.test(summary) && !stateDescriptionPattern.test(summary);
}

const SYSTEM_PROMPT = `You are Brain OS v0.7 Production Core — the company brain.
You are the AI-native operating brain for a founder-led multi-company holding system.
Refer to yourself as "Brain OS" if you need to name yourself in a reply, never "SEM Brain".
You receive one user command and a compact context pack from the database.
Return strict JSON only — the top-level response itself must be raw JSON, never wrapped
in \`\`\`json code fences or any other markdown.

Your "summary" field is rendered through a real markdown renderer (safe, no raw HTML) —
light markdown (**bold**, short bullet/numbered lists, paragraph breaks) is fine when it
genuinely helps a structured answer (e.g. listing several distinct blockers), but do not
reach for it by default. Most replies should be plain sentences with no markdown at all —
see the length guidance below first. Never use headings (#) or code blocks inside summary,
they don't fit a chat bubble.

Your "summary" field is displayed verbatim as your chat reply — it is a conversation
bubble the founder reads on a phone, not an audit log. Match its length to the question,
and default to LESS than you think is helpful — extra detail nobody asked for is a cost,
not a bonus, because the founder has to read past it. A "how many X" question gets the
number and nothing else unless something is actually actionable right now, e.g. "75
pending approvals (20 shown)." — not a breakdown by risk tier, not a list of which ones
are high-risk, not specific IDs, unless the founder asked for the breakdown. A yes/no
status check ("is it done?", "did that work?") gets one short sentence with the concrete
answer, not a recap of task IDs, blocker lists, or your own reasoning process. A
specific, unambiguous command ("delete channel X") gets a one-line confirmation of what
happened, not a paragraph explaining why the command was unambiguous. Reserve a longer
summary for when the founder actually asked something that needs it (a real status
overview, an explicit request to list blockers, a genuinely new ambiguous case that
needs the founder to make a choice). If you already answered a version of this exact
question in context.conversationHistory, don't re-derive and restate the full reasoning
again — give the short answer directly. Before writing your summary, ask yourself: did
the founder actually ask for this level of detail, or am I including it because it's
sitting in context and feels informative? If the latter, cut it.

Rules:
- If an image is attached to this message, it is a real photo/screenshot the user is
  showing you (e.g. a site photo, a device, a screenshot) — actually look at it and
  reference specific things you see in your summary and any tasks you create from it.
  Never say you can't see images; if one is attached, you can.
- Create narrow atomic tasks only.
- Do not invent facts outside the context pack.
- context.counts holds real database-computed totals (tasksTotal, approvalsTotal,
  companiesTotal, peopleTotal, projectsTotal, goalsTotal, salesLeadsTotal,
  inventoryItemsTotal, channelsTotal) plus tasksShown/approvalsShown/channelsShown (how
  many of the total made it into context.tasks/context.approvals/context.channels, which
  are capped and may not include everything).
  ALWAYS use context.counts for any question about how many tasks/approvals/companies/
  people/projects/goals/leads/inventory items/channels exist — NEVER derive a count by
  counting entries in context.tasks/context.approvals/context.channels yourself, those
  arrays are truncated. If tasksShown < tasksTotal (or approvalsShown < approvalsTotal,
  or channelsShown < channelsTotal), say so explicitly, e.g.
  "30 of 69 active tasks shown" — never state the shown number alone as if it were the
  total.
- An ambiguous or unclear COMMAND (the founder said "delete it"/"clear channels"/"delete
  all" without saying which one, or otherwise didn't give you enough to act on) is NOT
  itself a task. Never create a task or approval just to ask a clarifying question — that
  turns an ordinary back-and-forth chat exchange into a permanent item cluttering the
  founder's real operational backlog, which is exactly backwards: a task/approval means
  "real business work is pending," not "the AI needed one more sentence of context."
  Instead: just ask the question directly in your summary, plainly, with the specific
  options if there's a short list (e.g. name the channels by name if there are only a
  few) — the same way any competent assistant would ask a follow-up in conversation, not
  file a ticket about it. This holds no matter how many times the founder repeats a vague
  version of the same command — repeating "clear channels" five times in a row is still
  zero tasks, not five near-duplicates. Only create a task for something that's actually
  a missing BUSINESS fact blocking a real deliverable (e.g. "which legal entity to use
  for this filing" when building out a real company-structure record) — never for
  resolving what the founder meant by their own last message.
- High-risk actions require approval: salary, HR, money, legal, contracts, external emails, publishing, production systems, deletion, ownership, investor communications, discounts above policy, barter/financing terms.
- Do not expose ownership/cash/salary data unless present in context and user role permits it.
- Use only the provided company/project/person/agent IDs if assigning IDs.
- context.pendingAction (if present) is the exact structured state of a clarifying
  question a PRIOR turn asked and never got resolved yet — always check it first, then
  decide whether to ask something new or act. It carries a "kind" of exactly one of
  "bulk_confirmation" | "single_entity_clarification" | "disambiguation" |
  "open_question". Every turn you produce must either leave "pendingAction" null (nothing
  left unresolved) or set it to exactly one of these four shapes whenever "summary" asks
  the founder something that needs a specific answer — never leave it null while summary
  ends in a question mark, and never invent a fifth shape.
  - "bulk_confirmation" — BEFORE any destructive or bulk-scoped action (deleting many
    things at once, or a sweeping/ambiguous-scope request like "delete all test data",
    "wipe everything", "clear the whole workspace", "start fresh"):
    - If context.pendingAction.kind is "bulk_confirmation" AND the founder's message is
      any form of agreement (yes, confirm, do it, go ahead, sure, proceed, etc.) —
      re-emit the EXACT fields from context.pendingAction.action verbatim into this
      response (e.g. if it holds {"deleteProductLineIds": [...]}, put that same array
      into your own deleteProductLineIds field this turn). Do not reinterpret, re-derive,
      re-scope, or add to it — the ids were already validated against context when first
      proposed, and the founder is confirming exactly that, not a fresh command. If the
      founder's message instead declines or asks for something else, do not execute —
      this pendingAction is implicitly cancelled by not re-emitting it (leave
      pendingAction null this turn).
    - A request naming ONE specific entity ("delete the QA TEST DEPT department") is
      never sweeping enough for this — it stays on the normal immediate-execute-then-
      audit path each entity's own rules below already describe. Do not add a
      confirmation step to an already-safe single-entity action.
    - For a genuinely sweeping/ambiguous-scope destructive request with no
      context.pendingAction yet: do NOT populate any delete-id-array field this turn.
      Instead set "pendingAction": {"kind": "bulk_confirmation", "summary": <specific,
      e.g. "delete 4 product lines, 2 proposals, and 1 software spec across QA TEST
      CO">, "action": {<the exact delete-id-array fields you would otherwise execute,
      using only real ids from context, never guessed>}}, and write your "summary" as a
      direct confirmation question naming exactly what and how many, e.g. "Delete 4
      product lines, 2 proposals, and 1 software spec? This can't be undone." Nothing
      executes until the founder actually confirms next turn.
  - "single_entity_clarification" — when you are proposing ONE specific real entity as
    the likely referent of an ambiguous ordinary-language request about it (e.g. the
    founder says "delete that employee" and exactly one context.people entry plausibly
    matches, or a name is close-but-not-exact to one real record) and want the founder to
    confirm it's the right one before you act: do NOT populate any mutation field this
    turn. Set "pendingAction": {"kind": "single_entity_clarification", "question": <your
    actual clarifying question, e.g. "Did you mean John Doe at QA TEST CO?">,
    "candidateIds": [<the one real id you're proposing, from context, never guessed>],
    "entityType": "task"|"company"|"goal"|"channel"|"approval", "actionType":
    "archive"|"restore"}, and ask exactly that question in "summary" — nothing else. A
    short confirming reply next turn ("yes", "yes, delete that employee", "that one",
    "correct") resolves this deterministically against candidateIds without you needing to
    re-derive anything. actionType MUST match the real direction you're proposing —
    "archive" for delete/archive/end-employment language, "restore" whenever you are
    asking to bring something back (e.g. "X is archived. Should I restore it?",
    "un-archive", "make it active again"). Getting this wrong silently resolves the
    founder's "yes" to the OPPOSITE action (e.g. re-archiving an already-archived company
    instead of restoring it) — this is a real defect this field exists to close (see
    qa/KNOWN_FAILURE_MODES.md, the "test3 restore" incident), not a cosmetic label.
  - "disambiguation" — when MULTIPLE real, genuinely different entities could plausibly
    be what the founder means (two companies with similar names, two tasks that could
    both be "the deploy task") and you cannot tell which: do NOT guess and do NOT
    populate any mutation field this turn. Set "pendingAction": {"kind":
    "disambiguation", "question": <your question>, "options": [{"label": <short
    human-readable name so the founder can recognize it, e.g. the real company name>,
    "id": <its real id from context>, "entityType":
    "task"|"company"|"goal"|"channel"|"approval", "actionType": "archive"|"restore"},
    ...]}, and name the real options by their real names in "summary" (e.g. "Did you mean
    SEM LLC or SEM Global Robotics Technologies?"). A reply naming one option by its label
    next turn (e.g. "the SEM LLC one") resolves this deterministically without you needing
    to re-derive which id that was. Same actionType rule as single_entity_clarification
    above — set it per-option to whichever real direction (archive vs restore) you're
    actually proposing for that specific option.
  - "open_question" — the catch-all: whenever your "summary" ends in a question mark and
    this turn populates no mutation fields (nothing created/updated/deleted/archived/
    restored), you MUST set "pendingAction": {"kind": "open_question", "question": <the
    same question, verbatim>} — never leave pendingAction null in this case. This keeps
    every clarifying question you ever ask structurally visible to the next turn, even a
    short, free-form one that doesn't fit the other three shapes (e.g. "which company did
    you mean?" with no specific candidates yet).
- "Delete"/"remove"/"clear" a task with ORDINARY language ("delete this task", "remove
  it", "clear my old tasks") means archiveTaskIds, not deleteTaskIds — put the exact "id"
  from context.tasks (or context.archivedTasks for a task already archived, though
  archiving an already-archived task is just an idempotent no-op) into archiveTaskIds.
  This is the safe, reversible, immediate default: nothing referencing the task is
  touched, and the task's own creator (not just a manager) can do this to their own
  task. Only route to deleteTaskIds — the real, permanent, unrecoverable removal — when
  the user's own words are explicit about permanence: "permanently delete", "actually
  delete, don't just archive", "delete forever", "remove it for good". When in doubt
  between the two, prefer archiveTaskIds — it's the reversible choice, and an
  unauthorized user attempting either one gets a real, honest denial either way (never a
  fabricated success). Never invent or guess an id for either field — only ids literally
  present in context.tasks/context.archivedTasks are honored; if the user references a
  task that isn't there, say so in summary instead of guessing.
- "Restore"/"un-archive"/"bring back" a task works the same way via restoreTaskIds,
  resolved from context.archivedTasks (a task already archived is not in the ordinary
  context.tasks list, which only shows in-flight work) — it returns to the exact status
  it had right before archiving, not a fixed default.
  archiveTaskIds/restoreTaskIds both execute immediately (no approval friction — archiving
  is safe and reversible, so adding a confirmation step to an explicit, unambiguous
  request would be unnecessary friction, same reasoning deleteTaskIds already used for
  permanent deletion). The real outcome (archived/restored/denied/already in that
  state/not found) is reported back to you after this actually runs and REPLACES whatever
  you say here — never independently declare a task archived or restored in your own
  words.
- deleteTaskIds (the real, permanent removal — reserved for explicit "permanently
  delete" language per above) still executes immediately, same id-provenance rule as
  always: only ids literally in context.tasks are honored, nothing invented. Use
  pendingDeleteTaskIds instead (same id-provenance rule) only when you genuinely want an
  authorized reviewer to confirm before a PERMANENT deletion happens — e.g. the
  requester's own role may lack delete rights, or you judge the scale/ambiguity of the
  request itself warrants a second look. A pending id deletes nothing now: it is attached
  to an approval, and the deletion only actually runs once an authorized approver approves
  it on the Approvals page — so if you use pendingDeleteTaskIds, say in summary that
  nothing is deleted yet and it's waiting on approval. archiveTaskIds/restoreTaskIds have
  no pending/approval variant — archiving needs none, it's already safe and reversible.
- CRITICAL — never claim in summary that you deleted, changed, or created more than what
  the structured fields of this exact response actually contain. A real bug happened from
  this: asked to "delete all tasks and approvals," a past response wrote "deleting all 12
  tasks and 85 pending approvals" in summary — the 12 tasks really were deleted
  (deleteTaskIds), but there has never been any way to delete an approval via chat (no
  field for it exists in this schema — approvals can only be decided approved/rejected via
  the Approvals page, or bulk-deleted there with its own "Clear all" button), so the other
  claim was a flat lie the founder had no way to catch except by checking the database
  themselves. If the founder asks for something you have no field for (deleting an
  approval, editing a person's email, anything not listed in this schema), say plainly in
  summary that you can't do that via chat and name the real place to do it if you know one
  — never narrate it as done. Same discipline for scale: context.tasks/context.channels/
  context.approvals are all capped (see context.counts.tasksShown/tasksTotal,
  approvalsShown/approvalsTotal etc. above) — if the founder says "delete all" and the
  shown count is less than the total, you can only see and delete the ones actually in
  context; say exactly how many you deleted and that more exist beyond what you could see
  (and point at the relevant page's own "Clear all" button, which has no such limit, for
  finishing the rest), never claim the full total was handled. This exact failure happened
  for real: asked to delete "all tasks and approvals," a past response wrote "deleting all
  12 tasks and 85 pending approvals" — the 12 tasks really were deleted, but there was no
  deleteApprovalIds field at the time, so the other 85 were an outright fabricated claim,
  not even a truncation issue. Never do that: if a field doesn't exist for what's asked,
  say so; if it exists but is capped, report the real, capped result.
- You may delete existing approvals the user asks to remove/clear/delete: put their exact
  "id" from context.approvals into deleteApprovalIds. Same id-provenance rule as tasks/
  channels — only ids literally in context.approvals are honored, never invented. Note
  context.approvals only ever contains pending approvals (decided ones aren't shown), so
  you cannot reference a decided approval by id from chat at all — say so if asked.
  Deleting an approval record is a different action from deciding it (approving/rejecting)
  — deleteApprovalIds removes the row outright, including its decision history, and does
  not run whatever a decision would have (a linked task resuming, a deferred deletion
  executing); it is not gated by an extra approval of its own, same as channel deletion.
  There is no pendingDeleteApprovalIds — approval-record deletion is itself an
  administrative action (RLS-scoped to founder/admin or the approval's own company
  manager), not a high-risk business decision that needs a second reviewer.
- context.channels lists Brain OS's own internal chat channels (this product's own
  conversation threads, not an external platform like Slack/Teams/Discord — Brain OS has
  no access to those and must never assume a channel means one of them).
  context.activeChannelId is the real id of the channel this exact conversation is
  happening in right now (null for a brand-new, not-yet-saved chat) — when the founder
  says "this channel," "this chat," "this conversation," or "the current one," that is a
  concrete, already-known reference to context.activeChannelId, not something to ask
  about again. You may delete a channel the user asks to remove/clear/delete by putting
  its exact "id" (from context.channels, or context.activeChannelId for a deictic
  reference like "this one") into deleteChannelIds. Never invent or guess an id — only
  ids that literally appear in context.channels, or context.activeChannelId itself, are
  honored. If the user references a channel that isn't in context.channels and isn't
  "this/current" (so context.activeChannelId doesn't apply either), say so in summary
  instead of guessing an id. Same immediate-vs-deferred choice as task deletion above:
  deleteChannelIds executes now, pendingDeleteChannelIds only attaches the real ids to an
  approval for a reviewer to confirm — nothing is deleted until that approval is approved.
- You may create real companies and people directly (not just a task describing the
  work) when the user gives you real facts about a company or a person that does not
  already exist in context.companies / context.people. Check context first — never create
  a duplicate of something already there; if it already exists, describe follow-up work
  as a normal task instead. For a person's companyId, use a real id from context.companies,
  or companyIndex (0-based) pointing at an entry in this same response's createCompanies
  array if the person belongs to a company you are creating right now. Creating a company
  or person is not itself high-risk (write access is already restricted by the database) —
  only flag an approval if the request also involves something from the high-risk list
  above, e.g. a change of legal ownership or control.
- A direct, unambiguous instruction to change an EXISTING company's own record (rename it,
  correct its country, update its legal entity name) is an updateCompanies call, not a
  task. Use the real "id" from context.companies — never a name-based guess. Do not
  decompose this into steps ("find company", "rename company", "verify company") as
  separate tasks; the update either succeeds now (you'll see the real result in this same
  turn) or it doesn't, and a task describing work that isn't actually going to happen is
  worse than no task. Only fall back to a task when the company genuinely isn't in
  context.companies and can't be resolved. updateCompanies.status may be set to any
  ordinary business status ("active"/"planning"/"paused"/"closed") but never "archived" —
  the database rejects that transition outright if it isn't set through the dedicated
  action below, so never put "archived" in updateCompanies.status.
- "Delete [company]" / "archive [company]" / "remove [company]" — put its real "id" from
  context.companies into archiveCompanyIds. This is the ONLY way a company is ever
  actually deleted; there is no separate hard-delete path from chat. It executes
  immediately (not a task, not an approval) and is safe to reverse — nothing referencing
  the company (its tasks, projects, documents, org relationships, memories) is touched or
  destroyed, the company just stops appearing as an active company until restored.
  "Restore [company]" / "un-delete [company]" / "bring back [company]" works the same way
  via restoreCompanyIds, and can target a company that is only resolvable from
  context.memories or conversation history (an archived company is not necessarily still
  in context.companies, since that list is the active-company view) — resolve it by name
  from whatever context you have rather than refusing. Never invent or guess an id for
  either field. The real outcome (archived / restored / denied / already in that state /
  not found) is reported back to you after this call actually runs and REPLACES whatever
  you say here — do not independently declare a company deleted or restored in your own
  words; only archiveCompanyIds/restoreCompanyIds actually attempting the action makes it
  real. If you cannot resolve which company the user means, say so and ask — do not put
  anything in these arrays and do not claim an action happened.
- "End employment"/"[person] no longer works here"/"remove [person] from the team"/
  "delete employee [person]" (ordinary language — NOT "delete [person]'s record" or
  anything that names their salary/KPI/performance history specifically) — put their real
  "id" from context.people into endEmploymentPersonIds. This ends their current work
  assignment(s) and marks them inactive; it does NOT delete their person record, salary
  history, or KPI history — there is no way to permanently delete a person from chat at
  all, that is a founder/admin-only action in the People page UI, never a chat capability.
  "Bring back [person]"/"restore [person]"/"re-hire [person]" works the same way via
  restoreEmploymentPersonIds. Never invent or guess an id — if you cannot resolve exactly
  one real person from context.people, use pendingAction (single_entity_clarification for
  one plausible candidate, disambiguation for more than one) instead of guessing. The real
  outcome (ended / restored / denied / already in that state / not found) is reported back
  to you after this call actually runs and REPLACES whatever you say here, same grounding
  discipline as archiveCompanyIds/restoreCompanyIds.
- You may create real projects and goals the same way — check context.projects /
  context.goals first, never duplicate. Every project and goal requires a company: use a
  real companyId from context.companies, or companyIndex into this response's own
  createCompanies array. If neither is available, create a clarification task instead of
  guessing which company it belongs to.
- "Delete"/"archive"/"remove" a goal (ordinary language, same reasoning as tasks above)
  means archiveGoalIds — put its real "id" from context.goals (context.goals carries no
  status filter, so an already-archived goal is still resolvable there for restore too).
  "Restore"/"un-archive" works the same way via restoreGoalIds, returning the goal to
  'active'. Both execute immediately, no approval needed — archiving destroys nothing.
  There is no separate hard-delete-goal field exposed to chat at all (unlike tasks) — a
  goal's real, permanent removal is a founder/admin-only action on the Goals page
  itself, not something chat can do. Never invent or guess an id; the real outcome
  replaces whatever you say here, same grounding discipline as archiveCompanyIds.
- You may create real departments, sales leads, and text-content documents directly, same
  low-risk treatment as companies/people/projects/goals above (none of these are on the
  high-risk list — deletion, financing, and external messaging are, plain CRM/org records
  are not). Check context.departments / context.leads / context.documents first, never
  duplicate. companyId/companyIndex works exactly like projects/goals above (a lead or
  department with no resolvable company is a clarification task instead of a guess — a
  document may skip company entirely, same as the manual "paste text" upload path, but
  still prefer a real company when one is clearly implied). createDocuments only supports
  pasted text content, never a real file attachment — chat cannot upload files; if the
  user is clearly describing an actual file they have, create a task asking them to
  attach it via the Documents page instead of inventing document content.
  updateDepartments/updateLeads may only reference an "id" literally present in
  context.departments/context.leads — same id-provenance rule as every other update/delete
  field in this schema; leave any field null to leave it unchanged rather than guessing.
- You may create/update/delete product lines, software specs (product_specs), and
  engineering drawings the same low-risk immediate way, check context.products /
  context.productSpecs / context.engineeringDrawings first, never duplicate, same
  companyId/companyIndex and id-provenance rules as above. Product lines: unitPrice is
  the only pricing field you may set — never propose a unitCost (that lives in a
  manager-only-visible cost table and is deliberately kept out of your context and out
  of your write path; a chat-created product line always gets cost left unset). Software
  specs: createProductSpecs mirrors the manual "Software Factory" flow exactly — it also
  creates 6 fixed engineering tickets and one production-domain release approval, not
  just the spec row alone; do not separately propose those same tickets as regular tasks.
  Engineering drawings: createEngineeringDrawings takes only a plain-language
  "description" — the real SVG is generated server-side by the same drawing-generation
  service the manual page uses, you never invent SVG content yourself.
- Distinct from createProductSpecs above (which only creates a spec/ticket row, never
  writes code): when the founder asks Brain OS to actually BUILD, FIX, or CHANGE
  something in Brain OS's own codebase (e.g. "build a partner revenue dashboard", "fix
  the bug where X", "add a page for Y") — a request for real autonomous coding agent
  work, not a spec ticket — use createFactoryWorkOrders instead. This creates a real,
  queued Work Order that Brain OS's own execution pipeline picks up separately and
  dispatches to a real, registered coding agent; it does NOT write any code itself and
  does NOT run synchronously in this turn. Never claim in your summary that the feature
  was built, that code was written, or that the change is live — you have no way to know
  that from this turn alone. A deterministic confirmation line is generated for you after
  this actually runs and FULLY REPLACES whatever you write in summary for this turn, so
  do not restate the Work Order's id or repeat your own "Work Order created" confirmation
  — it is dead weight the founder would just read twice. If you have nothing else to add,
  leave summary minimal; only add words here that the deterministic line doesn't already
  cover (why this scope, what the founder should expect to happen next). Every Work Order
  needs a real company (companyId from context.companies or companyIndex into this
  response's own createCompanies) and should reference a goal when one is clearly implied
  (goalId from context.goals or goalIndex into this response's own createGoals) — a Work
  Order with no resolvable company is a clarification task instead of a guess, same as
  every other company-scoped create above. workType defaults to "software_development" if
  omitted. If the request is genuinely ambiguous about scope (e.g. "make it better" with
  no specifics), ask a clarifying question instead of creating a vague Work Order —
  acceptanceCriteria should be concrete enough that an engineer could tell when it's done.
- When the founder asks about the status of a Work Order you or a prior turn created
  (e.g. "what happened with that work?", "did the dashboard get built?", "is it done
  yet?") — answer from context.factoryWorkOrders, which holds real, persisted state
  (status, taskCount, runCount, lastRunStatus, commitBearingRunCount, allCommitsVerified,
  lastRunVerificationStatus, lastRunSummary, lastRunHeadCommit) for the founder's real
  recent Work Orders, regardless of whether this is a fresh conversation with no memory of
  creating it. This is real, current truth from the database, not something you need
  conversationHistory for. Translate the real status into plain founder-facing language —
  NEVER repeat a raw database enum value like \`e2e_verified\` or \`in_progress\` in your
  own prose. Use exactly this vocabulary: "Created" (the record exists but no Work Order
  yet), "Queued" (status queued, no run started yet), "Running" (a run is in progress),
  "Waiting for approval" (status needs_approval), "Verifying" (\`commitBearingRunCount > 0\`
  but \`allCommitsVerified\` is false — real code changed but independent verification
  hasn't confirmed all of it yet), "Completed" (\`status: "done"\` — a Work Order can only
  ever reach this status once every commit it produced already passed independent
  verification, so \`allCommitsVerified\` is always true here by construction; trust
  \`status\` itself as the single source of truth for completion, never a separately
  re-derived signal), "Failed" (status blocked/rejected, or the run itself failed) — never
  round "Verifying" up to "done and verified", never say verification is missing or
  unconfirmed for a Work Order whose \`status\` is already "done", and never invent a
  status/commit/outcome that isn't literally present in context.factoryWorkOrders. Point
  the founder at the real destination for full detail — Brain OS's Software Factory
  dashboard (the "Agent Control Center" entry in the sidebar) — never call it "the
  Runner" or quote a raw internal path. If the founder specifically asks which commit,
  you may quote the first 7 characters of lastRunHeadCommit — never the full SHA, and
  never volunteer a commit hash unless asked. If the founder asks about a Work Order that
  isn't in this list at all (it may be older than the 10 most recent, or belong to a
  company you can't see), say you don't have it in view rather than guessing.
- Proposals are different: you may create a bare draft (title + company only, no pricing)
  via createProposals, and update only title/paymentTerms via updateProposals — never
  propose or infer subtotal/discount/total/status. Real proposal pricing runs a risk-
  scoring and margin calculation that only exists in the product's own UI (Proposal
  Factory) and would need real line items and cost data you don't have; a request that
  needs real numbers is a clarification task pointing at Proposal Factory, not a guess.
  You may deleteProposals (same id-provenance and immediate-deletion rule as tasks above).
- You may create/update AI providers (createAiProviders/activateAiProviderId) and delete
  AI providers or MCP connectors (deleteAiProviders/deleteMcpConnectors) — check
  context.aiProviders/context.mcpConnectors first. ai_providers carries no key/secret
  column by design, so none of this touches real credentials. You may NEVER create or
  update an MCP connector — that requires a real bearer token, and a token typed into
  this chat would transit your own context window and the plaintext command audit log,
  which is a real secret-leak class this product deliberately avoids; if the user wants
  to add one, create a task pointing them at Settings → MCP Connectors instead.
- You may record company ownership/parent relationships (createCompanyRelationships) and
  person work assignments (createPersonAssignments) — check context.companyRelationships /
  context.personAssignments first, never duplicate. CRITICAL: every relationship has a
  "state" of "current", "planned", "historical", or "under_restructuring", and it MUST
  default to "planned" — you may only use "current" when the user describes the
  relationship as already, today, legally true (e.g. "X is a subsidiary of Y", present
  tense, existing fact). Any future/intent language — "will become", "I will replace",
  "planning to", "going to" — is "planned", never "current". Never treat an intention as
  an already-completed legal transfer. When the owner is an individual rather than a
  company (e.g. the founder personally), use ownerProfileId set to exactly the calling
  profile.id provided in the input — never any other id — and leave relatedCompanyId/
  relatedCompanyIndex null; exactly one of the two must be set, never both, never neither.
  ownershipPct stays null unless the user states an actual number. For person assignments,
  personId/personIndex works like companyId/companyIndex (personIndex points at
  createPeople in this same response); leave any field null rather than guessing.
  A "current" company-to-company relationship is idempotent server-side — repeating the
  same "move X under Y" command is safe and will not create a duplicate.
- Companies carry an "organizationType": legal_entity (default — a real registered
  company), holding_company, subsidiary, business_unit, brand, department, or
  country_operation. "X is not a company, it's a business unit of Y" / "remove X from the
  company list, it belongs under Y" is TWO things together, not one: an updateCompanies
  entry setting X's organizationType to "business_unit" (or "brand"/"department" —
  whichever the user's own words imply), AND a createCompanyRelationships entry with
  relationshipType "business_unit_of" (or "brand_of"/"department_of"), state "current",
  companyId=X, relatedCompanyId=Y. Do only one half and the restructuring will look like a
  no-op to the founder even though something changed.
  "X is N% owned by Y" — plain legal ownership between two companies, X stays its own
  distinct legal entity — uses relationshipType "parent_of" with ownershipPct set (this is
  the existing convention already correctly used in production: SEM LLC's 100% ownership
  of SEM Global Robotics Technologies is recorded exactly this way). Use "subsidiary_of"
  instead only if the user explicitly calls X a subsidiary, not just "owned by."
  relationshipType "owned_by_percentage" is a DIFFERENT case — reserved for when the owner
  is an individual person (ownerProfileId set, relatedCompanyId left null), never for
  company-to-company ownership.
  DIRECTION MATTERS and reverses depending on the relationship name — read it as a literal
  sentence "companyId [relationshipType] relatedCompanyId": for "parent_of", companyId is
  the PARENT/owner and relatedCompanyId is the child/owned ("SEM LLC parent_of SEM GRT" —
  companyId=SEM LLC, relatedCompanyId=SEM GRT). For "business_unit_of"/"brand_of"/
  "subsidiary_of"/"department_of", companyId is the SUBORDINATE one and relatedCompanyId is
  the container ("CLIX GPS business_unit_of SEM LLC" — companyId=CLIX GPS,
  relatedCompanyId=SEM LLC). Get this backwards and the hierarchy inverts silently — always
  read the relationshipType name as the literal English sentence connecting the two ids.
- Every entry in context.companies and context.people carries a real "effectivelyActive"
  boolean — false means that company (or, for a person, their current employer) sits
  under an archived ancestor company, even if its own "status" field still reads
  active/planning/paused. Never treat effectivelyActive:false as a valid current employer
  or a normal operating company for "who works at X"/"is X still operating"/"where does
  [person] work" questions — say it's under an archived parent instead. A merely
  non-"active" status (planning, paused) with effectivelyActive:true is completely normal
  and not archived — do not conflate the two.
- Matching a name the founder types to a real record (context.companies[].name,
  context.people[].full_name, context.tasks[].title, context.goals[].title, etc.) is
  case-insensitive and quote-agnostic — "sem llc", "SEM LLC", and a quoted "SEM LLC" all
  match a company actually named "SEM LLC" the same way; strip surrounding quote
  characters before comparing. If the founder's phrase reads like it could be describing
  a TYPE ("business unit", "the subsidiary") rather than naming an entity, but it is ALSO
  an exact (case-insensitive) match for one real record's actual name in context, prefer
  the literal name match — do not read "test business unit" as a description of an
  organizationType when a company is literally named "Test Business Unit" and that's the
  only entity in context named anything close to it. If more than one record could
  plausibly match (two companies with overlapping names, a name that's genuinely
  ambiguous), do not guess — use pendingAction:{"kind":"disambiguation"} above instead of
  silently picking one.
- "Check [company]'s structure", "reconcile the organization", "fix inconsistent company
  references", or any request to audit/verify the org graph itself (not change it) sets
  checkOrganizationGraph — {companyId/companyIndex} for one company, or both null to check
  everything. This runs a real database query (validateOrganizationGraph) and the result
  gets appended to your response as verified fact — do not also describe hypothetical
  problems yourself; report only what that real result actually contains. Never set this
  alongside createCompanyRelationships/updateCompanies in the same turn — check first, let
  the founder act on the real findings next turn, don't guess-fix in the same breath as
  auditing.
- If context.conversationHistory is present, this command continues an existing topic —
  treat it as a real ongoing conversation, and refer back to it naturally when relevant.
  CRITICAL LIMIT (2026-08-30, real incident: a founder was told "the conversation history
  confirms you asked me to restore it, I did" about a company that was never actually
  restored — a real, live-reproduced defect, not a hypothetical): conversationHistory
  proves only what was ASKED or DISCUSSED in a prior turn, never that a mutation actually
  succeeded. A prior turn's own summary text is exactly that — text a prior turn wrote,
  not a database record. Before ever claiming something "already happened" or "was
  already restored/archived/updated," you MUST re-check the CURRENT, fresh data in this
  turn's own context (e.g. the real status field on the matching context.companies/tasks/
  goals/people entry, or this turn's own archiveRestoreReport-equivalent result) — never
  infer a successful mutation purely from your own or a prior turn's earlier prose.
  "Do not repeat an action you already took" still applies for genuinely idempotent,
  already-confirmed-via-fresh-data cases (e.g. the real current status already matches
  what was requested) — it does not mean trusting old prose as proof by itself.
- context.recentlyResolvedEntities (present only immediately after a turn that actually
  created, archived, or restored something) holds the real id+name of every company/
  person/goal created OR archived/restored in the PREVIOUS turn — {"companies":
  [{"id","name"}], "people": [{"id","name"}], "goals": [{"id","name"}]}. When the
  founder's very next message refers back to something you just touched — a compound
  follow-up ("create QA-CONTINUITY-CO and add a new employee there", "add a goal for that
  company"), OR a short pronoun reference to something you just archived/restored/ended
  employment for ("archive test3" then, next turn, "restore it" / "undo that" / "bring it
  back") — use the real id straight from context.recentlyResolvedEntities. This is a
  channel-focus continuity guarantee, not just a create-time convenience: real incident
  (2026-08-30, "test3 restore"), "archive test3" then "restore it" in the very next turn
  wrongly re-searched every archived company in the workspace and forced a three-way
  disambiguation instead of resolving to the one company you had JUST archived. Never
  re-derive an id by matching names out of your own prior prose, never ask the founder to
  repeat a company/person/goal they just told you to create/archive/restore in the same
  conversation, and never fall back to a broader disambiguation across unrelated
  candidates when context.recentlyResolvedEntities already names exactly what "it"/"that
  one" refers to. Only the immediately preceding turn counts; once something exists (or
  is back to its normal state) it also shows up in context.companies/context.people/
  context.goals directly, which take priority for anything older than one turn back.
- context.memories holds durable company facts retrieved from every past conversation
  (semantic search, not limited to this channel or this session) — treat these as
  already-known, verified context. Do not propose a memoryCandidate that restates one
  of them.
- Propose memoryCandidates for any new durable fact the user states in this conversation
  (a decision, a deadline, an org-structure detail, a policy) — these become permanently
  searchable company memory, not just chat history. Leave entityType/entityId unset to
  let it default to this conversation's channel; set companyId/companyIndex the same way
  as other entities when the fact is clearly about a specific company.

Output schema:
{
  "strategicGoal": string,
  "summary": string,
  "pendingAction": {"kind": "bulk_confirmation"|"single_entity_clarification"|"disambiguation"|"open_question", "summary": string|null, "action": object|null, "question": string|null, "candidateIds": [string]|null, "entityType": string|null, "actionType": "archive"|"restore"|null, "options": [{"label": string, "id": string, "entityType": string, "actionType": "archive"|"restore"|null}]|null}|null,
  "riskLevel": "low"|"medium"|"high"|"critical",
  "tasks": [
    {
      "title": string,
      "description": string,
      "companyId": string|null,
      "projectId": string|null,
      "ownerType": "agent"|"human",
      "ownerAgentId": string|null,
      "ownerPersonId": string|null,
      "priority": "low"|"medium"|"high"|"critical",
      "riskLevel": "low"|"medium"|"high"|"critical",
      "approvalRequired": boolean,
      "acceptanceCriteria": [string],
      "testMethod": [string]
    }
  ],
  "deleteTaskIds": [string],
  "archiveTaskIds": [string],
  "restoreTaskIds": [string],
  "deleteChannelIds": [string],
  "deleteApprovalIds": [string],
  "pendingDeleteTaskIds": [string],
  "pendingDeleteChannelIds": [string],
  "createCompanies": [
    {"name": string, "country": string|null, "legalEntityName": string|null, "description": string|null, "organizationType": "legal_entity"|"holding_company"|"subsidiary"|"business_unit"|"brand"|"department"|"country_operation"|null}
  ],
  "updateCompanies": [
    {"id": string, "name": string|null, "country": string|null, "legalEntityName": string|null, "status": string|null, "organizationType": "legal_entity"|"holding_company"|"subsidiary"|"business_unit"|"brand"|"department"|"country_operation"|null}
  ],
  "archiveCompanyIds": [string],
  "restoreCompanyIds": [string],
  "createPeople": [
    {"fullName": string, "email": string|null, "roleTitle": string|null, "companyId": string|null, "companyIndex": number|null}
  ],
  "endEmploymentPersonIds": [string],
  "restoreEmploymentPersonIds": [string],
  "createProjects": [
    {"title": string, "companyId": string|null, "companyIndex": number|null, "goal": string|null, "deadline": string|null, "blockers": string|null}
  ],
  "createGoals": [
    {"title": string, "companyId": string|null, "companyIndex": number|null, "description": string|null, "kind": "ephemeral"|"standing"|"routine"|"decision"|null, "status": "draft"|"active"|"paused"|"achieved"|null, "dueAt": string|null}
  ],
  "archiveGoalIds": [string],
  "restoreGoalIds": [string],
  "createFactoryWorkOrders": [
    {"title": string, "objective": string|null, "companyId": string|null, "companyIndex": number|null, "goalId": string|null, "goalIndex": number|null, "workType": "general"|"software_development"|"sales"|"operations"|"service"|"finance"|"engineering"|null, "priority": "low"|"medium"|"high"|"critical"|null, "acceptanceCriteria": [string]}
  ],
  "createDepartments": [
    {"name": string, "companyId": string|null, "companyIndex": number|null}
  ],
  "updateDepartments": [
    {"id": string, "name": string|null, "companyId": string|null, "companyIndex": number|null}
  ],
  "createLeads": [
    {"clientName": string, "companyId": string|null, "companyIndex": number|null, "contactName": string|null, "contactEmail": string|null, "stage": string|null, "valueEstimate": number|null}
  ],
  "updateLeads": [
    {"id": string, "clientName": string|null, "contactName": string|null, "contactEmail": string|null, "stage": string|null, "valueEstimate": number|null}
  ],
  "createDocuments": [
    {"title": string, "companyId": string|null, "companyIndex": number|null, "category": string|null, "sensitivity": "public"|"internal"|"confidential"|"restricted"|"founder_only"|null, "text": string}
  ],
  "createProductLines": [
    {"name": string, "companyId": string|null, "companyIndex": number|null, "currency": string|null, "unitPrice": number|null}
  ],
  "updateProductLines": [
    {"id": string, "name": string|null, "unitPrice": number|null, "active": boolean|null}
  ],
  "deleteProductLineIds": [string],
  "createProductSpecs": [
    {"title": string, "companyId": string|null, "companyIndex": number|null, "problem": string|null}
  ],
  "updateProductSpecs": [
    {"id": string, "title": string|null, "status": string|null, "bodyMd": string|null}
  ],
  "deleteProductSpecIds": [string],
  "createEngineeringDrawings": [
    {"description": string, "companyId": string|null, "companyIndex": number|null}
  ],
  "deleteEngineeringDrawingIds": [string],
  "createAiProviders": [
    {"provider": string, "model": string, "label": string|null}
  ],
  "activateAiProviderId": string,
  "deleteAiProviderIds": [string],
  "deleteMcpConnectorIds": [string],
  "createProposals": [
    {"title": string, "companyId": string|null, "companyIndex": number|null}
  ],
  "updateProposals": [
    {"id": string, "title": string|null, "paymentTerms": string|null}
  ],
  "deleteProposalIds": [string],
  "createCompanyRelationships": [
    {"companyId": string|null, "companyIndex": number|null, "relatedCompanyId": string|null, "relatedCompanyIndex": number|null, "ownerProfileId": string|null, "relationshipType": "parent_of"|"owned_by_percentage"|"business_unit_of"|"brand_of"|"subsidiary_of"|"department_of"|null, "ownershipPct": number|null, "state": "current"|"planned"|"historical"|"under_restructuring", "effectiveDate": string|null, "notes": string|null}
  ],
  "createPersonAssignments": [
    {"personId": string|null, "personIndex": number|null, "legalEmployerCompanyId": string|null, "legalEmployerCompanyIndex": number|null, "operatingCompanyId": string|null, "operatingCompanyIndex": number|null, "departmentId": string|null, "jobTitle": string|null, "managerPersonId": string|null, "managerPersonIndex": number|null, "employmentType": "full_time"|"part_time"|"contractor"|"advisor"|null, "allocationPct": number|null, "startDate": string|null, "endDate": string|null, "isPrimary": boolean|null, "responsibilities": string|null, "state": "current"|"planned"|"historical"|null}
  ],
  "checkOrganizationGraph": {"companyId": string|null, "companyIndex": number|null}|null,
  "approvals": [
    {"title": string, "reason": string, "riskLevel": "medium"|"high"|"critical", "taskIndex": number|null}
  ],
  "memoryCandidates": [
    {"entityType": string|null, "entityId": string|null, "fact": string, "confidence": number, "sensitivity": "public"|"internal"|"confidential"|"restricted"|"founder_only", "companyId": string|null, "companyIndex": number|null}
  ]
}`;

function json(data: unknown, status=200){ return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }

// Claude/GPT sometimes wrap "strict JSON only" replies in a markdown code fence anyway.
// Strip one if present before parsing, rather than failing the whole command.
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

// On a long/complex command the model sometimes adds a sentence of preamble or
// trailing commentary around the JSON despite "strict JSON only, no markdown" — grab the
// outermost {...} object rather than giving up the whole command over stray prose.
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

// Tries stripCodeFence as-is first (the common case), then falls back to extracting the
// outermost JSON object before giving up. Throws the original parse error if both fail.
function parseModelJson(rawText: string): unknown {
  const fenceStripped = stripCodeFence(rawText);
  try {
    return JSON.parse(fenceStripped);
  } catch (firstError) {
    try {
      return JSON.parse(extractJsonObject(fenceStripped));
    } catch {
      throw firstError;
    }
  }
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Reads a provider's SSE response body, calling onEvent(parsedJson) per `data:` line.
 * Tolerant of chunk boundaries not aligning with SSE frames, and of individual
 * malformed frames (skipped, not fatal — one bad frame shouldn't kill the stream).
 */
// AbortSignal.timeout on the initial fetch only guards connection setup — once headers
// are back and we're reading the body, an already-open stream that stalls (no more
// chunks, no terminal event) does NOT get cut off by that signal in the Supabase Deno
// edge runtime. Verified live: a gpt-5.6-sol request sat with a 200 response but a
// stalled body for 2+ minutes, well past the 90s fetch timeout, and never resolved.
// This per-read idle timeout is the actual backstop — it races each individual
// reader.read() against a timer that resets on every chunk received, so a slow-but-live
// generation is unaffected but a genuinely stalled stream is killed within idleTimeoutMs.
async function readWithTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  timeoutMs: number
): Promise<ReadableStreamReadResult<T>> {
  let timer: number;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Stream stalled — no data received for ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

async function consumeSSE(
  response: Response,
  onEvent: (data: any) => void,
  idleTimeoutMs = 30000,
  overallTimeoutMs = 60000
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + overallTimeoutMs;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Stream exceeded overall ${Math.round(overallTimeoutMs / 1000)}s budget without completing`);
      }
      const { done, value } = await readWithTimeout(reader, Math.min(idleTimeoutMs, remaining));
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          onEvent(JSON.parse(payload));
        } catch {
          // skip malformed frame
        }
      }
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
}

// AbortSignal.timeout alone proved unreliable for a large-body request to
// api.openai.com in this Supabase Deno edge runtime — verified live: a real
// (multi-KB context) request sat with zero response for 8+ minutes despite a
// signal: AbortSignal.timeout(90000) on the same fetch() call. This manual
// race is the real backstop; the AbortSignal is kept alongside it (harmless,
// occasionally fires first) rather than removed.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  let timer: number;
  try {
    return await Promise.race([
      fetch(url, init),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} request timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

type Usage = { input_tokens?: number; output_tokens?: number };
type StreamResult = { text: string; stopReason: string | null };
type AttachedImage = { base64: string; mimeType: string } | null;

async function callAnthropicStreaming(
  model: string,
  key: string,
  contextForModel: unknown,
  onDelta: (text: string) => void,
  onUsage: (usage: Usage) => void,
  image: AttachedImage = null
): Promise<StreamResult> {
  const textBlock = { type: 'text', text: JSON.stringify(contextForModel, null, 2) };
  const content = image
    ? [{ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } }, textBlock]
    : textBlock.text;
  let r: Response;
  try {
    r = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        temperature: 0.2,
        stream: true,
      }),
      signal: AbortSignal.timeout(90000),
    }, 90000, 'Anthropic');
  } catch (e: any) {
    throw { status: 504, body: { error: { message: e?.message || String(e) } } };
  }
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw { status: r.status, body: errBody };
  }
  let accumulated = "";
  let stopReason: string | null = null;
  let apiError: string | null = null;
  await consumeSSE(r, (evt) => {
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && typeof evt.delta.text === 'string') {
      accumulated += evt.delta.text;
      onDelta(evt.delta.text);
    } else if (evt.type === 'message_start' && evt.message?.usage) {
      onUsage({ input_tokens: evt.message.usage.input_tokens, output_tokens: evt.message.usage.output_tokens });
    } else if (evt.type === 'message_delta' && evt.usage) {
      onUsage({ output_tokens: evt.usage.output_tokens });
      if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
    } else if (evt.type === 'error' && !apiError) {
      apiError = evt.error?.message || 'Anthropic request failed mid-stream';
    }
  });
  if (apiError) throw { status: 502, body: { error: { message: apiError } } };
  return { text: accumulated, stopReason };
}

async function callOpenAIStreaming(
  model: string,
  key: string,
  contextForModel: unknown,
  onDelta: (text: string) => void,
  onUsage: (usage: Usage) => void,
  image: AttachedImage = null
): Promise<StreamResult> {
  const textBlock = { type: 'input_text', text: JSON.stringify(contextForModel, null, 2) };
  const userContent = image
    ? [{ type: 'input_image', image_url: `data:${image.mimeType};base64,${image.base64}`, detail: 'auto' }, textBlock]
    : textBlock.text;
  // Reasoning-tier models (the gpt-5 family, verified live against api.openai.com: gpt-5,
  // gpt-5-mini, gpt-5-nano, gpt-5-pro, gpt-5.6-sol/terra/luna) reject `temperature`
  // outright with a 400 "Unsupported parameter" — only the gpt-4.x family accepts it.
  const supportsTemperature = !/^gpt-5/.test(model);
  let r: Response;
  try {
    r = await fetchWithTimeout('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_output_tokens: 8192,
        ...(supportsTemperature ? { temperature: 0.2 } : {}),
        stream: true,
      }),
      signal: AbortSignal.timeout(90000),
    }, 90000, 'OpenAI');
  } catch (e: any) {
    throw { status: 504, body: { error: { message: e?.message || String(e) } } };
  }
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw { status: r.status, body: errBody };
  }
  let accumulated = "";
  let stopReason: string | null = null;
  let apiError: string | null = null;
  await consumeSSE(r, (evt) => {
    if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') {
      accumulated += evt.delta;
      onDelta(evt.delta);
    } else if (evt.type === 'response.completed' && evt.response?.usage) {
      onUsage({ input_tokens: evt.response.usage.input_tokens, output_tokens: evt.response.usage.output_tokens });
    } else if (evt.type === 'response.incomplete' && evt.response?.incomplete_details?.reason) {
      stopReason = evt.response.incomplete_details.reason;
    } else if ((evt.type === 'response.failed' || evt.type === 'error') && !apiError) {
      apiError = evt.response?.error?.message || evt.error?.message || evt.message || 'OpenAI request failed mid-stream';
    }
  });
  if (apiError) throw { status: 502, body: { error: { message: apiError } } };
  return { text: accumulated, stopReason };
}

// Deterministic $/token lookup — no reason to call an LLM to estimate its own cost.
// [inputPer1M, outputPer1M] in USD. Mirrors web/lib/usage/pricing.ts's MODEL_CATALOG —
// update both if pricing changes.
const PRICING_PER_1M: Record<string, [number, number]> = {
  // Current selectable catalog — snapshot 2026-08-24.
  'gpt-5.6-sol': [5.0, 30.0],
  'gpt-5.6-terra': [2.0, 12.0],
  'gpt-5.6-luna': [0.2, 1.2],
  'claude-fable-5': [10.0, 50.0],
  'claude-opus-5': [5.0, 25.0],
  'claude-sonnet-5': [2.0, 10.0],
  'claude-haiku-4-5': [1.0, 5.0],
  // Legacy rows kept billable — a real ai_providers row can still reference these.
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1': [2.0, 8.0],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10.0],
  'gpt-5-nano': [0.05, 0.4],
  'gpt-5-mini': [0.25, 2.0],
  'gpt-5': [1.25, 10.0],
  'gpt-5-pro': [15.0, 120.0],
  'claude-sonnet-4-6': [3.0, 15.0],
};
function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING_PER_1M[model];
  if (!rates) return 0;
  const [inRate, outRate] = rates;
  return (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
}

// Real semantic retrieval (migration 202608260008). Always uses OpenAI regardless of
// which provider is active for chat completions — text-embedding-3-small produces 1536
// dims, matching the memories.embedding column exactly. Never throws: any failure
// (missing key, network, bad response) degrades to a null embedding per input rather
// than failing the whole chat command.
async function embedTexts(texts: string[], key: string | undefined): Promise<(number[] | null)[]> {
  if (!key || texts.length === 0) return texts.map(() => null);
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
    });
    if (!r.ok) return texts.map(() => null);
    const body = await r.json();
    const byIndex = new Map<number, number[]>();
    for (const item of body.data || []) {
      if (typeof item.index === 'number' && Array.isArray(item.embedding)) byIndex.set(item.index, item.embedding);
    }
    return texts.map((_, i) => byIndex.get(i) ?? null);
  } catch {
    return texts.map(() => null);
  }
}
async function embedText(text: string, key: string | undefined): Promise<number[] | null> {
  const [result] = await embedTexts([text], key);
  return result;
}

type ProviderRow = { provider: 'openai' | 'anthropic'; model: string };
async function getActiveProvider(supabase: any): Promise<ProviderRow | null> {
  const { data } = await supabase
    .from('ai_providers')
    .select('provider,model')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Server-side backstop: the system prompt ASKS the model to flag these categories as
// approvalRequired, but prompt instructions are not a security boundary. Any task whose
// title/description mentions one of these risk categories is force-flagged for approval
// here, regardless of what the model returned. Each keyword also maps to an approval
// "domain" (public.approval_domain, added by the 202608230001 migration) so the RLS
// approvals_update_approver policy can route salary/finance/legal approvals to the right
// authority instead of letting any company manager approve everything.
type ApprovalDomain = "general"|"salary_hr"|"finance"|"legal"|"production"|"external_comms";
const FORCED_APPROVAL_KEYWORDS: Array<{ keyword:string; domain:ApprovalDomain }> = [
  { keyword:'salary', domain:'salary_hr' }, { keyword:'wage', domain:'salary_hr' }, { keyword:'wages', domain:'salary_hr' },
  { keyword:'compensation', domain:'salary_hr' }, { keyword:'payroll', domain:'salary_hr' }, { keyword:'bonus', domain:'salary_hr' }, { keyword:'raise', domain:'salary_hr' },
  { keyword:'payment', domain:'finance' }, { keyword:'invoice', domain:'finance' }, { keyword:'refund', domain:'finance' }, { keyword:'payout', domain:'finance' },
  { keyword:'wire transfer', domain:'finance' }, { keyword:'bank transfer', domain:'finance' },
  { keyword:'discount', domain:'finance' }, { keyword:'price reduction', domain:'finance' }, { keyword:'markdown', domain:'finance' },
  { keyword:'barter', domain:'finance' }, { keyword:'trade-in', domain:'finance' }, { keyword:'in-kind', domain:'finance' },
  { keyword:'financing', domain:'finance' }, { keyword:'loan', domain:'finance' }, { keyword:'credit line', domain:'finance' }, { keyword:'investment', domain:'finance' },
  { keyword:'contract', domain:'legal' }, { keyword:'agreement', domain:'legal' }, { keyword:'nda', domain:'legal' }, { keyword:'legal', domain:'legal' },
  { keyword:'publish', domain:'production' }, { keyword:'publication', domain:'production' }, { keyword:'press release', domain:'production' }, { keyword:'public post', domain:'production' },
  { keyword:'go live', domain:'production' }, { keyword:'production deploy', domain:'production' }, { keyword:'deploy to production', domain:'production' },
  { keyword:'delete', domain:'production' }, { keyword:'deletion', domain:'production' }, { keyword:'remove permanently', domain:'production' }, { keyword:'purge', domain:'production' },
  { keyword:'external email', domain:'external_comms' }, { keyword:'send email to client', domain:'external_comms' },
  { keyword:'message the client', domain:'external_comms' }, { keyword:'dm the customer', domain:'external_comms' }, { keyword:'slack the client', domain:'external_comms' }
];
function detectForcedApprovalMatches(title:string, description:string){
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  return FORCED_APPROVAL_KEYWORDS.filter(k => text.includes(k.keyword));
}
// SECURITY_INVARIANTS.md #7 / governance's "no floor validation at write time" gap:
// memoryCandidates' sensitivity is entirely model-assigned, with nothing server-side
// double-checking it against the actual content — the model could tag a salary/cash fact
// 'public' and it would be stored and shown that broadly. Same defensive pattern as
// FORCED_APPROVAL_KEYWORDS above: never trust the model's own risk self-assessment for a
// keyword-matched sensitive category. Upgrade-only (never downgrades a stricter tier the
// model already chose) and only ever raises to 'confidential' — memories_select_scope has
// no separate branch for 'restricted'/'founder_only', so those stay founder-only-visible
// by the policy's own default, which is already the strictest possible outcome.
const MEMORY_SENSITIVITY_FLOOR_KEYWORDS = [
  'salary','wage','wages','compensation','payroll','bonus amount','base pay',
  'cash balance','bank account','revenue','net income','profit margin','burn rate',
  'ownership','equity stake','cap table','shareholder','ssn','social security',
  'passport number','legal dispute','lawsuit','termination','fired','layoff',
];
function detectMemorySensitivityFloor(fact: string): 'confidential' | null {
  const text = fact.toLowerCase();
  return MEMORY_SENSITIVITY_FLOOR_KEYWORDS.some(k => text.includes(k)) ? 'confidential' : null;
}
const SENSITIVITY_RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3, founder_only: 4 };
function detectForcedApprovalKeywords(title:string, description:string){
  return detectForcedApprovalMatches(title, description).map(m => m.keyword);
}
// First matched domain wins; 'general' if no keyword matched (e.g. model set approvalRequired itself).
function detectApprovalDomain(title:string, description:string): ApprovalDomain {
  const matches = detectForcedApprovalMatches(title, description);
  return matches.length ? matches[0].domain : 'general';
}
function fallbackPlan(command:string, contextPack:any){
  const lower = command.toLowerCase();
  const companyId = contextPack?.companies?.[0]?.id || null;
  const agent = (role:string)=> (contextPack?.agents||[]).find((a:any)=>String(a.role||'').includes(role))?.id || null;
  const tasks:AiTask[] = [];
  if(lower.includes('proposal') || lower.includes('quotation') || lower.includes('quote')){
    tasks.push({title:'Prepare proposal and quotation package',description:command,companyId,ownerType:'agent',ownerAgentId:agent('proposal'),priority:'high',riskLevel:'medium',approvalRequired:true,acceptanceCriteria:['Quotation total calculated','Proposal draft created','Approval gate created'],testMethod:['Review proposal fields','Check discount/margin rules']});
  } else if(lower.includes('kpi') || lower.includes('salary')){
    tasks.push({title:'Review KPI and create salary-impact recommendation for approval',description:command,companyId,ownerType:'agent',ownerAgentId:agent('people'),priority:'high',riskLevel:'high',approvalRequired:true,acceptanceCriteria:['KPI evidence reviewed','Salary change not executed automatically'],testMethod:['Approval exists before salary impact']});
  } else if(lower.includes('software') || lower.includes('ticket') || lower.includes('prd')){
    tasks.push({title:'Create software factory work package',description:command,companyId,ownerType:'agent',ownerAgentId:agent('software'),priority:'high',riskLevel:'medium',approvalRequired:false,acceptanceCriteria:['PRD created','Atomic tickets created','QA cases created'],testMethod:['QA checks ticket completeness']});
  } else {
    tasks.push({title:'Create CEO operating brief and follow-up tasks',description:command,companyId,ownerType:'agent',ownerAgentId:agent('chief'),priority:'high',riskLevel:'low',approvalRequired:false,acceptanceCriteria:['Blockers identified','Tasks created','Founder decisions listed'],testMethod:['QA checks brief completeness']});
  }
  return { strategicGoal:'Execute founder command through Brain OS v0.7 fallback planner', summary:'Fallback planner created tasks because AI provider is not configured or failed.', riskLevel: tasks.some(t=>t.riskLevel==='high')?'high':'medium', tasks, approvals: tasks.filter(t=>t.approvalRequired).map((t,i)=>({title:`Approval required: ${t.title}`, reason:'Risk policy requires human approval.', riskLevel:t.riskLevel||'medium', taskIndex:i})), memoryCandidates: [] };
}

async function buildContext(supabase:any, command:string, channelId: string | null, openaiKey: string | undefined){
  // Database-first, compact context. RLS applies because this client uses the caller JWT.
  const q = command.toLowerCase();
  const queryEmbedding = await embedText(command, openaiKey);
  // Real semantic retrieval when embeddings are available (match_memories, migration
  // 202608260008); degrades to the original ILIKE substring match otherwise — company
  // knowledge lookup must never be the reason a chat command fails.
  // pgvector RPC params round-trip as text over PostgREST — "[0.1,0.2,...]", not a raw
  // JS array.
  const memoriesQuery = queryEmbedding
    ? supabase.rpc('match_memories', { query_embedding: `[${queryEmbedding.join(',')}]`, match_count: 8 })
    : supabase.from('memories').select('id,company_id,entity_type,entity_id,fact,confidence,sensitivity').or(`fact.ilike.%${q.slice(0,60).replace(/[%,()]/g,' ')}%,entity_type.ilike.%company%`).limit(20);
  // Short-term continuity: the last few turns in this same channel, chronological.
  // Separate from relevantMemories (long-term, cross-channel, semantic) by design.
  // Same ordering defect as web/lib/data/chat-history.ts (fixed alongside this one, see
  // its comment for the full explanation): PostgREST applies LIMIT after ORDER BY, so
  // ascending+limit(8) fetched the OLDEST 8 turns, not the most recent 8, for any channel
  // with more than 8 turns of history — the model was reasoning from stale
  // early-conversation context instead of what was actually just said. Fetch newest-first
  // so LIMIT keeps the newest 8; reversed back to chronological order right below, where
  // the rows are actually consumed, so `conversationHistory` and `lastTurnOutput` (which
  // depends on the true last turn being last) keep their existing chronological-order
  // semantics unchanged.
  const conversationHistoryQuery = channelId
    ? supabase.from('work_orders').select('command,output').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(8)
    : Promise.resolve({ data: [], error: null });
  const TASK_STATUSES = ['queued','in_progress','blocked','needs_approval'];
  const [companies, projects, tasks, memories, agents, products, inventory, approvals, people, goals, companyRelationships, personAssignments, financialReports, conversationRows, factoryWorkOrdersRaw, channels,
    departments, leads, documents, proposals, productSpecs, engineeringDrawings, aiProviders, mcpConnectors,
    tasksCount, approvalsCount, companiesCount, peopleCount, projectsCount, goalsCount, salesLeadsCount, inventoryCount, channelsCount, departmentsCount, documentsCount,
    archivedTasks] = await Promise.all([
    supabase.from('companies').select('id,name,status,organization_type,strategic_priority,risk_score').limit(12),
    supabase.from('projects').select('id,company_id,title,status,deadline,blockers,risk_score').limit(20),
    supabase.from('tasks').select('id,company_id,project_id,title,status,priority,risk_level,approval_required,deadline').in('status',TASK_STATUSES).limit(30),
    memoriesQuery,
    supabase.from('agents').select('id,name,role,skills,cost_limit_usd').eq('active', true).limit(20),
    // unit_cost intentionally not selected — it lives in product_costs now (manager+
    // RLS), not on product_lines itself. The AI's context must not carry cost/margin
    // data for a caller who couldn't otherwise read it.
    supabase.from('product_lines').select('id,company_id,name,currency,unit_price,service_fee_monthly,active').eq('active', true).limit(20),
    supabase.from('inventory_items').select('id,company_id,product_line_id,sku,quantity_on_hand,reserved_quantity,reorder_point,location').limit(20),
    supabase.from('approvals').select('id,company_id,title,status,risk_level,reason').eq('status','pending').limit(20),
    supabase.from('people').select('id,full_name,email,role_title,company_id').limit(30),
    supabase.from('goals').select('id,company_id,title,status,kind').limit(20),
    // RLS-gated to founder/admin — a non-founder caller simply gets [] back, no special
    // casing needed here.
    supabase.from('company_relationships').select('id,company_id,related_company_id,owner_profile_id,relationship_type,ownership_pct,state').limit(20),
    supabase.from('person_assignments').select('id,person_id,legal_employer_company_id,operating_company_id,manager_person_id,job_title,state').limit(30),
    // RLS-gated to founder/admin or is_company_manager(company_id) — a technician's own
    // RLS-scoped client gets [] back here, same "no special casing" pattern as
    // company_relationships above. This is the actual security boundary the founder's
    // "technician asking for revenue should not reply" requirement depends on: the model
    // never receives restricted rows in the first place, rather than being told not to
    // repeat them.
    supabase.from('financial_reports').select('id,company_id,period,revenue,expenses,net_income,cash_position,health_status,summary').order('created_at', { ascending: false }).limit(20),
    conversationHistoryQuery,
    // Phase 8: real, persisted Software Factory state - so a fresh chat context can
    // answer "what happened with that work?" from actual canonical_work_orders/tasks/
    // agent_runs, never from conversation memory or invented status. RLS-scoped exactly
    // like every other query above (canonical_work_orders_select_scope) - no special
    // casing. Deliberately a compact summary (title/status/task+run counts/last run
    // outcome), not the full detail the /software-factory UI shows - this is chat
    // context, not a dashboard dump.
    supabase.from('canonical_work_orders')
      .select('id,title,objective,status,work_type,company_id,goal_id,created_at,tasks(id,status),agent_runs(status,verification_status,summary,head_commit,created_at)')
      .order('created_at', { ascending: false })
      .limit(10),
    // Brain OS's own chat_channels — so the model knows these are internal conversation
    // threads it can be asked to delete, not an external platform (Slack/Teams/Discord)
    // it has no access to.
    // company_id included so a primary-company can be derived for KNOWN_FAILURE_MODES #7
    // (company_id backfill on work_orders/chat_channels/audit_logs) — see
    // derivePrimaryCompanyId() below.
    supabase.from('chat_channels').select('id,name,company_id').eq('archived', false).limit(30),
    // Low-risk, chat-creatable/editable entities (createDepartments/updateDepartments,
    // createLeads/updateLeads, createDocuments) — same "check context first, never
    // duplicate" and id-provenance discipline as every other entity above. Documents:
    // no extracted_text/summary here — content isn't needed to avoid a title/category
    // duplicate, and keeping it out holds the same "no restricted content enters the
    // model's context beyond what it needs" line already drawn for financial_reports.
    supabase.from('departments').select('id,name,company_id').limit(30),
    supabase.from('sales_leads').select('id,client_name,company_id,stage,value_estimate').limit(30),
    supabase.from('documents').select('id,title,company_id,category').limit(30),
    // Proposals: id/title/company/status only for id-provenance + duplicate checks —
    // subtotal/discount_pct/total/internal_margin deliberately excluded from context.
    // Chat only ever creates a bare draft (no pricing) and updates title/payment terms;
    // the real risk-scored pricing flow (createProposal, lib/proposals/risk-score.ts)
    // only exists in the Next.js app, not duplicated here.
    supabase.from('proposals').select('id,title,company_id,status').limit(20),
    supabase.from('product_specs').select('id,title,company_id,status').limit(20),
    supabase.from('engineering_drawings').select('id,title,company_id').limit(20),
    // ai_providers has no key column by design (founder's explicit choice, see
    // web/CLAUDE.md) — provider/model/label/is_active carry no secret, safe in context.
    supabase.from('ai_providers').select('id,provider,model,label,is_active').limit(10),
    // mcp_connectors: name/endpoint only, never vault_secret_id — chat can delete a
    // connector by id but can never create/update one (that requires typing a bearer
    // token, which would transit the chat message, the LLM's own context, and the
    // plaintext work_orders.command audit column — a real secret-leak pattern, not just
    // caution; see qa/scenarios/core/audit/SC-104-log-secret-leak.md for the same class
    // of concern this codebase already tracks elsewhere).
    supabase.from('mcp_connectors').select('id,name,endpoint_url').limit(10),
    // Real aggregate counts, deliberately separate from the (necessarily truncated)
    // arrays above. head:true means no rows are fetched — this is a cheap COUNT, not a
    // second copy of the data. CLAUDE.md §6/§26: the model must never infer a total from
    // counting a limited context array (confirmed live bug: reported "20 approvals" —
    // the .limit(20) cap — when the real total was 75). Same RLS applies to a count
    // query as a row query, so a technician's counts are scoped exactly like their rows.
    supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status',TASK_STATUSES),
    supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status','pending'),
    supabase.from('companies').select('id', { count: 'exact', head: true }),
    supabase.from('people').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('goals').select('id', { count: 'exact', head: true }),
    supabase.from('sales_leads').select('id', { count: 'exact', head: true }),
    supabase.from('inventory_items').select('id', { count: 'exact', head: true }),
    // Found live 2026-08-27: the model correctly noticed channels had no count and
    // said so rather than guessing ("context.counts does not include a channel
    // total, so I cannot confirm this is the complete list") — same truncation-as-
    // total risk class as the other counts above, just missed when those were added.
    supabase.from('chat_channels').select('id', { count: 'exact', head: true }).eq('archived', false),
    supabase.from('departments').select('id', { count: 'exact', head: true }),
    supabase.from('documents').select('id', { count: 'exact', head: true }),
    // context.tasks above is deliberately scoped to in-flight statuses only (see
    // TASK_STATUSES) - an archived task is never in it, so restoreTaskIds would have
    // nothing to resolve from without this separate, small, recent-archived query. Goals
    // need no equivalent: context.goals already carries no status filter.
    supabase.from('tasks').select('id,company_id,title').eq('status','archived').order('updated_at',{ascending:false}).limit(15),
  ]);
  // Restore chronological order (oldest-of-the-kept-8 first) for consumption below — the
  // fetch above deliberately went newest-first so LIMIT kept the right 8 rows.
  const conversationRowsChronological = conversationRows.data ? [...conversationRows.data].reverse() : conversationRows.data;
  const conversationHistory = (conversationRowsChronological || []).map((r:any) => ({ command: r.command, summary: r.output?.summary || null }));
  const counts = {
    tasksShown: (tasks.data||[]).length, tasksTotal: tasksCount.count ?? (tasks.data||[]).length,
    approvalsShown: (approvals.data||[]).length, approvalsTotal: approvalsCount.count ?? (approvals.data||[]).length,
    companiesTotal: companiesCount.count ?? (companies.data||[]).length,
    peopleTotal: peopleCount.count ?? (people.data||[]).length,
    projectsTotal: projectsCount.count ?? (projects.data||[]).length,
    goalsTotal: goalsCount.count ?? (goals.data||[]).length,
    salesLeadsShown: (leads.data||[]).length, salesLeadsTotal: salesLeadsCount.count ?? (leads.data||[]).length,
    inventoryItemsTotal: inventoryCount.count ?? (inventory.data||[]).length,
    channelsShown: (channels.data||[]).length, channelsTotal: channelsCount.count ?? (channels.data||[]).length,
    departmentsShown: (departments.data||[]).length, departmentsTotal: departmentsCount.count ?? (departments.data||[]).length,
    documentsShown: (documents.data||[]).length, documentsTotal: documentsCount.count ?? (documents.data||[]).length,
  };
  // Pending action state (Workstream 3 — generalizes the old bulk-confirmation-only
  // mechanism into 4 kinds: bulk_confirmation, single_entity_clarification,
  // disambiguation, open_question). The previous turn in this channel may have asked the
  // founder a question that needs a structured answer instead of executing right away —
  // its exact payload rides along in that turn's own work_orders.output, no new table
  // needed. Only the LAST turn counts as "awaiting an answer"; once a turn executes (or
  // the founder moves on to something else), the newest output has no pendingAction and
  // this naturally reads as null again — that's the whole idempotency mechanism, see the
  // deterministic short-circuit in serve() below.
  // Back-compat: a turn persisted under the OLD pendingConfirmation-only shape (no
  // "kind") before this generalization still resolves correctly here — read as an
  // equivalent bulk_confirmation rather than silently dropped mid-conversation.
  // Reads conversationRowsChronological (not conversationRows.data directly) — the
  // ordering fix above fetches newest-first for the LIMIT to keep the right rows, so
  // "last element" only means "most recent turn" against the reversed, chronological
  // array; conversationRows.data itself is now newest-first and would silently make this
  // pick the OLDEST of the kept window instead.
  const lastTurnOutput = conversationRowsChronological?.[conversationRowsChronological.length - 1]?.output as {
    pendingAction?: PendingAction | null;
    pendingConfirmation?: { summary?: string; action?: Record<string, unknown> } | null;
    resolvedEntities?: ResolvedEntities | null;
  } | undefined;
  const legacyPendingConfirmation = lastTurnOutput?.pendingConfirmation;
  const pendingAction: PendingAction | null = lastTurnOutput?.pendingAction
    ?? (legacyPendingConfirmation && typeof legacyPendingConfirmation === 'object'
      ? { kind: 'bulk_confirmation', summary: legacyPendingConfirmation.summary, action: legacyPendingConfirmation.action }
      : null);
  // Workstream 3c: real id+name of anything created LAST turn, so a compound follow-up
  // command ("create QA-CONTINUITY-CO and add a new employee there") can thread the real
  // id straight through instead of the model re-deriving it from its own prior prose.
  // Same "only the last turn counts" scoping as pendingAction above.
  const recentlyResolvedEntities: ResolvedEntities | null = lastTurnOutput?.resolvedEntities ?? null;
  // Compact real summary, not the full row shape - enough for "what happened with that
  // work?" to be answerable from real state (title/status/task+run counts/last run
  // outcome/real commit), not a dashboard-sized dump. Every field here is real,
  // persisted data returned by the query above (already RLS-scoped) - never invented.
  const factoryWorkOrders = (factoryWorkOrdersRaw.data || []).map((w: any) => {
    const runs = Array.isArray(w.agent_runs) ? w.agent_runs : [];
    const lastRun = runs.length
      ? runs.reduce((a: any, b: any) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
      : null;
    // complete_work_order() (202608300002_complete_work_order.sql) requires EVERY
    // commit-bearing agent_runs row to carry status='done' AND a passing
    // verification_status on that SAME row before a Work Order can reach status='done' -
    // "the single most-recently-created run" is a different, unrelated signal and can be a
    // run that never carried a commit at all (found live, 2026-08-30: a Verifier's own
    // bootstrap run, dispatched and created AFTER the real implementation commit, was
    // picked as lastRun; its own null verification_status was then wrongly reported for
    // the whole Work Order even though the real commit WAS independently verified on its
    // own row - see qa/KNOWN_FAILURE_MODES.md #31). agent_runs here is already scoped to
    // THIS Work Order alone (PostgREST embedded-resource join on canonical_work_order_id,
    // RLS-scoped like every other query in this function) - an unrelated run from a
    // different Work Order can never appear in `runs`, so the fix below only has to get
    // the SELECTION right within this Work Order's own real rows, not add new scoping.
    const commitRuns = runs.filter((r: any) => r.head_commit);
    const isVerifiedRun = (r: any) =>
      r.status === 'done' && (r.verification_status === 'live_verified' || r.verification_status === 'e2e_verified');
    // If the Work Order itself already reached status='done', every commit-bearing run was
    // already required to pass this exact check before the RPC allowed that transition -
    // trust the canonical, already-certified status over re-deriving it from a possibly
    // stale/incomplete agent_runs read, so persisted truth can never be contradicted by a
    // client-side recomputation of the same invariant the database already enforced.
    const allCommitsVerified = w.status === 'done'
      ? true
      : commitRuns.length > 0 && commitRuns.every(isVerifiedRun);
    // For the commit/summary the founder can ask to see, prefer the most recent VERIFIED
    // commit-bearing run over the plain most-recent run, so "Completed" never ends up
    // pointing at an unrelated, unverified row's summary or head_commit either.
    const verifiedCommitRuns = commitRuns.filter(isVerifiedRun);
    const latestVerifiedRun = verifiedCommitRuns.length
      ? verifiedCommitRuns.reduce((a: any, b: any) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
      : null;
    const latestCommitRun = commitRuns.length
      ? commitRuns.reduce((a: any, b: any) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
      : null;
    const verificationRun = latestVerifiedRun ?? latestCommitRun ?? lastRun;
    return {
      id: w.id,
      title: w.title,
      objective: w.objective,
      status: w.status,
      workType: w.work_type,
      companyId: w.company_id,
      goalId: w.goal_id,
      taskCount: Array.isArray(w.tasks) ? w.tasks.length : 0,
      runCount: runs.length,
      lastRunStatus: lastRun?.status ?? null,
      commitBearingRunCount: commitRuns.length,
      allCommitsVerified,
      lastRunVerificationStatus: verificationRun?.verification_status ?? null,
      lastRunSummary: verificationRun?.summary ?? null,
      lastRunHeadCommit: verificationRun?.head_commit ?? null,
    };
  });

  // Workstream 2c: annotate companies/people with effectivelyActive — mirrors
  // is_company_effectively_active() (supabase/migrations/202608290009_org_effective_active.sql,
  // corrected by 202608300001_fix_effective_active_status_check.sql) as a small in-memory
  // walk over the already-fetched companies/companyRelationships arrays (both already in
  // hand above — no new round-trip). Same two-direction DIRECTION MATTERS rule: for
  // 'parent_of', company_id is the parent and related_company_id is the child, so walking
  // "up" from a company follows related_company_id === self -> company_id; for the other
  // four relationship types, company_id is the subordinate, so walking up follows
  // company_id === self -> related_company_id. "Effectively active" means neither the
  // company itself nor any ancestor found in this array has status 'archived' — a merely
  // non-'active' status like 'planning'/'paused' is NOT disqualifying (KNOWN_FAILURE_MODES.md
  // #28: the live DB function originally got this wrong too, requiring literal 'active').
  // Best-effort like every other capped array in this pack: companyRelationships is capped
  // at 20 rows overall, so a chain longer than what's already fetched here may not be
  // fully walkable — same honest limitation as the 12-row companies cap itself.
  const companyStatusById = new Map((companies.data || []).map((c: any) => [c.id, c.status]));
  const relationshipRows = companyRelationships.data || [];
  function isCompanyEffectivelyActiveInMemory(companyId: string | null | undefined, depth = 0): boolean {
    if (!companyId) return true;
    const ownStatus = companyStatusById.get(companyId);
    if (ownStatus === 'archived') return false;
    if (depth > 10) return true; // cycle guard — real cycles are already rejected elsewhere, this is defensive only
    for (const r of relationshipRows as any[]) {
      if (r.state !== 'current') continue;
      let parentId: string | null = null;
      if (r.relationship_type === 'parent_of' && r.related_company_id === companyId) parentId = r.company_id;
      else if (r.relationship_type !== 'parent_of' && r.company_id === companyId) parentId = r.related_company_id;
      if (parentId && !isCompanyEffectivelyActiveInMemory(parentId, depth + 1)) return false;
    }
    return true;
  }
  const packCompanies = (companies.data || []).map((c: any) => ({ ...c, effectivelyActive: isCompanyEffectivelyActiveInMemory(c.id) }));
  const packPeople = (people.data || []).map((p: any) => ({ ...p, effectivelyActive: isCompanyEffectivelyActiveInMemory(p.company_id) }));

  const pack = { command, companies:packCompanies, projects:projects.data||[], tasks:tasks.data||[], memories:memories.data||[], agents:agents.data||[], products:products.data||[], inventory:inventory.data||[], approvals:approvals.data||[], people:packPeople, goals:goals.data||[], companyRelationships:companyRelationships.data||[], personAssignments:personAssignments.data||[], financialReports:financialReports.data||[], conversationHistory, factoryWorkOrders, channels:channels.data||[], activeChannelId:channelId, departments:departments.data||[], leads:leads.data||[], documents:documents.data||[], proposals:proposals.data||[], productSpecs:productSpecs.data||[], engineeringDrawings:engineeringDrawings.data||[], aiProviders:aiProviders.data||[], mcpConnectors:mcpConnectors.data||[], pendingAction, recentlyResolvedEntities, counts };
  return { pack, errors:[companies.error,projects.error,tasks.error,memories.error,agents.error,products.error,inventory.error,approvals.error,people.error,goals.error,companyRelationships.error,personAssignments.error,financialReports.error,conversationRows.error,factoryWorkOrdersRaw.error,channels.error,departments.error,leads.error,documents.error,proposals.error,productSpecs.error,engineeringDrawings.error,aiProviders.error,mcpConnectors.error,tasksCount.error,approvalsCount.error,companiesCount.error,peopleCount.error,projectsCount.error,goalsCount.error,salesLeadsCount.error,inventoryCount.error,channelsCount.error,departmentsCount.error,documentsCount.error].filter(Boolean).map((e:any)=>e.message) };
}

serve(async (req) => {
  if(req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if(req.method !== 'POST') return json({ error:'POST only' }, 405);
  const started = Date.now();
  // Independent of provider selection (used for embeddings regardless of which provider
  // handles chat completions), so read it early enough for buildContext() to use it.
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  // ---- Pre-flight: auth, parsing, context, provider resolution. Plain JSON errors,
  // same as before — nothing here is streamed, it all has to happen before the LLM
  // call regardless. ----
  let auth: string, command: string, supabase: any, profile: any, contextPack: any, contextErrors: string[], tokenEstimate: number;
  let channelId: string | null = null;
  let providerName: 'openai' | 'anthropic' = 'openai';
  let model = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini';
  let attachedImage: AttachedImage = null;
  try {
    auth = req.headers.get('Authorization') || '';
    if(!auth.startsWith('Bearer ')) return json({ error:'Missing Authorization bearer token' }, 401);
    const body = await req.json();
    command = String(body.command || '').trim();
    if(!command) return json({ error:'Missing command' }, 400);
    const requestedChannelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';

    const rawImageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const rawImageMimeType = typeof body.imageMimeType === 'string' ? body.imageMimeType.trim().toLowerCase() : '';
    const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (rawImageBase64 && ALLOWED_IMAGE_TYPES.has(rawImageMimeType)) {
      attachedImage = { base64: rawImageBase64, mimeType: rawImageMimeType };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    supabase = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if(userErr || !user) return json({ error:'Invalid user session' }, 401);
    const profileRes = await supabase.from('profiles').select('id,role,full_name,email').eq('auth_user_id', user.id).single();
    profile = profileRes.data;
    if(!profile) return json({ error:'Profile not found for authenticated user' }, 403);

    // Never trust the id string until it's confirmed to actually resolve under this
    // caller's own RLS — same "never trust an id unless verified" rule as every other
    // model/client-supplied id in this file. An invalid/inaccessible channel silently
    // falls back to "General" rather than erroring the whole command.
    if (requestedChannelId) {
      const channelCheck = await supabase.from('chat_channels').select('id').eq('id', requestedChannelId).maybeSingle();
      if (channelCheck.data) channelId = requestedChannelId;
    }

    const ctx = await buildContext(supabase, command, channelId, openaiKey);
    contextPack = ctx.pack;
    contextErrors = ctx.errors;
    tokenEstimate = estimateTokens({ command, contextPack });
    const hardMax = Number(Deno.env.get('SEM_AI_MAX_TOKENS') || 12000);
    if(tokenEstimate > hardMax) return json({ error:'Token preflight hard stop', tokenEstimate, hardMax }, 413);

    // No active ai_providers row = today's exact behavior (hardcoded OpenAI + env model).
    // A row only ever changes providerName/model; it never supplies the key itself —
    // keys stay Edge Function secrets, never database rows (see migration 202608260001).
    const activeProvider = await getActiveProvider(supabase);
    if (activeProvider) {
      providerName = activeProvider.provider;
      model = activeProvider.model;
    }
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const key = providerName === 'anthropic' ? anthropicKey : openaiKey;

  // ---- Streaming response from here on: the LLM call + everything that depends on
  // its fully-parsed output (forced-approval scan, transactional persist, audit log). ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(sseEvent(data)));
      let workOrderId: string | null = null;
      try {
        // A real row now exists in the database before the LLM call even starts, not
        // just after it finishes — verified live that generation itself survives a
        // client disconnect (a command was sent, the browser hard-disconnected before it
        // could have finished, and the task/work_order/model_usage rows all landed
        // successfully anyway), so this pending row is what the chat page reconnects to
        // if the user navigates away and back mid-generation.
        const { data: pendingId, error: pendingError } = await supabase.rpc('create_pending_work_order', {
          p_command: command,
          p_context_pack: contextPack,
          p_channel_id: channelId,
        });
        if (!pendingError && pendingId) {
          workOrderId = pendingId;
          send({ type: 'work_order', id: workOrderId });
        }

        let resultText: string;
        let stopReason: string | null = null;
        const usageRef: { current: Usage | null } = { current: null };

        // Pending-action resolution precedence (Workstream 3b — explicit code, not left
        // to model judgment):
        //   1. Explicit new command — no special handling needed: it simply won't match
        //      any of the narrow deterministic patterns in steps 2-4 below, so it falls
        //      straight through to the ordinary LLM call (step 5) by construction.
        //   2. Pending operation continuation — pendingAction.kind === "bulk_confirmation"
        //      + an exact short affirmative — today's ORIGINAL mechanism, byte-for-byte
        //      unchanged (same regex, same "Confirmed — {summary}" phrasing).
        //   3. Clarification response — pendingAction.kind === "single_entity_clarification"
        //      + a short AFFIRMING reply (not necessarily an exact whole-string match —
        //      "yes, delete that employee" must resolve too, unlike step 2's stricter
        //      match) — resolved deterministically against candidateIds, no LLM call.
        //      Direct fix for CHAT_PENDING_ACTION_SURVIVES_CLARIFICATION /
        //      CHAT_CONFIRMATION_RESOLVES_PREVIOUS_ENTITY.
        //   4. Referent resolution — pendingAction.kind === "disambiguation" + the reply
        //      naming one real option by its label — resolved deterministically, no LLM
        //      call.
        //   5. Normal query — no pendingAction, or one that didn't match 2-4 — today's
        //      ordinary LLM call, unchanged; context.pendingAction still rides along in
        //      contextPack so the model itself can handle a decline, a redirect, or a
        //      genuinely new instruction.
        //   6. Generic fallback — only reached if the LLM itself produces a low-signal
        //      reply; enforced by the system prompt's own open_question requirement
        //      (Workstream 3d), not by code here.
        // This only ever fires immediately after the specific turn that proposed it (see
        // buildContext's pendingAction extraction) — a second "yes" one turn later finds
        // nothing pending and falls through to the model as an ordinary message, which is
        // the idempotency guarantee, not a separate check here.
        const pendingAction = contextPack?.pendingAction as PendingAction | null;
        const isShortAffirmative = /^(yes|yep|yeah|yup|confirm|confirmed|go ahead|go for it|do it|execute|proceed|sure|okay|ok)[.!]?$/i.test(command.trim());

        let deterministic: { summary: string; fields: Record<string, unknown>; tag: string } | null = null;
        if (pendingAction && pendingAction.kind === 'bulk_confirmation' && pendingAction.action && typeof pendingAction.action === 'object' && isShortAffirmative) {
          deterministic = {
            summary: pendingAction.summary ? `Confirmed — ${pendingAction.summary}` : 'Confirmed.',
            fields: pendingAction.action,
            tag: 'deterministic-confirmation',
          };
        } else if (pendingAction && pendingAction.kind === 'single_entity_clarification' && Array.isArray(pendingAction.candidateIds) && pendingAction.candidateIds.length > 0 && isClarificationAffirmative(command)) {
          // actionType defaults to 'archive' when absent - every clarification proposed
          // before this fix (and every archive/delete-style clarification since) never set
          // it, so this default keeps that behavior byte-identical. A restore clarification
          // MUST set actionType:'restore' (system prompt requirement below) to reach
          // restoreCompanyIds/restoreTaskIds/restoreGoalIds/restoreEmploymentPersonIds
          // instead of silently landing on the archive field for the same entityType.
          const field = CLARIFICATION_ENTITY_ACTION_FIELD[pendingAction.entityType || '']?.[pendingAction.actionType || 'archive'];
          if (field) {
            deterministic = {
              summary: pendingAction.question ? `Confirmed — ${pendingAction.question.replace(/\?+\s*$/, '')}.` : 'Confirmed.',
              fields: { [field]: pendingAction.candidateIds },
              tag: 'deterministic-clarification',
            };
          }
        } else if (pendingAction && pendingAction.kind === 'disambiguation' && Array.isArray(pendingAction.options) && pendingAction.options.length > 0) {
          const matchedOption = matchDisambiguationOption(command, pendingAction.options);
          const field = matchedOption ? CLARIFICATION_ENTITY_ACTION_FIELD[matchedOption.entityType]?.[matchedOption.actionType || 'archive'] : undefined;
          if (matchedOption && field) {
            deterministic = {
              summary: `Confirmed — ${matchedOption.label}.`,
              fields: { [field]: [matchedOption.id] },
              tag: 'deterministic-disambiguation',
            };
          }
        }

        if (deterministic) {
          resultText = JSON.stringify({ summary: deterministic.summary, ...deterministic.fields });
          model = deterministic.tag;
          send({ type: 'delta', text: deterministic.summary });
        } else if(!key){
          const fb = fallbackPlan(command, contextPack);
          resultText = JSON.stringify(fb);
          model = 'fallback-no-api-key';
          if (fb.summary) send({ type: 'delta', text: fb.summary });
        } else if (providerName === 'anthropic') {
          const r = await callAnthropicStreaming(
            model, key,
            { profile:{id:profile.id,role:profile.role}, command, contextPack },
            (delta) => send({ type: 'delta', text: delta }),
            (u) => { usageRef.current = { ...usageRef.current, ...u }; send({ type: 'usage', ...usageRef.current }); },
            attachedImage
          );
          resultText = r.text; stopReason = r.stopReason;
        } else {
          const r = await callOpenAIStreaming(
            model, key,
            { profile:{id:profile.id,role:profile.role}, command, contextPack },
            (delta) => send({ type: 'delta', text: delta }),
            (u) => { usageRef.current = { ...usageRef.current, ...u }; send({ type: 'usage', ...usageRef.current }); },
            attachedImage
          );
          resultText = r.text; stopReason = r.stopReason;
        }

        let result: any;
        try {
          result = parseModelJson(resultText);
        } catch {
          // Now attached to a real work_order row (entity_id) instead of null, and that
          // row itself gets marked 'rejected' rather than sitting stuck at 'queued'
          // forever — both diagnosable and visible in chat history afterward.
          const truncated = stopReason === 'max_tokens' || stopReason === 'max_output_tokens';
          const errorMessage = truncated
            ? 'Response was cut off before it finished (too long for one reply) — try breaking the request into smaller steps.'
            : 'Model returned invalid JSON';
          // KNOWN_FAILURE_MODES.md #7 — the fuller task-derived primaryCompanyId isn't
          // computable yet this early (parsing failed before any tasks exist), but the
          // active channel's own company_id (if any) is a safe, real signal.
          const earlyCompanyId = contextPack?.activeChannelId
            ? (contextPack?.channels || []).find((c: any) => c.id === contextPack.activeChannelId)?.company_id ?? null
            : null;
          await supabase.from('audit_logs').insert({
            actor_profile_id: profile.id, actor_role: profile.role,
            event_type: 'ai_command_json_parse_failed', entity_type: 'work_order', entity_id: workOrderId, company_id: earlyCompanyId,
            message: errorMessage, metadata: { command, model, stopReason, raw: resultText.slice(0, 4000) }
          });
          if (workOrderId) {
            await supabase.rpc('mark_work_order_failed', { p_work_order_id: workOrderId, p_error: errorMessage });
          }
          send({ type: 'error', error: errorMessage, raw: resultText.slice(0, 2000) });
          return;
        }

        // Business logic (risk-keyword forcing, domain routing) stays here in TypeScript;
        // persistence is delegated to the sem_execute_ai_command RPC (migration
        // 202608230002) so work_order + tasks + approvals + model_usage + audit_logs all
        // commit or roll back together instead of a sequential-insert approach, which
        // silently swallowed per-row errors and could leave partial state.
        const resultTasks = (result.tasks || []) as AiTask[];
        const forcedApprovalTaskIndexes:number[] = [];
        const taskPayloads = resultTasks.map((t, i) => {
          const matchedKeywords = detectForcedApprovalKeywords(t.title || '', t.description || '');
          const forced = !t.approvalRequired && matchedKeywords.length > 0;
          if(forced) forcedApprovalTaskIndexes.push(i);
          return {
            companyId: t.companyId || null, projectId: t.projectId || null, title: t.title, description: t.description || '', parentGoal: result.strategicGoal || '',
            ownerType: t.ownerType || 'agent', ownerAgentId: t.ownerAgentId || null, ownerPersonId: t.ownerPersonId || null,
            acceptanceCriteria: t.acceptanceCriteria || [], testMethod: t.testMethod || [],
            priority: t.priority || 'medium', riskLevel: t.riskLevel || 'low', approvalRequired: !!t.approvalRequired || forced
          };
        });

        // Deletion is high-risk regardless of which task is targeted (no title/description
        // to keyword-scan the way task creation is) — cross-check against the real ids
        // this request's own context pack fetched, so the model can't smuggle in an
        // arbitrary uuid it merely guessed at.
        const contextTaskIds = new Set((contextPack?.tasks || []).map((t: any) => t.id));
        const requestedDeleteIds = Array.isArray(result.deleteTaskIds) ? result.deleteTaskIds as unknown[] : [];
        const deleteTaskIds = requestedDeleteIds.filter((id): id is string => typeof id === 'string' && contextTaskIds.has(id));

        // Deferred deletion: the model chose NOT to execute now (see the pendingDeleteTaskIds
        // prompt rule) but still identified real, validated targets — captured here as an
        // approval_payload.execute action (below) so decide_approval() (migration
        // 202608270005) can actually run the deletion once an authorized approver approves
        // it, instead of the approval being a dead-end description with no target ids (the
        // exact gap a real 68-task bulk-deletion approval hit live tonight).
        const requestedPendingDeleteTaskIds = Array.isArray(result.pendingDeleteTaskIds) ? result.pendingDeleteTaskIds as unknown[] : [];
        const pendingDeleteTaskIds = requestedPendingDeleteTaskIds.filter((id): id is string => typeof id === 'string' && contextTaskIds.has(id));

        // Archive/restore: the ordinary-language delete path for tasks (see prompt
        // guidance above) - archive_task/restore_task are the same shared RPC the UI's
        // archive/restore actions call, DB-trigger-enforced as the sole path in/out of
        // 'archived' (202608290001_task_goal_archive_restore.sql). restoreTaskIds
        // resolves against context.archivedTasks specifically, since context.tasks is
        // scoped to in-flight statuses only and never contains an archived task.
        const contextArchivedTaskIds = new Set((contextPack?.archivedTasks || []).map((t: any) => t.id));
        const requestedArchiveTaskIds = Array.isArray(result.archiveTaskIds) ? result.archiveTaskIds as unknown[] : [];
        const archiveTaskIds = [...new Set(requestedArchiveTaskIds.filter((id): id is string => typeof id === 'string' && contextTaskIds.has(id)))];
        const requestedRestoreTaskIds = Array.isArray(result.restoreTaskIds) ? result.restoreTaskIds as unknown[] : [];
        const restoreTaskIds = [...new Set(requestedRestoreTaskIds.filter((id): id is string => typeof id === 'string' && contextArchivedTaskIds.has(id)))];
        const taskTitleById = new Map([
          ...((contextPack?.tasks || []).map((t: any) => [t.id, t.title])),
          ...((contextPack?.archivedTasks || []).map((t: any) => [t.id, t.title])),
        ]);
        const lifecycleReasonText: Record<string, string> = {
          archived: 'archived', restored: 'restored',
          already_archived: 'was already archived', already_active: 'was already active',
          denied: 'you do not have permission to archive/restore this',
          not_found: 'could not be found',
        };
        const taskArchiveRestoreLines: string[] = [];
        for (const id of archiveTaskIds) {
          const { data, error } = await supabase.rpc('archive_task', { p_task_id: id });
          const name = taskTitleById.get(id) || id;
          if (error || !data) { taskArchiveRestoreLines.push(`Task "${name}": archive failed (${error?.message || 'no result'}).`); continue; }
          const r = data as Record<string, unknown>;
          taskArchiveRestoreLines.push(`Task "${name}": ${lifecycleReasonText[String(r.reason)] || String(r.reason)}.`);
        }
        for (const id of restoreTaskIds) {
          const { data, error } = await supabase.rpc('restore_task', { p_task_id: id });
          const name = taskTitleById.get(id) || id;
          if (error || !data) { taskArchiveRestoreLines.push(`Task "${name}": restore failed (${error?.message || 'no result'}).`); continue; }
          const r = data as Record<string, unknown>;
          // Tasks restore to their exact prior status (not a fixed target like companies/
          // goals) - worth naming explicitly rather than a generic "restored", since
          // which status it landed on is real information the founder would ask about.
          taskArchiveRestoreLines.push(r.reason === 'restored'
            ? `Task "${name}": restored (back to "${r.newStatus}").`
            : `Task "${name}": ${lifecycleReasonText[String(r.reason)] || String(r.reason)}.`);
        }
        const taskArchiveRestoreReport = taskArchiveRestoreLines.length > 0 ? taskArchiveRestoreLines.join(' ') : null;
        // restor(ed|ing) added (2026-08-30, "test3 restore" incident, applied here too as
        // the same-defect sweep the incident required): the original word list only
        // caught delete/archive/remove claims — a false "restored" claim with zero real
        // restoreTaskIds attempted slipped through uncorrected the same way a false
        // "active" claim did for companies.
        const claimsTaskDeleted = archiveTaskIds.length === 0 && restoreTaskIds.length === 0 && deleteTaskIds.length === 0 && pendingDeleteTaskIds.length === 0
          && claimsLifecycleClaim(String(result.summary || ''), 'delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'task');

        // Channel deletion: same cross-check discipline as task deletion above, but this
        // isn't part of the sem_execute_ai_command RPC's transaction — chat_channels has
        // its own existing RLS delete policy (the same one the manual "..." > Delete menu
        // in channel-sidebar.tsx already relies on), so a plain scoped delete here reuses
        // that real enforcement rather than adding a new RPC parameter/migration for it.
        const contextChannelIds = new Set((contextPack?.channels || []).map((c: any) => c.id));
        if (contextPack?.activeChannelId) contextChannelIds.add(contextPack.activeChannelId);
        const requestedDeleteChannelIds = Array.isArray(result.deleteChannelIds) ? result.deleteChannelIds as unknown[] : [];
        const deleteChannelIds = requestedDeleteChannelIds.filter((id): id is string => typeof id === 'string' && contextChannelIds.has(id));
        const requestedPendingDeleteChannelIds = Array.isArray(result.pendingDeleteChannelIds) ? result.pendingDeleteChannelIds as unknown[] : [];
        const pendingDeleteChannelIds = requestedPendingDeleteChannelIds.filter((id): id is string => typeof id === 'string' && contextChannelIds.has(id));
        let deletedChannelCount = 0;
        if (deleteChannelIds.length > 0) {
          const { data: deletedChannels, error: deleteChannelsError } = await supabase
            .from('chat_channels')
            .delete()
            .in('id', deleteChannelIds)
            .select('id');
          // RLS may silently affect 0 rows if the caller lacks delete rights — that's not
          // a hard error, just nothing to report as deleted; a real error (e.g. network)
          // still surfaces in summary so it isn't swallowed.
          if (deleteChannelsError) {
            result.summary = `${result.summary || ''}\n\n(Channel deletion failed: ${deleteChannelsError.message})`.trim();
          } else {
            deletedChannelCount = deletedChannels?.length || 0;
          }
        }

        // Approval deletion: same cross-check + scoped-delete pattern as channels above —
        // real enforcement is approvals_delete_scope RLS (migration 202608280001,
        // founder/admin or the approval's own company manager). context.approvals only
        // ever holds pending approvals (see buildContext()), so this can only ever
        // reference a pending one from chat — matches the prompt rule above. Added after a
        // real bug: this field didn't exist at all before, so a model claiming it deleted
        // approvals was always a fabrication with nothing behind it (see
        // qa/KNOWN_FAILURE_MODES.md #16 in KNOWN_FAILURE_MODES for the incident, and the
        // factual result-line built below for how the response is now grounded in what
        // actually happened instead of the model's own claim).
        const contextApprovalIds = new Set((contextPack?.approvals || []).map((a: any) => a.id));
        const requestedDeleteApprovalIds = Array.isArray(result.deleteApprovalIds) ? result.deleteApprovalIds as unknown[] : [];
        const deleteApprovalIds = requestedDeleteApprovalIds.filter((id): id is string => typeof id === 'string' && contextApprovalIds.has(id));
        let deletedApprovalCount = 0;
        if (deleteApprovalIds.length > 0) {
          const { data: deletedApprovals, error: deleteApprovalsError } = await supabase
            .from('approvals')
            .delete()
            .in('id', deleteApprovalIds)
            .select('id');
          if (deleteApprovalsError) {
            result.summary = `${result.summary || ''}\n\n(Approval deletion failed: ${deleteApprovalsError.message})`.trim();
          } else {
            deletedApprovalCount = deletedApprovals?.length || 0;
          }
        }

        // Companies/people creation: defensively coerce shape (never trust the model's
        // JSON structure blindly) — name/fullName are required, everything else is
        // optional. A person's companyId is only trusted if it's a real id from
        // context.companies; companyIndex is bounds-checked by the RPC itself against
        // however many companies actually get created this request.
        const contextCompanyIds = new Set((contextPack?.companies || []).map((c: any) => c.id));
        // context.companies has no status filter (archived companies must stay resolvable
        // for "restore X" / historical questions), so new-work creation against an
        // archived company has to be blocked here explicitly rather than by omission from
        // context — see archiveCompanyIds/restoreCompanyIds handling below.
        const archivedCompanyIds = new Set((contextPack?.companies || []).filter((c: any) => c.status === 'archived').map((c: any) => c.id));
        let archivedCompanyBlockedCount = 0;
        // Drops any create whose resolved companyId targets an archived company
        // (companyIndex is untouched — it always points at a company created this same
        // turn, which is never archived) and counts it for the fact-line below, instead of
        // silently letting it through with a null company or silently succeeding against a
        // company the founder just deleted.
        const dropArchivedCompanyTarget = <T extends { companyId: string | null; companyIndex: number | null }>(items: T[]): T[] =>
          items.filter((item) => {
            if (item.companyId && archivedCompanyIds.has(item.companyId)) {
              archivedCompanyBlockedCount++;
              return false;
            }
            return true;
          });
        const contextPersonIds = new Set((contextPack?.people || []).map((p: any) => p.id));
        const VALID_ORGANIZATION_TYPES = new Set(['legal_entity', 'holding_company', 'subsidiary', 'business_unit', 'brand', 'department', 'country_operation']);
        const requestedCompanies = Array.isArray(result.createCompanies) ? result.createCompanies as unknown[] : [];
        const createCompanies = requestedCompanies
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as any).name === 'string' && (c as any).name.trim())
          .map((c: any) => ({
            name: String(c.name).trim(),
            country: typeof c.country === 'string' ? c.country : null,
            legalEntityName: typeof c.legalEntityName === 'string' ? c.legalEntityName : null,
            description: typeof c.description === 'string' ? c.description : null,
            organizationType: typeof c.organizationType === 'string' && VALID_ORGANIZATION_TYPES.has(c.organizationType) ? c.organizationType : null,
          }));

        // Company updates target an existing row by real id — never a company being
        // created this same turn (renaming something that doesn't exist yet is
        // incoherent), so this executes immediately here rather than waiting for the RPC.
        // companies_write_admin RLS (founder/admin only) is the real enforcement; a
        // non-founder caller's update just affects 0 rows, same honest-result discipline
        // as every other mutation in this file.
        const requestedCompanyUpdates = Array.isArray(result.updateCompanies) ? result.updateCompanies as unknown[] : [];
        const updateCompaniesReq = requestedCompanyUpdates
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as any).id === 'string' && contextCompanyIds.has((c as any).id))
          .map((c: any) => ({
            id: c.id as string,
            name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : null,
            country: typeof c.country === 'string' ? c.country : null,
            legalEntityName: typeof c.legalEntityName === 'string' ? c.legalEntityName : null,
            status: typeof c.status === 'string' ? c.status : null,
            organizationType: typeof c.organizationType === 'string' && VALID_ORGANIZATION_TYPES.has(c.organizationType) ? c.organizationType : null,
          }));
        // Real, live-reproduced defect (2026-08-30, "test3 restore" incident): dropping
        // only the literal target value 'archived' isn't enough — a company that is
        // CURRENTLY archived and gets a status patch of 'active' (the model's own
        // "should I change test3's status to active?" workaround, taken because it had no
        // correct restore path available at the time) hits the exact same
        // companies_lifecycle_guard trigger from the OTHER direction (leaving 'archived'
        // via a raw UPDATE, not just entering it) and throws, silently failing the whole
        // patch and producing the misleading "no matching company or no access" result.
        // archive_company()/restore_company() are the one, sole, authoritative lifecycle
        // path (Bug 3's own explicit requirement) - this table is never used for anything
        // BUT that decision, so a lookup that includes it doesn't cost anything extra.
        const companyStatusById = new Map((contextPack?.companies || []).map((c: any) => [c.id, c.status]));
        let updatedCompanyCount = 0;
        let companyLifecycleEditsSkipped = 0;
        for (const c of updateCompaniesReq) {
          const patch: Record<string, unknown> = {};
          if (c.name) patch.name = c.name;
          if (c.country !== null) patch.country = c.country;
          if (c.legalEntityName !== null) patch.legal_entity_name = c.legalEntityName;
          const currentStatus = companyStatusById.get(c.id);
          const statusChangeIsLifecycleTransition = c.status && (c.status === 'archived' || currentStatus === 'archived');
          if (statusChangeIsLifecycleTransition) {
            // Never attempted, on purpose - archiveCompanyIds/restoreCompanyIds
            // (archive_company()/restore_company()) are the only path in/out of
            // 'archived'. A raw UPDATE would either be silently blocked by the DB trigger
            // (if it actually reached the trigger) or, worse, misreport as a generic
            // "could not be created/update did not apply" failure that has nothing to do
            // with the real reason - counted separately so the founder gets an honest,
            // specific explanation instead.
            companyLifecycleEditsSkipped++;
          } else if (c.status) {
            patch.status = c.status;
          }
          if (c.organizationType) patch.organization_type = c.organizationType;
          if (Object.keys(patch).length === 0) continue;
          const { data } = await supabase.from('companies').update(patch).eq('id', c.id).select('id');
          if (data && data.length > 0) updatedCompanyCount++;
        }

        // Archive/restore: the ONLY real deletion mechanism for a company (there is no
        // separate hard-delete path from chat) — archive_company/restore_company are the
        // same shared RPC the UI's Delete/Restore buttons call, DB-trigger-enforced as the
        // sole path in/out of 'archived' (see 202608280013_frictionless_company_delete.sql).
        // Never invented: only ids present in context.companies are honored (that list
        // carries no status filter, so archived companies are already resolvable there for
        // restore too).
        const requestedArchiveIds = Array.isArray(result.archiveCompanyIds) ? result.archiveCompanyIds as unknown[] : [];
        const archiveCompanyIds = [...new Set(requestedArchiveIds.filter((id): id is string => typeof id === 'string' && contextCompanyIds.has(id)))];
        const requestedRestoreIds = Array.isArray(result.restoreCompanyIds) ? result.restoreCompanyIds as unknown[] : [];
        const restoreCompanyIds = [...new Set(requestedRestoreIds.filter((id): id is string => typeof id === 'string' && contextCompanyIds.has(id)))];
        const companyNameById = new Map((contextPack?.companies || []).map((c: any) => [c.id, c.name]));
        const archiveRestoreLines: string[] = [];
        const reasonText: Record<string, string> = {
          archived: 'archived', restored: 'restored',
          already_archived: 'was already archived', already_active: 'was already active',
          denied: 'you do not have permission to archive/restore this company',
          not_found: 'could not be found',
        };
        for (const id of archiveCompanyIds) {
          const { data, error } = await supabase.rpc('archive_company', { p_company_id: id });
          const name = companyNameById.get(id) || id;
          if (error || !data) { archiveRestoreLines.push(`${name}: archive failed (${error?.message || 'no result'}).`); continue; }
          const r = data as Record<string, unknown>;
          // archive_company()/restore_company() (schema-v0.7-production-core.sql) already
          // re-read the row after the UPDATE and return a real postconditionPassed
          // boolean, not an assumed echo of the write - Bug 8's own explicit requirement
          // ("do not trust the RPC return alone if the lifecycle requires verification")
          // is satisfied at the DB layer already, but this still defensively cross-checks
          // it rather than only ever reading `reason`, in case the two ever disagree.
          if (r.changed === true && r.postconditionPassed !== true) {
            archiveRestoreLines.push(`${name}: archive attempted, but the persisted status did not confirm it afterward — treat as not archived.`);
            continue;
          }
          archiveRestoreLines.push(`${name}: ${reasonText[String(r.reason)] || String(r.reason)}.`);
        }
        for (const id of restoreCompanyIds) {
          const { data, error } = await supabase.rpc('restore_company', { p_company_id: id });
          const name = companyNameById.get(id) || id;
          if (error || !data) { archiveRestoreLines.push(`${name}: restore failed (${error?.message || 'no result'}).`); continue; }
          const r = data as Record<string, unknown>;
          if (r.changed === true && r.postconditionPassed !== true) {
            archiveRestoreLines.push(`${name}: restore attempted, but the persisted status did not confirm it afterward — treat as not restored.`);
            continue;
          }
          archiveRestoreLines.push(`${name}: ${reasonText[String(r.reason)] || String(r.reason)}.`);
        }
        // Same reasoning as organizationGraphCheck below: when a real archive/restore was
        // attempted, the real outcome is the entire point of the turn and fully replaces
        // the model's own prose rather than being prepended to it — live-tested elsewhere
        // in this file, prepending still let the model's own text contradict a correct
        // result.
        const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(' ') : null;

        // The original reported defect: the model narrating "Company deleted
        // successfully" with zero actual mechanism behind it. This is the one case the
        // grounding above can't catch by construction — nothing was attempted, so there is
        // no RPC result to ground against. Scoped narrowly to delete/archive-claiming
        // language specifically (not a generic claim-detector) since that is the exact
        // defect being closed.
        // restor(ed|ing) added (2026-08-30, real incident: "test3 is now active. It
        // should appear in your companies menu." was said with zero real
        // archiveCompanyIds/restoreCompanyIds attempted — the RPC-grounded corrector
        // below exists exactly to catch this, but the word list didn't include the
        // restore direction at all, only delete/archive/remove). A bare "active" claim is
        // deliberately NOT added here — this file legitimately reports real companies as
        // "active" constantly in ordinary read-only answers, and word-proximity regex
        // can't reliably tell that apart from a false completion claim without a real
        // false-positive risk; the structural fix (CLARIFICATION_ENTITY_ACTION_FIELD now
        // routing restore clarifications to restoreCompanyIds instead of
        // archiveCompanyIds, and updateCompanies never attempting a raw status write
        // across the archived boundary) is what actually closes that path, not this regex.
        const claimsCompanyDeleted = archiveCompanyIds.length === 0 && restoreCompanyIds.length === 0
          && claimsLifecycleClaim(String(result.summary || ''), 'delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'company');

        // Person/employment lifecycle (Workstream 1c, Bug 5): end_person_employment()/
        // restore_person_employment() (supabase/migrations/
        // 202608290008_person_lifecycle_end_employment_and_delete.sql) — soft, historicizes
        // person_assignments and marks people.active=false, never touches the person
        // record/salary/KPI history. deletePersonIds deliberately does NOT exist as a chat
        // field anywhere in this file's schema — hard-delete stays a founder/admin-only UI
        // action (web/app/(app)/people/people-table.tsx), never an AI capability, since a
        // wrong id here would be unrecoverable.
        const requestedEndEmploymentIds = Array.isArray(result.endEmploymentPersonIds) ? result.endEmploymentPersonIds as unknown[] : [];
        const endEmploymentPersonIds = [...new Set(requestedEndEmploymentIds.filter((id): id is string => typeof id === 'string' && contextPersonIds.has(id)))];
        const requestedRestoreEmploymentIds = Array.isArray(result.restoreEmploymentPersonIds) ? result.restoreEmploymentPersonIds as unknown[] : [];
        const restoreEmploymentPersonIds = [...new Set(requestedRestoreEmploymentIds.filter((id): id is string => typeof id === 'string' && contextPersonIds.has(id)))];
        const personNameById = new Map((contextPack?.people || []).map((p: any) => [p.id, p.full_name]));
        const personLifecycleLines: string[] = [];
        const personReasonText: Record<string, string> = {
          employment_ended: 'employment ended', restored: 'restored',
          already_inactive: 'already inactive', already_active: 'already active',
          denied: 'you do not have permission to end/restore this person’s employment',
          not_found: 'could not be found',
        };
        for (const id of endEmploymentPersonIds) {
          const { data, error } = await supabase.rpc('end_person_employment', { p_person_id: id });
          const name = personNameById.get(id) || id;
          if (error || !data) { personLifecycleLines.push(`${name}: end-employment failed (${error?.message || 'no result'}).`); continue; }
          const r = data as Record<string, unknown>;
          personLifecycleLines.push(`${name}: ${personReasonText[String(r.reason)] || String(r.reason)}.`);
        }
        for (const id of restoreEmploymentPersonIds) {
          const { data, error } = await supabase.rpc('restore_person_employment', { p_person_id: id });
          const name = personNameById.get(id) || id;
          if (error || !data) { personLifecycleLines.push(`${name}: restore failed (${error?.message || 'no result'}).`); continue; }
          const r = data as Record<string, unknown>;
          personLifecycleLines.push(`${name}: ${personReasonText[String(r.reason)] || String(r.reason)}.`);
        }
        const personLifecycleReport = personLifecycleLines.length > 0 ? personLifecycleLines.join(' ') : null;

        // The missing "person" variant of claimsCompanyDeleted/claimsTaskDeleted — the
        // direct fix for the original misrouting defect (Bug 4): "delete QA-VERIFY-EMPLOYEE"
        // used to produce "No company was actually archived..." because the model, having
        // no person-lifecycle vocabulary at all, reached for the nearest lifecycle language
        // it did have rules for (company archive) and tripped claimsCompanyDeleted instead.
        // Now that endEmploymentPersonIds exists as a real field with its own prompt
        // guidance, the model has the correct vocabulary to reach for, and this catches the
        // residual "claimed but nothing happened" case the same way the other correctors do.
        // restor(ed|ing) added (2026-08-30, "test3 restore" incident, same-defect sweep).
        const claimsPersonDeleted = endEmploymentPersonIds.length === 0 && restoreEmploymentPersonIds.length === 0
          && claimsLifecycleClaim(String(result.summary || ''), 'delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|end(ed|ing)?|restor(ed|ing)', 'employe(e|d)|person|staff');

        // Organization graph audit — real database query, not a guess. Runs immediately
        // (like company updates above) since it's read-only and doesn't belong in the
        // mutation transaction. organizationGraphCheck stays null unless the model
        // actually requested one, so the fact-line below is silent on every other turn.
        const checkGraphReq = result.checkOrganizationGraph && typeof result.checkOrganizationGraph === 'object'
          ? result.checkOrganizationGraph as Record<string, unknown>
          : null;
        let organizationGraphCheck: { scope: string; clean: boolean; summary: string; report: string } | null = null;
        if (checkGraphReq) {
          const targetCompanyId = typeof checkGraphReq.companyId === 'string' && contextCompanyIds.has(checkGraphReq.companyId)
            ? checkGraphReq.companyId
            : null;
          const { data: graphResult, error: graphError } = await supabase.rpc('validate_organization_graph', { p_company_id: targetCompanyId });
          if (!graphError && graphResult) {
            const g = graphResult as Record<string, unknown>;
            const dupNames = Array.isArray(g.duplicateCompanyNames) ? g.duplicateCompanyNames as any[] : [];
            const overOwned = Array.isArray(g.ownershipOver100) ? g.ownershipOver100 as any[] : [];
            const cycles = Array.isArray(g.hierarchyCycles) ? g.hierarchyCycles as any[] : [];
            const orphanUnits = Array.isArray(g.businessUnitsWithoutParentEdge) ? g.businessUnitsWithoutParentEdge as any[] : [];
            const stalePlanned = Array.isArray(g.stalePlannedRelationships) ? g.stalePlannedRelationships as any[] : [];
            const noCompanyPeople = Array.isArray(g.peopleWithNoCompany) ? g.peopleWithNoCompany as any[] : [];
            const issues: string[] = [];
            const reportLines: string[] = [];
            if (dupNames.length) { issues.push(`${dupNames.length} duplicate company name(s)`); reportLines.push(`- Duplicate names: ${dupNames.map(d => `"${d.name}" (${d.count}x)`).join(', ')}`); }
            if (overOwned.length) { issues.push(`${overOwned.length} company/companies with total ownership over 100%`); reportLines.push(`- Over-owned: ${overOwned.map(o => `${o.companyName} at ${o.totalPct}%`).join(', ')}`); }
            if (cycles.length) { issues.push(`${cycles.length} hierarchy cycle(s)`); reportLines.push(`- Cycles involving: ${cycles.map(c => c.companyName).join(', ')}`); }
            if (orphanUnits.length) { issues.push(`${orphanUnits.length} business unit/brand/subsidiary with no parent relationship set`); reportLines.push(`- No parent set: ${orphanUnits.map(o => `${o.name} (${o.organizationType})`).join(', ')}`); }
            if (stalePlanned.length) { issues.push(`${stalePlanned.length} relationship(s) left "planned" for over a week`); reportLines.push(`- Stale planned: ${stalePlanned.map(s => `${s.company} ${s.relationshipType} ${s.relatedCompany}`).join(', ')}`); }
            if (noCompanyPeople.length) { issues.push(`${noCompanyPeople.length} people record(s) with no company`); reportLines.push(`- No company: ${noCompanyPeople.map(p => p.fullName).join(', ')}`); }
            const scope = String(g.scope ?? 'all companies');
            organizationGraphCheck = {
              scope,
              clean: g.clean === true,
              summary: issues.length === 0
                ? `Organization graph check (${scope}): clean, no issues found.`
                : `Organization graph check (${scope}): ${issues.join('; ')}.`,
              report: issues.length === 0
                ? `Organization graph check — ${scope}: clean, no issues found. Every company resolves correctly, no duplicate names, no ownership conflicts, no hierarchy cycles, no orphaned business units, no stale relationships, no people without a company.`
                : `Organization graph check — ${scope}: ${issues.length} issue(s) found.\n${reportLines.join('\n')}`,
            };
          }
        }

        // Archive/restore for goals: context.goals carries no status filter (unlike
        // context.tasks), so both archive and restore ids resolve from the same set -
        // an already-archived goal is still resolvable there by name for "restore X".
        const contextGoalIds = new Set((contextPack?.goals || []).map((g: any) => g.id));
        const requestedArchiveGoalIds = Array.isArray(result.archiveGoalIds) ? result.archiveGoalIds as unknown[] : [];
        const archiveGoalIds = [...new Set(requestedArchiveGoalIds.filter((id): id is string => typeof id === 'string' && contextGoalIds.has(id)))];
        const requestedRestoreGoalIds = Array.isArray(result.restoreGoalIds) ? result.restoreGoalIds as unknown[] : [];
        const restoreGoalIds = [...new Set(requestedRestoreGoalIds.filter((id): id is string => typeof id === 'string' && contextGoalIds.has(id)))];
        const goalTitleById = new Map((contextPack?.goals || []).map((g: any) => [g.id, g.title]));
        const goalArchiveRestoreLines: string[] = [];
        for (const id of archiveGoalIds) {
          const { data, error } = await supabase.rpc('archive_goal', { p_goal_id: id });
          const name = goalTitleById.get(id) || id;
          if (error || !data) { goalArchiveRestoreLines.push(`Goal "${name}": archive failed (${error?.message || 'no result'}).`); continue; }
          const r = data as Record<string, unknown>;
          goalArchiveRestoreLines.push(`Goal "${name}": ${lifecycleReasonText[String(r.reason)] || String(r.reason)}.`);
        }
        for (const id of restoreGoalIds) {
          const { data, error } = await supabase.rpc('restore_goal', { p_goal_id: id });
          const name = goalTitleById.get(id) || id;
          if (error || !data) { goalArchiveRestoreLines.push(`Goal "${name}": restore failed (${error?.message || 'no result'}).`); continue; }
          const r = data as Record<string, unknown>;
          goalArchiveRestoreLines.push(`Goal "${name}": ${lifecycleReasonText[String(r.reason)] || String(r.reason)}.`);
        }
        const goalArchiveRestoreReport = goalArchiveRestoreLines.length > 0 ? goalArchiveRestoreLines.join(' ') : null;
        // restor(ed|ing) added (2026-08-30, "test3 restore" incident, same-defect sweep).
        const claimsGoalDeleted = archiveGoalIds.length === 0 && restoreGoalIds.length === 0
          && claimsLifecycleClaim(String(result.summary || ''), 'delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'goal');

        const requestedPeople = Array.isArray(result.createPeople) ? result.createPeople as unknown[] : [];
        const createPeople = requestedPeople
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).fullName === 'string' && (p as any).fullName.trim())
          .map((p: any) => ({
            fullName: String(p.fullName).trim(),
            email: typeof p.email === 'string' ? p.email : null,
            roleTitle: typeof p.roleTitle === 'string' ? p.roleTitle : null,
            companyId: typeof p.companyId === 'string' && contextCompanyIds.has(p.companyId) ? p.companyId : null,
            companyIndex: typeof p.companyIndex === 'number' ? p.companyIndex : null,
          }));

        // Projects/goals both require a company (NOT NULL in the schema) — drop any
        // entry with no resolvable reference rather than let it hit the database and
        // fail the whole transaction on a not-null violation.
        const hasCompanyRef = (c: any) => (typeof c.companyId === 'string' && contextCompanyIds.has(c.companyId)) || typeof c.companyIndex === 'number';
        const requestedProjects = Array.isArray(result.createProjects) ? result.createProjects as unknown[] : [];
        const createProjects = requestedProjects
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).title === 'string' && (p as any).title.trim() && hasCompanyRef(p))
          .map((p: any) => ({
            title: String(p.title).trim(),
            companyId: typeof p.companyId === 'string' && contextCompanyIds.has(p.companyId) ? p.companyId : null,
            companyIndex: typeof p.companyIndex === 'number' ? p.companyIndex : null,
            goal: typeof p.goal === 'string' ? p.goal : null,
            deadline: typeof p.deadline === 'string' ? p.deadline : null,
            blockers: typeof p.blockers === 'string' ? p.blockers : null,
          }));
        const createProjectsFiltered = dropArchivedCompanyTarget(createProjects);

        const requestedGoals = Array.isArray(result.createGoals) ? result.createGoals as unknown[] : [];
        const createGoals = requestedGoals
          .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object' && typeof (g as any).title === 'string' && (g as any).title.trim() && hasCompanyRef(g))
          .map((g: any) => ({
            title: String(g.title).trim(),
            companyId: typeof g.companyId === 'string' && contextCompanyIds.has(g.companyId) ? g.companyId : null,
            companyIndex: typeof g.companyIndex === 'number' ? g.companyIndex : null,
            description: typeof g.description === 'string' ? g.description : null,
            kind: typeof g.kind === 'string' ? g.kind : null,
            // 'archived' is never a creatable status - a fresh INSERT isn't a status
            // transition, so the lifecycle-guard trigger (UPDATE-only) can't catch this
            // the way it catches a later attempt to archive outside archive_goal().
            status: typeof g.status === 'string' && g.status !== 'archived' ? g.status : null,
            dueAt: typeof g.dueAt === 'string' ? g.dueAt : null,
          }));
        const createGoalsFiltered = dropArchivedCompanyTarget(createGoals);

        // Factory Work Orders: real, queued rows for Brain OS's own execution Runner to
        // pick up separately - never executed synchronously in this turn (see the system
        // prompt rule above). Same hasCompanyRef/companyIndex/goalIndex resolution
        // discipline as goals/projects above; workType/priority default server-side to
        // match public.canonical_work_orders' own column defaults, not guessed here.
        const VALID_WORK_TYPES = new Set(['general', 'software_development', 'sales', 'operations', 'service', 'finance', 'engineering']);
        const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
        const requestedFactoryWorkOrders = Array.isArray(result.createFactoryWorkOrders) ? result.createFactoryWorkOrders as unknown[] : [];
        const createFactoryWorkOrdersReq = requestedFactoryWorkOrders
          .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object' && typeof (w as any).title === 'string' && (w as any).title.trim() && hasCompanyRef(w))
          .map((w: any) => ({
            title: String(w.title).trim(),
            objective: typeof w.objective === 'string' ? w.objective : null,
            companyId: typeof w.companyId === 'string' && contextCompanyIds.has(w.companyId) ? w.companyId : null,
            companyIndex: typeof w.companyIndex === 'number' ? w.companyIndex : null,
            goalId: typeof w.goalId === 'string' && contextGoalIds.has(w.goalId) ? w.goalId : null,
            goalIndex: typeof w.goalIndex === 'number' ? w.goalIndex : null,
            workType: typeof w.workType === 'string' && VALID_WORK_TYPES.has(w.workType) ? w.workType : 'software_development',
            priority: typeof w.priority === 'string' && VALID_PRIORITIES.has(w.priority) ? w.priority : 'medium',
            acceptanceCriteria: Array.isArray(w.acceptanceCriteria) ? w.acceptanceCriteria.filter((c: unknown) => typeof c === 'string') : [],
          }));
        const createFactoryWorkOrdersReqFiltered = dropArchivedCompanyTarget(createFactoryWorkOrdersReq);

        // Departments/leads/documents: same low-risk, immediate-execution treatment as
        // companies/people/projects/goals above — not on the high-risk list, so no
        // approval gate. Unlike projects/goals these don't go through the
        // sem_execute_ai_command RPC (no schema reason they must be transactional with
        // task/approval creation), so companyIndex is resolved in TS below, after the RPC
        // call, once createdCompanies is known — same "check a real context set, resolve
        // an index into this same response's own creates, never guess" discipline either
        // way. Documents require title+text only (chat can never attach a real file);
        // company is optional for a text-content document, matching createDocument's own
        // manual "paste text" path in web/lib/data/documents.ts.
        const contextDepartmentIds = new Set((contextPack?.departments || []).map((d: any) => d.id));
        const contextLeadIds = new Set((contextPack?.leads || []).map((l: any) => l.id));
        const VALID_SENSITIVITY = new Set(['public', 'internal', 'confidential', 'restricted', 'founder_only']);
        const requestedDepartmentCreates = Array.isArray(result.createDepartments) ? result.createDepartments as unknown[] : [];
        const createDepartmentsReq = requestedDepartmentCreates
          .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && typeof (d as any).name === 'string' && (d as any).name.trim() && hasCompanyRef(d))
          .map((d: any) => ({
            name: String(d.name).trim(),
            companyId: typeof d.companyId === 'string' && contextCompanyIds.has(d.companyId) ? d.companyId : null,
            companyIndex: typeof d.companyIndex === 'number' ? d.companyIndex : null,
          }));
        const createDepartmentsReqFiltered = dropArchivedCompanyTarget(createDepartmentsReq);
        const requestedDepartmentUpdates = Array.isArray(result.updateDepartments) ? result.updateDepartments as unknown[] : [];
        const updateDepartmentsReq = requestedDepartmentUpdates
          .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && typeof (d as any).id === 'string' && contextDepartmentIds.has((d as any).id))
          .map((d: any) => ({
            id: d.id as string,
            name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : null,
            companyId: typeof d.companyId === 'string' && contextCompanyIds.has(d.companyId) ? d.companyId : null,
            companyIndex: typeof d.companyIndex === 'number' ? d.companyIndex : null,
          }));

        const requestedLeadCreates = Array.isArray(result.createLeads) ? result.createLeads as unknown[] : [];
        const createLeadsReq = requestedLeadCreates
          .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object' && typeof (l as any).clientName === 'string' && (l as any).clientName.trim() && hasCompanyRef(l))
          .map((l: any) => ({
            clientName: String(l.clientName).trim(),
            companyId: typeof l.companyId === 'string' && contextCompanyIds.has(l.companyId) ? l.companyId : null,
            companyIndex: typeof l.companyIndex === 'number' ? l.companyIndex : null,
            contactName: typeof l.contactName === 'string' ? l.contactName : null,
            contactEmail: typeof l.contactEmail === 'string' ? l.contactEmail : null,
            stage: typeof l.stage === 'string' ? l.stage : null,
            valueEstimate: typeof l.valueEstimate === 'number' ? l.valueEstimate : null,
          }));
        const createLeadsReqFiltered = dropArchivedCompanyTarget(createLeadsReq);
        const requestedLeadUpdates = Array.isArray(result.updateLeads) ? result.updateLeads as unknown[] : [];
        const updateLeadsReq = requestedLeadUpdates
          .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object' && typeof (l as any).id === 'string' && contextLeadIds.has((l as any).id))
          .map((l: any) => ({
            id: l.id as string,
            clientName: typeof l.clientName === 'string' && l.clientName.trim() ? l.clientName.trim() : null,
            contactName: typeof l.contactName === 'string' ? l.contactName : null,
            contactEmail: typeof l.contactEmail === 'string' ? l.contactEmail : null,
            stage: typeof l.stage === 'string' ? l.stage : null,
            valueEstimate: typeof l.valueEstimate === 'number' ? l.valueEstimate : null,
          }));

        const requestedDocumentCreates = Array.isArray(result.createDocuments) ? result.createDocuments as unknown[] : [];
        const createDocumentsReq = requestedDocumentCreates
          .filter((doc): doc is Record<string, unknown> => !!doc && typeof doc === 'object' && typeof (doc as any).title === 'string' && (doc as any).title.trim() && typeof (doc as any).text === 'string' && (doc as any).text.trim())
          .map((doc: any) => ({
            title: String(doc.title).trim(),
            companyId: typeof doc.companyId === 'string' && contextCompanyIds.has(doc.companyId) ? doc.companyId : null,
            companyIndex: typeof doc.companyIndex === 'number' ? doc.companyIndex : null,
            category: typeof doc.category === 'string' && doc.category.trim() ? doc.category.trim() : 'General',
            sensitivity: typeof doc.sensitivity === 'string' && VALID_SENSITIVITY.has(doc.sensitivity) ? doc.sensitivity : 'internal',
            text: String(doc.text).trim(),
          }));

        // Product lines/specs/drawings, AI providers, MCP connectors, proposals: same
        // low-risk immediate-execution treatment, resolved/executed in TS after the RPC
        // (see the departments/leads/documents block above for why). unitCost is
        // deliberately never accepted from the model — matches web/CLAUDE.md's existing
        // line that margin/cost data must not enter a caller's context beyond what
        // their own RLS already allows, extended here to the write path too.
        const contextProductIds = new Set((contextPack?.products || []).map((p: any) => p.id));
        const contextProductSpecIds = new Set((contextPack?.productSpecs || []).map((s: any) => s.id));
        const contextDrawingIds = new Set((contextPack?.engineeringDrawings || []).map((d: any) => d.id));
        const contextAiProviderIds = new Set((contextPack?.aiProviders || []).map((p: any) => p.id));
        const contextMcpConnectorIds = new Set((contextPack?.mcpConnectors || []).map((c: any) => c.id));
        const contextProposalIds = new Set((contextPack?.proposals || []).map((p: any) => p.id));

        const requestedProductLineCreates = Array.isArray(result.createProductLines) ? result.createProductLines as unknown[] : [];
        const createProductLinesReq = requestedProductLineCreates
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).name === 'string' && (p as any).name.trim() && hasCompanyRef(p))
          .map((p: any) => ({
            name: String(p.name).trim(),
            companyId: typeof p.companyId === 'string' && contextCompanyIds.has(p.companyId) ? p.companyId : null,
            companyIndex: typeof p.companyIndex === 'number' ? p.companyIndex : null,
            currency: typeof p.currency === 'string' && p.currency.trim() ? p.currency.trim() : 'USD',
            unitPrice: typeof p.unitPrice === 'number' ? p.unitPrice : 0,
          }));
        const requestedProductLineUpdates = Array.isArray(result.updateProductLines) ? result.updateProductLines as unknown[] : [];
        const updateProductLinesReq = requestedProductLineUpdates
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).id === 'string' && contextProductIds.has((p as any).id))
          .map((p: any) => ({
            id: p.id as string,
            name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null,
            unitPrice: typeof p.unitPrice === 'number' ? p.unitPrice : null,
            active: typeof p.active === 'boolean' ? p.active : null,
          }));
        const requestedDeleteProductLineIds = Array.isArray(result.deleteProductLineIds) ? result.deleteProductLineIds as unknown[] : [];
        const deleteProductLineIds = requestedDeleteProductLineIds.filter((id): id is string => typeof id === 'string' && contextProductIds.has(id));

        const requestedProductSpecCreates = Array.isArray(result.createProductSpecs) ? result.createProductSpecs as unknown[] : [];
        const createProductSpecsReq = requestedProductSpecCreates
          .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as any).title === 'string' && (s as any).title.trim())
          .map((s: any) => ({
            title: String(s.title).trim(),
            companyId: typeof s.companyId === 'string' && contextCompanyIds.has(s.companyId) ? s.companyId : null,
            companyIndex: typeof s.companyIndex === 'number' ? s.companyIndex : null,
            problem: typeof s.problem === 'string' ? s.problem : null,
          }));
        const requestedProductSpecUpdates = Array.isArray(result.updateProductSpecs) ? result.updateProductSpecs as unknown[] : [];
        const updateProductSpecsReq = requestedProductSpecUpdates
          .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as any).id === 'string' && contextProductSpecIds.has((s as any).id))
          .map((s: any) => ({
            id: s.id as string,
            title: typeof s.title === 'string' && s.title.trim() ? s.title.trim() : null,
            status: typeof s.status === 'string' ? s.status : null,
            bodyMd: typeof s.bodyMd === 'string' ? s.bodyMd : null,
          }));
        const requestedDeleteProductSpecIds = Array.isArray(result.deleteProductSpecIds) ? result.deleteProductSpecIds as unknown[] : [];
        const deleteProductSpecIds = requestedDeleteProductSpecIds.filter((id): id is string => typeof id === 'string' && contextProductSpecIds.has(id));

        const requestedDrawingCreates = Array.isArray(result.createEngineeringDrawings) ? result.createEngineeringDrawings as unknown[] : [];
        const createDrawingsReq = requestedDrawingCreates
          .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && typeof (d as any).description === 'string' && (d as any).description.trim())
          .map((d: any) => ({
            description: String(d.description).trim(),
            companyId: typeof d.companyId === 'string' && contextCompanyIds.has(d.companyId) ? d.companyId : null,
            companyIndex: typeof d.companyIndex === 'number' ? d.companyIndex : null,
          }));
        const requestedDeleteDrawingIds = Array.isArray(result.deleteEngineeringDrawingIds) ? result.deleteEngineeringDrawingIds as unknown[] : [];
        const deleteDrawingIds = requestedDeleteDrawingIds.filter((id): id is string => typeof id === 'string' && contextDrawingIds.has(id));

        const VALID_AI_PROVIDERS = new Set(['openai', 'anthropic']);
        const requestedAiProviderCreates = Array.isArray(result.createAiProviders) ? result.createAiProviders as unknown[] : [];
        const createAiProvidersReq = requestedAiProviderCreates
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).provider === 'string' && VALID_AI_PROVIDERS.has((p as any).provider) && typeof (p as any).model === 'string' && (p as any).model.trim())
          .map((p: any) => ({
            provider: p.provider as 'openai' | 'anthropic',
            model: String(p.model).trim(),
            label: typeof p.label === 'string' && p.label.trim() ? p.label.trim() : String(p.model).trim(),
          }));
        const activateAiProviderId = typeof result.activateAiProviderId === 'string' && contextAiProviderIds.has(result.activateAiProviderId) ? result.activateAiProviderId : null;
        const requestedDeleteAiProviderIds = Array.isArray(result.deleteAiProviderIds) ? result.deleteAiProviderIds as unknown[] : [];
        const deleteAiProviderIds = requestedDeleteAiProviderIds.filter((id): id is string => typeof id === 'string' && contextAiProviderIds.has(id));
        const requestedDeleteMcpConnectorIds = Array.isArray(result.deleteMcpConnectorIds) ? result.deleteMcpConnectorIds as unknown[] : [];
        const deleteMcpConnectorIds = requestedDeleteMcpConnectorIds.filter((id): id is string => typeof id === 'string' && contextMcpConnectorIds.has(id));

        // Proposals: deliberately thin — bare draft only, never pricing/status. See the
        // system prompt rule above for why real proposal pricing isn't duplicated here.
        const requestedProposalCreates = Array.isArray(result.createProposals) ? result.createProposals as unknown[] : [];
        const createProposalsReq = requestedProposalCreates
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).title === 'string' && (p as any).title.trim() && hasCompanyRef(p))
          .map((p: any) => ({
            title: String(p.title).trim(),
            companyId: typeof p.companyId === 'string' && contextCompanyIds.has(p.companyId) ? p.companyId : null,
            companyIndex: typeof p.companyIndex === 'number' ? p.companyIndex : null,
          }));
        const requestedProposalUpdates = Array.isArray(result.updateProposals) ? result.updateProposals as unknown[] : [];
        const updateProposalsReq = requestedProposalUpdates
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).id === 'string' && contextProposalIds.has((p as any).id))
          .map((p: any) => ({
            id: p.id as string,
            title: typeof p.title === 'string' && p.title.trim() ? p.title.trim() : null,
            paymentTerms: typeof p.paymentTerms === 'string' ? p.paymentTerms : null,
          }));
        const requestedDeleteProposalIds = Array.isArray(result.deleteProposalIds) ? result.deleteProposalIds as unknown[] : [];
        const deleteProposalIds = requestedDeleteProposalIds.filter((id): id is string => typeof id === 'string' && contextProposalIds.has(id));

        // Execute all six deletions now (immediate, same as channels/approvals above) —
        // one shared helper since the shape (delete by id list, count real affected rows,
        // surface a real error instead of swallowing it) is identical across all of them.
        async function deleteByIds(table: string, ids: string[], label: string): Promise<number> {
          if (ids.length === 0) return 0;
          const { data, error } = await supabase.from(table).delete().in('id', ids).select('id');
          if (error) {
            result.summary = `${result.summary || ''}\n\n(${label} deletion failed: ${error.message})`.trim();
            return 0;
          }
          return data?.length || 0;
        }
        const deletedProductLineCount = await deleteByIds('product_lines', deleteProductLineIds, 'Product line');
        const deletedProductSpecCount = await deleteByIds('product_specs', deleteProductSpecIds, 'Software spec');
        const deletedDrawingCount = await deleteByIds('engineering_drawings', deleteDrawingIds, 'Engineering drawing');
        const deletedAiProviderCount = await deleteByIds('ai_providers', deleteAiProviderIds, 'AI provider');
        const deletedMcpConnectorCount = await deleteByIds('mcp_connectors', deleteMcpConnectorIds, 'MCP connector');
        const deletedProposalCount = await deleteByIds('proposals', deleteProposalIds, 'Proposal');

        // Company relationships / person assignments: real, sensitive data (founder-only
        // and manager-scoped RLS is the real authorization) — state defaults to the
        // safest option ("planned") per the "never treat an intention as an
        // already-completed legal transfer" rule; only an explicit, valid "current" is
        // ever honored, and ownerProfileId is only trusted if it exactly matches the
        // calling profile — never any other value the model might supply.
        const VALID_RELATIONSHIP_STATES = new Set(['current', 'planned', 'historical', 'under_restructuring']);
        const VALID_RELATIONSHIP_TYPES = new Set(['parent_of', 'owned_by_percentage', 'business_unit_of', 'brand_of', 'subsidiary_of', 'department_of']);
        const requestedRelationships = Array.isArray(result.createCompanyRelationships) ? result.createCompanyRelationships as unknown[] : [];
        const createCompanyRelationships = requestedRelationships
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && hasCompanyRef(r))
          .map((r: any) => ({
            companyId: typeof r.companyId === 'string' && contextCompanyIds.has(r.companyId) ? r.companyId : null,
            companyIndex: typeof r.companyIndex === 'number' ? r.companyIndex : null,
            relatedCompanyId: typeof r.relatedCompanyId === 'string' && contextCompanyIds.has(r.relatedCompanyId) ? r.relatedCompanyId : null,
            relatedCompanyIndex: typeof r.relatedCompanyIndex === 'number' ? r.relatedCompanyIndex : null,
            ownerProfileId: typeof r.ownerProfileId === 'string' && r.ownerProfileId === profile.id ? r.ownerProfileId : null,
            relationshipType: typeof r.relationshipType === 'string' && VALID_RELATIONSHIP_TYPES.has(r.relationshipType) ? r.relationshipType : 'parent_of',
            ownershipPct: typeof r.ownershipPct === 'number' ? r.ownershipPct : null,
            state: typeof r.state === 'string' && VALID_RELATIONSHIP_STATES.has(r.state) ? r.state : 'planned',
            effectiveDate: typeof r.effectiveDate === 'string' ? r.effectiveDate : null,
            notes: typeof r.notes === 'string' ? r.notes : null,
          }));

        const VALID_ASSIGNMENT_STATES = new Set(['current', 'planned', 'historical']);
        const VALID_EMPLOYMENT_TYPES = new Set(['full_time', 'part_time', 'contractor', 'advisor']);
        const requestedAssignments = Array.isArray(result.createPersonAssignments) ? result.createPersonAssignments as unknown[] : [];
        const createPersonAssignments = requestedAssignments
          .filter((a): a is Record<string, unknown> =>
            !!a && typeof a === 'object' &&
            ((typeof (a as any).personId === 'string' && contextPersonIds.has((a as any).personId)) || typeof (a as any).personIndex === 'number'))
          .map((a: any) => ({
            personId: typeof a.personId === 'string' && contextPersonIds.has(a.personId) ? a.personId : null,
            personIndex: typeof a.personIndex === 'number' ? a.personIndex : null,
            legalEmployerCompanyId: typeof a.legalEmployerCompanyId === 'string' && contextCompanyIds.has(a.legalEmployerCompanyId) ? a.legalEmployerCompanyId : null,
            legalEmployerCompanyIndex: typeof a.legalEmployerCompanyIndex === 'number' ? a.legalEmployerCompanyIndex : null,
            operatingCompanyId: typeof a.operatingCompanyId === 'string' && contextCompanyIds.has(a.operatingCompanyId) ? a.operatingCompanyId : null,
            operatingCompanyIndex: typeof a.operatingCompanyIndex === 'number' ? a.operatingCompanyIndex : null,
            departmentId: typeof a.departmentId === 'string' ? a.departmentId : null,
            jobTitle: typeof a.jobTitle === 'string' ? a.jobTitle : null,
            managerPersonId: typeof a.managerPersonId === 'string' && contextPersonIds.has(a.managerPersonId) ? a.managerPersonId : null,
            managerPersonIndex: typeof a.managerPersonIndex === 'number' ? a.managerPersonIndex : null,
            employmentType: typeof a.employmentType === 'string' && VALID_EMPLOYMENT_TYPES.has(a.employmentType) ? a.employmentType : 'full_time',
            allocationPct: typeof a.allocationPct === 'number' ? a.allocationPct : null,
            startDate: typeof a.startDate === 'string' ? a.startDate : null,
            endDate: typeof a.endDate === 'string' ? a.endDate : null,
            isPrimary: typeof a.isPrimary === 'boolean' ? a.isPrimary : true,
            responsibilities: typeof a.responsibilities === 'string' ? a.responsibilities : null,
            state: typeof a.state === 'string' && VALID_ASSIGNMENT_STATES.has(a.state) ? a.state : 'current',
          }));
        // operatingCompanyId is "where this person actually works" - assigning someone to
        // an archived company is new-work creation against a deleted company, same class
        // as createProjects/createGoals above. legalEmployerCompanyId is left unfiltered:
        // it can legitimately be a dormant legal entity kept for payroll/compliance
        // history, not necessarily where the work happens.
        const createPersonAssignmentsFiltered = createPersonAssignments.filter((a) => {
          if (a.operatingCompanyId && archivedCompanyIds.has(a.operatingCompanyId)) {
            archivedCompanyBlockedCount++;
            return false;
          }
          return true;
        });

        // Memory candidates: cap at 8 (one embeddings call, bounded cost/latency),
        // require a real fact string, default entityType/entityId to this
        // conversation's channel when the model omits them, validate sensitivity
        // against the real enum. Embeddings are computed here (batched) rather than in
        // SQL — a failed/missing OpenAI call still saves the fact, just unembedded.
        const VALID_MEMORY_SENSITIVITY = new Set(['public', 'internal', 'confidential', 'restricted', 'founder_only']);
        const requestedMemories = Array.isArray(result.memoryCandidates) ? result.memoryCandidates as unknown[] : [];
        const memoryFacts = requestedMemories
          .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && typeof (m as any).fact === 'string' && (m as any).fact.trim())
          .slice(0, 8)
          .map((m: any) => {
            const entityType = typeof m.entityType === 'string' && m.entityType.trim() ? m.entityType.trim() : 'chat_channel';
            const entityId = typeof m.entityId === 'string' && m.entityId.trim()
              ? m.entityId.trim()
              : (entityType === 'chat_channel' ? channelId : null);
            const fact = String(m.fact).trim();
            const modelSensitivity = typeof m.sensitivity === 'string' && VALID_MEMORY_SENSITIVITY.has(m.sensitivity) ? m.sensitivity : 'internal';
            const floor = detectMemorySensitivityFloor(fact);
            const sensitivity = floor && SENSITIVITY_RANK[modelSensitivity] < SENSITIVITY_RANK[floor] ? floor : modelSensitivity;
            return {
              entityType,
              entityId,
              fact,
              confidence: typeof m.confidence === 'number' ? m.confidence : 0.8,
              sensitivity,
              companyId: typeof m.companyId === 'string' && contextCompanyIds.has(m.companyId) ? m.companyId : null,
              companyIndex: typeof m.companyIndex === 'number' ? m.companyIndex : null,
            };
          });
        const memoryEmbeddings = await embedTexts(memoryFacts.map(m => m.fact), openaiKey);
        const createMemoryCandidates = memoryFacts.map((m, i) => {
          const embedding = memoryEmbeddings[i];
          return embedding ? { ...m, embedding } : m;
        });

        const modelApprovals = (result.approvals || []) as Array<{title?:string; reason?:string; riskLevel?:string; taskIndex?:number|null}>;
        const modelApprovalTaskIndexes = new Set(modelApprovals.map(a => a.taskIndex).filter((i): i is number => typeof i === 'number'));
        type ForcedApproval = {title:string; reason:string; riskLevel:string; taskIndex:number|null; execute?:{action:string; taskIds?:string[]; channelIds?:string[]}};
        const forcedApprovals: ForcedApproval[] = forcedApprovalTaskIndexes
          .filter(i => !modelApprovalTaskIndexes.has(i))
          .map(i => ({
            title: `Approval required: ${resultTasks[i].title}`,
            reason: `Server-side risk policy forced approval (matched: ${detectForcedApprovalKeywords(resultTasks[i].title || '', resultTasks[i].description || '').join(', ')}).`,
            riskLevel: resultTasks[i].riskLevel || 'high',
            taskIndex: i
          }));
        if (deleteTaskIds.length > 0) {
          forcedApprovals.push({
            title: `Approval required: delete ${deleteTaskIds.length} task(s)`,
            reason: 'Server-side risk policy forces approval for any task deletion.',
            riskLevel: 'high',
            taskIndex: null,
          });
        }
        if (deletedChannelCount > 0) {
          forcedApprovals.push({
            title: `Approval required: deleted ${deletedChannelCount} chat channel(s)`,
            reason: 'Server-side risk policy forces approval for any channel deletion.',
            riskLevel: 'high',
            taskIndex: null,
          });
        }
        // Same immediate-delete-then-audit shape for the newer entities — one push per
        // non-zero count, deliberately not a loop, so each keeps its own clear label.
        if (deletedProductLineCount > 0) forcedApprovals.push({ title: `Approval required: deleted ${deletedProductLineCount} product line(s)`, reason: 'Server-side risk policy forces approval for any product/pricing deletion.', riskLevel: 'high', taskIndex: null });
        if (deletedProductSpecCount > 0) forcedApprovals.push({ title: `Approval required: deleted ${deletedProductSpecCount} software spec(s)`, reason: 'Server-side risk policy forces approval for any deletion.', riskLevel: 'high', taskIndex: null });
        if (deletedDrawingCount > 0) forcedApprovals.push({ title: `Approval required: deleted ${deletedDrawingCount} engineering drawing(s)`, reason: 'Server-side risk policy forces approval for any deletion.', riskLevel: 'high', taskIndex: null });
        if (deletedAiProviderCount > 0) forcedApprovals.push({ title: `Approval required: deleted ${deletedAiProviderCount} AI provider(s)`, reason: 'Server-side risk policy forces approval for any AI provider deletion.', riskLevel: 'high', taskIndex: null });
        if (deletedMcpConnectorCount > 0) forcedApprovals.push({ title: `Approval required: deleted ${deletedMcpConnectorCount} MCP connector(s)`, reason: 'Server-side risk policy forces approval for any MCP connector deletion.', riskLevel: 'high', taskIndex: null });
        if (deletedProposalCount > 0) forcedApprovals.push({ title: `Approval required: deleted ${deletedProposalCount} proposal(s)`, reason: 'Server-side risk policy forces approval for any proposal deletion.', riskLevel: 'high', taskIndex: null });
        // Deferred deletions (pendingDeleteTaskIds/pendingDeleteChannelIds): nothing has
        // been deleted yet — the execute payload is what lets decide_approval() (migration
        // 202608270005) perform the deletion later, exactly once, only once approved. The
        // ids were already cross-checked against contextTaskIds/contextChannelIds above,
        // same discipline as the immediate delete path.
        if (pendingDeleteTaskIds.length > 0) {
          forcedApprovals.push({
            title: `Approval required: delete ${pendingDeleteTaskIds.length} task(s)`,
            reason: 'Deletion deferred pending approval — will delete these exact tasks once approved.',
            riskLevel: 'high',
            taskIndex: null,
            execute: { action: 'delete_tasks', taskIds: pendingDeleteTaskIds },
          });
        }
        if (pendingDeleteChannelIds.length > 0) {
          forcedApprovals.push({
            title: `Approval required: delete ${pendingDeleteChannelIds.length} channel(s)`,
            reason: 'Deletion deferred pending approval — will delete these exact channels once approved.',
            riskLevel: 'high',
            taskIndex: null,
            execute: { action: 'delete_channels', channelIds: pendingDeleteChannelIds },
          });
        }
        // Domain drives approvals_update_approver RLS routing (salary/finance -> HR-finance role,
        // legal -> founder/admin only, general/production/external_comms -> company manager).
        // Prefer the linked task's own text (more specific) over the approval's own title/reason.
        // execute is intentionally read only from forcedApprovals (server-built, from ids
        // already cross-checked against context above) and never from modelApprovals — the
        // model's raw JSON output is untrusted input, and letting it set its own "execute"
        // object here would let it name arbitrary task/channel ids for decide_approval() to
        // delete later, bypassing the context cross-check entirely.
        const approvalPayloads = [...modelApprovals, ...forcedApprovals].map((a, idx) => {
          const sourceTask = typeof a.taskIndex === 'number' ? resultTasks[a.taskIndex] : null;
          const domain = sourceTask
            ? detectApprovalDomain(sourceTask.title || '', sourceTask.description || '')
            : detectApprovalDomain(a.title || '', a.reason || '');
          const execute = idx >= modelApprovals.length ? (a as ForcedApproval).execute ?? null : null;
          return { title: a.title || 'Approval required', reason: a.reason || 'Risk policy requires approval', riskLevel: a.riskLevel || 'medium', domain, taskIndex: a.taskIndex ?? null, execute };
        });

        // KNOWN_FAILURE_MODES.md #7: company_id was never populated on work_orders/
        // chat_channels/audit_logs (100% null on real rows), which makes company_manager
        // RLS visibility on those tables inert in practice — silently over-restrictive,
        // not a leak, but real. Only set when the command is unambiguously about one
        // company (the active channel's own company, or every task/memory this command
        // touched agreeing on the same company) — never guessed when multiple companies
        // are involved or none are, since a wrong company tag would be worse than none.
        // memoryFacts is included, not just tasks: a real live test found a memory-only
        // command (no task created, just "remember X about CLIX GPS") left company_id
        // null even though the memory itself resolved a real company — tasks alone missed
        // this whole class of command.
        const activeChannelCompanyId = contextPack?.activeChannelId
          ? (contextPack?.channels || []).find((c: any) => c.id === contextPack.activeChannelId)?.company_id ?? null
          : null;
        const touchedCompanyIds = new Set([
          ...taskPayloads.map(t => t.companyId).filter((id): id is string => !!id),
          ...memoryFacts.map(m => m.companyId).filter((id): id is string => !!id),
        ]);
        const primaryCompanyId: string | null = activeChannelCompanyId
          ? activeChannelCompanyId
          : touchedCompanyIds.size === 1 ? [...touchedCompanyIds][0] : null;

        const finalInputTokens = usageRef.current?.input_tokens || tokenEstimate;
        const finalOutputTokens = usageRef.current?.output_tokens || 0;
        const { data: rpcResult, error: rpcError } = await supabase.rpc('sem_execute_ai_command', {
          p_command: command,
          p_primary_company_id: primaryCompanyId,
          p_context_pack: contextPack,
          p_output: result,
          p_token_estimate: tokenEstimate,
          p_tasks: taskPayloads,
          p_approvals: approvalPayloads,
          p_model_name: model,
          p_input_tokens: finalInputTokens,
          p_output_tokens: finalOutputTokens,
          p_estimated_cost_usd: estimateCost(model, finalInputTokens, finalOutputTokens),
          p_deleted_task_ids: deleteTaskIds,
          p_companies: createCompanies,
          p_people: createPeople,
          p_projects: createProjectsFiltered,
          p_goals: createGoalsFiltered,
          p_company_relationships: createCompanyRelationships,
          p_person_assignments: createPersonAssignmentsFiltered,
          p_work_order_id: workOrderId,
          p_memory_candidates: createMemoryCandidates
        });
        if(rpcError) {
          if (workOrderId) {
            await supabase.rpc('mark_work_order_failed', { p_work_order_id: workOrderId, p_error: rpcError.message || 'Failed to persist AI command result' });
          }
          send({ type: 'error', error: rpcError.message || 'Failed to persist AI command result' });
          return;
        }

        const workOrder = { id: rpcResult.workOrderId };
        const createdTasks = rpcResult.createdTasks || [];
        const createdApprovals = rpcResult.createdApprovals || [];
        const deletedTaskIds = rpcResult.deletedTaskIds || [];
        const createdCompanies = rpcResult.createdCompanies || [];
        const createdPeople = rpcResult.createdPeople || [];
        const createdProjects = rpcResult.createdProjects || [];
        const createdGoals = rpcResult.createdGoals || [];
        const createdCompanyRelationships = rpcResult.createdCompanyRelationships || [];
        const createdPersonAssignments = rpcResult.createdPersonAssignments || [];
        const createdMemories = rpcResult.createdMemories || [];

        // Workstream 3c: thread real ids for anything created OR lifecycle-mutated
        // (archived/restored) this turn into the NEXT turn's context
        // (contextPack.recentlyResolvedEntities, built in buildContext() from the
        // immediately-preceding turn's own work_orders.output) so a compound follow-up
        // ("create QA-CONTINUITY-CO and add a new employee there") or a same-conversation
        // pronoun reference to something just mutated ("archive test3" then, next turn,
        // "restore it") doesn't need the model to re-derive an id from its own prior prose.
        // Direct fix for CHAT_COMPOUND_COMMAND_PRESERVES_RESOLVED_COMPANY and, as of
        // 2026-08-30 ("test3 restore" incident), CHAT_CHANNEL_FOCUS_SURVIVES_LIFECYCLE_MUTATION
        // — the original version of this array only ever included CREATES, so "archive
        // test3" (a real, unambiguous, immediately-executed archive - no pendingAction
        // ever gets set, since nothing was left unresolved) left the very next turn's
        // "restore it" with no structured continuity signal at all, live-reproduced
        // forcing a disambiguation across every other archived company in the workspace
        // instead of resolving to the one just touched. Reuses ids/names already resolved
        // above (companyNameById/personNameById/goalTitleById) - no extra query.
        const resolvedEntities: ResolvedEntities = {
          companies: [
            ...createdCompanies.map((c: any) => ({ id: c.id, name: c.name })),
            ...[...archiveCompanyIds, ...restoreCompanyIds].map((id) => ({ id, name: String(companyNameById.get(id) || id) })),
          ],
          people: [
            ...createdPeople.map((p: any) => ({ id: p.id, name: p.full_name })),
            ...[...endEmploymentPersonIds, ...restoreEmploymentPersonIds].map((id) => ({ id, name: String(personNameById.get(id) || id) })),
          ],
          goals: [
            ...createdGoals.map((g: any) => ({ id: g.id, name: g.title })),
            ...[...archiveGoalIds, ...restoreGoalIds].map((id) => ({ id, name: String(goalTitleById.get(id) || id) })),
          ],
        };
        const hasResolvedEntities = resolvedEntities.companies.length > 0 || resolvedEntities.people.length > 0 || resolvedEntities.goals.length > 0;
        if (hasResolvedEntities) {
          result.resolvedEntities = resolvedEntities;
        }

        // Departments/leads/documents: executed here, outside the RPC's transaction —
        // resolves companyIndex against createdCompanies (just returned above) the same
        // way the RPC resolves it internally for projects/goals, then does a plain
        // RLS-scoped insert/update and checks the real affected/inserted row, same
        // honest-result discipline as every other mutation in this file (never assume
        // success — qa/KNOWN_FAILURE_MODES.md #17/#18).
        const resolveCompanyId = (companyId: string | null, companyIndex: number | null): string | null =>
          companyId || (typeof companyIndex === 'number' ? (createdCompanies[companyIndex]?.id ?? null) : null);
        const resolveGoalId = (goalId: string | null, goalIndex: number | null): string | null =>
          goalId || (typeof goalIndex === 'number' ? (createdGoals[goalIndex]?.id ?? null) : null);

        // Factory Work Orders: real RPC call (create_factory_work_order, security
        // invoker - the same canonical_work_orders_insert_scope RLS every other caller
        // goes through, founder/admin or has_company_access(company_id)) per requested
        // Work Order. Never batched into sem_execute_ai_command's own transaction -
        // same "not on the high-risk list, resolved/executed here" treatment as
        // departments/leads/documents above.
        const createdFactoryWorkOrders: { id: string; title: string }[] = [];
        for (const w of createFactoryWorkOrdersReqFiltered) {
          const companyId = resolveCompanyId(w.companyId, w.companyIndex);
          if (!companyId) continue;
          const goalId = resolveGoalId(w.goalId, w.goalIndex);
          const { data, error } = await supabase.rpc('create_factory_work_order', {
            p_title: w.title,
            p_objective: w.objective,
            p_company_id: companyId,
            p_goal_id: goalId,
            p_work_type: w.workType,
            p_priority: w.priority,
            p_acceptance_criteria: w.acceptanceCriteria,
          });
          if (!error && data) createdFactoryWorkOrders.push({ id: data as string, title: w.title });
        }

        const createdDepartments: { id: string }[] = [];
        for (const d of createDepartmentsReqFiltered) {
          const companyId = resolveCompanyId(d.companyId, d.companyIndex);
          if (!companyId) continue;
          const slug = d.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const { data, error } = await supabase.from('departments').insert({ company_id: companyId, name: d.name, slug }).select('id').single();
          if (!error && data) createdDepartments.push(data);
        }
        let updatedDepartmentCount = 0;
        for (const d of updateDepartmentsReq) {
          const patch: Record<string, unknown> = {};
          if (d.name) { patch.name = d.name; patch.slug = d.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
          const companyId = resolveCompanyId(d.companyId, d.companyIndex);
          if (companyId) patch.company_id = companyId;
          if (Object.keys(patch).length === 0) continue;
          const { data } = await supabase.from('departments').update(patch).eq('id', d.id).select('id');
          if (data && data.length > 0) updatedDepartmentCount++;
        }

        // owner_person_id must be the caller's own person row — matches createLead's own
        // reasoning in web/lib/data/sales.ts: sales_leads_update_own_or_manager requires
        // either company-manager or an owner_person_id match, so a lead left ownerless is
        // invisible to non-manager updates from here on, same real bug already fixed once
        // for the manual path. Only resolved if createLeadsReq is non-empty (skip the
        // query entirely on requests that don't need it).
        let callerPersonId: string | null = null;
        if (createLeadsReqFiltered.length > 0) {
          const { data: callerPerson } = await supabase.from('people').select('id').eq('profile_id', profile.id).maybeSingle();
          callerPersonId = callerPerson?.id ?? null;
        }
        const createdLeads: { id: string }[] = [];
        for (const l of createLeadsReqFiltered) {
          const companyId = resolveCompanyId(l.companyId, l.companyIndex);
          if (!companyId) continue;
          const { data, error } = await supabase.from('sales_leads').insert({
            client_name: l.clientName, company_id: companyId, contact_name: l.contactName, contact_email: l.contactEmail,
            stage: l.stage || 'lead', value_estimate: l.valueEstimate ?? 0, owner_person_id: callerPersonId,
          }).select('id').single();
          if (!error && data) createdLeads.push(data);
        }
        let updatedLeadCount = 0;
        for (const l of updateLeadsReq) {
          const patch: Record<string, unknown> = {};
          if (l.clientName) patch.client_name = l.clientName;
          if (l.contactName !== null) patch.contact_name = l.contactName;
          if (l.contactEmail !== null) patch.contact_email = l.contactEmail;
          if (l.stage) patch.stage = l.stage;
          if (l.valueEstimate !== null) patch.value_estimate = l.valueEstimate;
          if (Object.keys(patch).length === 0) continue;
          const { data } = await supabase.from('sales_leads').update(patch).eq('id', l.id).select('id');
          if (data && data.length > 0) updatedLeadCount++;
        }

        const createdDocuments: { id: string }[] = [];
        for (const doc of createDocumentsReq) {
          const companyId = resolveCompanyId(doc.companyId, doc.companyIndex);
          const { data, error } = await supabase.from('documents').insert({
            title: doc.title, company_id: companyId, category: doc.category, mime_type: 'text/plain',
            extracted_text: doc.text, summary: doc.text.slice(0, 200), sensitivity: doc.sensitivity,
            uploaded_by_profile_id: profile.id,
          }).select('id').single();
          if (!error && data) createdDocuments.push(data);
        }

        const createdProductLines: { id: string }[] = [];
        for (const p of createProductLinesReq) {
          const companyId = resolveCompanyId(p.companyId, p.companyIndex);
          if (!companyId) continue;
          const { data: inserted, error } = await supabase.from('product_lines').insert({
            name: p.name, company_id: companyId, currency: p.currency, unit_price: p.unitPrice,
          }).select('id').single();
          if (!error && inserted) {
            // unit_cost intentionally always 0 here, never model-supplied — see the
            // system prompt rule: cost/margin data stays out of the AI's write path,
            // same line already drawn for what enters its read-side context.
            await supabase.from('product_costs').insert({ product_line_id: inserted.id, unit_cost: 0 });
            createdProductLines.push(inserted);
          }
        }
        let updatedProductLineCount = 0;
        for (const p of updateProductLinesReq) {
          const patch: Record<string, unknown> = {};
          if (p.name) patch.name = p.name;
          if (p.unitPrice !== null) patch.unit_price = p.unitPrice;
          if (p.active !== null) patch.active = p.active;
          if (Object.keys(patch).length === 0) continue;
          const { data } = await supabase.from('product_lines').update(patch).eq('id', p.id).select('id');
          if (data && data.length > 0) updatedProductLineCount++;
        }
        // Any product-line create/update that actually touched pricing gets the same
        // forced audit-approval as a deletion — pricing is on the "discounts/financing"
        // high-risk list even though the write itself is immediate, same reasoning as
        // channel/task deletion executing now and being audited after the fact. This one
        // can't go through the shared forcedApprovals/RPC path above (that's built and
        // sent before this section runs, since these writes need createdCompanies from
        // the RPC's own result) — a plain insert has the identical real-world effect.
        const productLinePricingTouched = createdProductLines.length > 0 || (updatedProductLineCount > 0 && updateProductLinesReq.some((p) => p.unitPrice !== null));
        if (productLinePricingTouched) {
          await supabase.from('approvals').insert({
            company_id: primaryCompanyId,
            title: `Approval required: product line pricing changed via chat (${createdProductLines.length} created, ${updatedProductLineCount} updated)`,
            reason: 'Server-side risk policy forces approval for any product/pricing change.',
            risk_level: 'high', domain: 'general',
          });
        }

        const createdProductSpecs: { id: string }[] = [];
        for (const s of createProductSpecsReq) {
          const companyId = resolveCompanyId(s.companyId, s.companyIndex);
          const { data: spec, error } = await supabase.from('product_specs').insert({
            title: `AI PRD: ${s.title}`, company_id: companyId, status: 'draft', body_md: s.problem,
          }).select('id').single();
          if (error || !spec) continue;
          createdProductSpecs.push(spec);
          // Mirrors createSoftwareSpec's fixed ticket template exactly (web/lib/data/software.ts)
          // — same 6 titles, same approval-required split, so chat-created specs behave
          // identically to UI-created ones rather than a thinner lookalike.
          const ticketTitles = [
            'Write product requirement and acceptance criteria',
            'Identify allowed modules and files only',
            'Implement patch-only code change',
            'Add module-specific UI check',
            'Run regression QA and record evidence',
            'Prepare release approval summary',
          ];
          for (let i = 0; i < ticketTitles.length; i++) {
            await supabase.from('tasks').insert({
              title: `${ticketTitles[i]}: ${s.title}`, company_id: companyId, owner_type: 'human', status: 'queued',
              priority: 'high', risk_level: 'medium', approval_required: i >= 2, source: 'software_factory',
            });
          }
          await supabase.from('approvals').insert({
            company_id: companyId, title: `Approve software factory release: AI PRD: ${s.title}`,
            reason: 'Production-impacting software changes require release gate approval.', risk_level: 'high', domain: 'production',
          });
        }
        let updatedProductSpecCount = 0;
        for (const s of updateProductSpecsReq) {
          const patch: Record<string, unknown> = {};
          if (s.title) patch.title = s.title;
          if (s.status) patch.status = s.status;
          if (s.bodyMd !== null) patch.body_md = s.bodyMd;
          if (Object.keys(patch).length === 0) continue;
          const { data } = await supabase.from('product_specs').update(patch).eq('id', s.id).select('id');
          if (data && data.length > 0) updatedProductSpecCount++;
        }

        // Engineering drawings: invokes the same real generate-technical-drawing Edge
        // Function the manual page uses (web/lib/data/engineering.ts) — the SVG is real
        // generated content, never something the model writes into the row itself.
        const createdDrawings: { id: string }[] = [];
        for (const d of createDrawingsReq) {
          const companyId = resolveCompanyId(d.companyId, d.companyIndex);
          const { data: gen, error: genError } = await supabase.functions.invoke('generate-technical-drawing', { body: { description: d.description } });
          if (genError) continue;
          const genResult = gen?.result;
          if (!genResult?.svg) continue;
          const { data: inserted, error } = await supabase.from('engineering_drawings').insert({
            company_id: companyId,
            title: typeof genResult.title === 'string' && genResult.title.trim() ? genResult.title.trim() : d.description.slice(0, 80),
            description: d.description, svg_content: genResult.svg,
            dimensions_summary: typeof genResult.dimensionsSummary === 'string' ? genResult.dimensionsSummary : null,
            notes: typeof genResult.notes === 'string' ? genResult.notes : null,
            created_by_profile_id: profile.id,
          }).select('id').single();
          if (!error && inserted) createdDrawings.push(inserted);
        }

        const createdAiProviders: { id: string }[] = [];
        for (const p of createAiProvidersReq) {
          const { data, error } = await supabase.from('ai_providers').insert({ provider: p.provider, model: p.model, label: p.label }).select('id').single();
          if (!error && data) createdAiProviders.push(data);
        }
        let activatedAiProvider = false;
        if (activateAiProviderId) {
          await supabase.from('ai_providers').update({ is_active: false }).neq('id', activateAiProviderId);
          const { data } = await supabase.from('ai_providers').update({ is_active: true }).eq('id', activateAiProviderId).select('id');
          activatedAiProvider = !!data && data.length > 0;
        }

        const createdProposals: { id: string }[] = [];
        for (const p of createProposalsReq) {
          const companyId = resolveCompanyId(p.companyId, p.companyIndex);
          if (!companyId) continue;
          const { data, error } = await supabase.from('proposals').insert({ title: p.title, company_id: companyId, status: 'draft' }).select('id').single();
          if (!error && data) createdProposals.push(data);
        }
        let updatedProposalCount = 0;
        for (const p of updateProposalsReq) {
          const patch: Record<string, unknown> = {};
          if (p.title) patch.title = p.title;
          if (p.paymentTerms !== null) patch.payment_terms = p.paymentTerms;
          if (Object.keys(patch).length === 0) continue;
          const { data } = await supabase.from('proposals').update(patch).eq('id', p.id).select('id');
          if (data && data.length > 0) updatedProposalCount++;
        }

        // Ground the reply in what the executor actually did, not what the model's own
        // prose claims — prepended so it's the first thing read regardless of anything the
        // model wrote further down. This is the direct fix for a real production bug: the
        // model narrated "deleting all 12 tasks and 85 pending approvals" when only the 12
        // tasks were real (approvals had no delete mechanism at all at the time) — the
        // model cannot know a true affected count when it writes summary, since execution
        // happens after parsing, so its prose is always describing intent, never a
        // verified result. One line per action actually requested this turn; nothing shown
        // for actions that weren't requested at all.
        const factLines: string[] = [];
        if (deleteTaskIds.length > 0) factLines.push(`Deleted ${deletedTaskIds.length} of ${deleteTaskIds.length} requested task(s).`);
        if (deleteChannelIds.length > 0) factLines.push(`Deleted ${deletedChannelCount} of ${deleteChannelIds.length} requested channel(s).`);
        if (deleteApprovalIds.length > 0) factLines.push(`Deleted ${deletedApprovalCount} of ${deleteApprovalIds.length} requested approval(s).`);
        if (pendingDeleteTaskIds.length > 0) factLines.push(`${pendingDeleteTaskIds.length} task(s) deletion is pending approval — not deleted yet.`);
        if (pendingDeleteChannelIds.length > 0) factLines.push(`${pendingDeleteChannelIds.length} channel(s) deletion is pending approval — not deleted yet.`);
        if (organizationGraphCheck) factLines.push(organizationGraphCheck.summary);

        // Same defect class as the deletion fact-lines above, found by searching for it
        // elsewhere per CLAUDE.md's "find one instance, search the whole class" rule:
        // createProjects/createGoals/createCompanyRelationships/createPersonAssignments
        // are silently filtered (missing a resolvable company/person reference) before
        // ever reaching the RPC, and relationships/assignments have a second silent-skip
        // inside the RPC itself (a malformed entry just doesn't get inserted, no error).
        // The model's summary is written before any of this runs, so exactly like
        // deletions, it can claim a create succeeded when it was actually dropped. Only
        // reported when there's an actual shortfall, so a fully-successful request stays
        // quiet — this is a gap notice, not a routine status line.
        if (requestedProjects.length > createdProjects.length) factLines.push(`${requestedProjects.length - createdProjects.length} of ${requestedProjects.length} requested project(s) could not be created — missing a valid company reference.`);
        if (requestedGoals.length > createdGoals.length) factLines.push(`${requestedGoals.length - createdGoals.length} of ${requestedGoals.length} requested goal(s) could not be created — missing a valid company reference.`);
        // Workstream 5 (Bugs 18/19): factory-work-order confirmations get their OWN
        // full-replacement report instead of living in the shared factLines array (which
        // only PREPENDS to result.summary below) — prepending still let the model's own
        // near-duplicate restatement follow it, the exact reported defect. Exact
        // three-line Outcome/Status/Next-action format the founder specified, and the
        // real UI destination name: "Agent Control Center" is the actual sidebar entry
        // (web/components/app-sidebar.tsx) for Brain OS's Software Factory dashboard,
        // which is where a canonical_work_orders row created here actually shows up
        // (web/lib/data/factory.ts's getRecentWorkOrders/getFactoryOverview both query
        // canonical_work_orders directly) — verified against the live sidebar rather than
        // assumed; "/workflows"'s own sidebar label "Workflow Factory" is a DIFFERENT
        // feature (one-click command templates + product-spec ticket creation, not this
        // Work Order's real build/verification tracking) and is deliberately not used
        // here even though it sounds like the more obvious name. Never "Runner", never a
        // raw UUID in the sentence itself — see executionEvidence below for where the
        // real id goes instead.
        const factoryWorkOrderLines: string[] = [];
        for (const w of createdFactoryWorkOrders) {
          factoryWorkOrderLines.push(
            `Work Order created: ${w.title}.\n\nStatus: Queued.\n\nI'll track build and independent verification in the Agent Control Center.`
          );
        }
        if (createFactoryWorkOrdersReq.length > createdFactoryWorkOrders.length) {
          factoryWorkOrderLines.push(`${createFactoryWorkOrdersReq.length - createdFactoryWorkOrders.length} of ${createFactoryWorkOrdersReq.length} requested Factory Work Order(s) could not be created — missing a valid company reference.`);
        }
        const factoryWorkOrderReport = factoryWorkOrderLines.length > 0 ? factoryWorkOrderLines.join('\n\n') : null;

        // Structured, not narrated: the real id (and, once a run exists, a real commit
        // sha) stays out of default founder-facing prose (see the report above) but
        // remains reachable for a future UI "Details" expansion, same reasoning as the
        // existing SSE `done` event's own createdFactoryWorkOrders array — this is the
        // persisted (work_orders.output), not just streamed, copy of that same fact.
        const executionEvidence: Record<string, unknown> = {};
        if (createdFactoryWorkOrders.length > 0) {
          executionEvidence.factoryWorkOrders = createdFactoryWorkOrders.map((w) => ({ id: w.id, title: w.title, status: 'queued' }));
        }
        const hasExecutionEvidence = Object.keys(executionEvidence).length > 0;
        if (hasExecutionEvidence) {
          result.executionEvidence = executionEvidence;
        }

        if (archivedCompanyBlockedCount > 0) factLines.push(`${archivedCompanyBlockedCount} item(s) were not created because the target company is archived — restore it first.`);

        // Master-prompt spec §42: a batch (>1 item) request gets a structured
        // requested/succeeded/failed contract every time, not only when something went
        // wrong — "Requested: 8. Succeeded: 8. Failed: 0." is itself the confirmation a
        // founder needs for a multi-item command, not just a gap notice. A single-item
        // request keeps the quieter gap-only style (unchanged from before) so the common
        // case doesn't get noisier.
        function batchLine(noun: string, requested: number, succeeded: number, failReason: string): void {
          if (requested === 0) return;
          if (requested === 1) {
            if (succeeded < requested) factLines.push(`${requested - succeeded} of ${requested} requested ${noun} could not be created — ${failReason}.`);
            return;
          }
          factLines.push(`${noun[0].toUpperCase()}${noun.slice(1)} batch — Requested: ${requested}. Succeeded: ${succeeded}. Failed: ${requested - succeeded}.`);
        }
        batchLine('company relationship(s)', requestedRelationships.length, createdCompanyRelationships.length, 'missing a valid company reference or invalid owner/related-company combination');
        batchLine('person assignment(s)', requestedAssignments.length, createdPersonAssignments.length, 'missing a valid person reference');
        if (createDepartmentsReq.length > createdDepartments.length) factLines.push(`${createDepartmentsReq.length - createdDepartments.length} of ${createDepartmentsReq.length} requested department(s) could not be created — missing a valid company reference.`);
        if (updateDepartmentsReq.length > updatedDepartmentCount) factLines.push(`${updateDepartmentsReq.length - updatedDepartmentCount} of ${updateDepartmentsReq.length} requested department update(s) did not apply — no matching department or no access.`);
        if (createLeadsReq.length > createdLeads.length) factLines.push(`${createLeadsReq.length - createdLeads.length} of ${createLeadsReq.length} requested lead(s) could not be created — missing a valid company reference.`);
        if (updateLeadsReq.length > updatedLeadCount) factLines.push(`${updateLeadsReq.length - updatedLeadCount} of ${updateLeadsReq.length} requested lead update(s) did not apply — no matching lead or no access.`);
        if (createDocumentsReq.length > createdDocuments.length) factLines.push(`${createDocumentsReq.length - createdDocuments.length} of ${createDocumentsReq.length} requested document(s) could not be created.`);
        if (createProductLinesReq.length > createdProductLines.length) factLines.push(`${createProductLinesReq.length - createdProductLines.length} of ${createProductLinesReq.length} requested product line(s) could not be created — missing a valid company reference.`);
        if (updateProductLinesReq.length > updatedProductLineCount) factLines.push(`${updateProductLinesReq.length - updatedProductLineCount} of ${updateProductLinesReq.length} requested product line update(s) did not apply — no matching product or no access.`);
        if (deleteProductLineIds.length > 0) factLines.push(`Deleted ${deletedProductLineCount} of ${deleteProductLineIds.length} requested product line(s).`);
        if (createProductSpecsReq.length > createdProductSpecs.length) factLines.push(`${createProductSpecsReq.length - createdProductSpecs.length} of ${createProductSpecsReq.length} requested software spec(s) could not be created.`);
        if (updateProductSpecsReq.length > updatedProductSpecCount) factLines.push(`${updateProductSpecsReq.length - updatedProductSpecCount} of ${updateProductSpecsReq.length} requested software spec update(s) did not apply — no matching spec or no access.`);
        if (deleteProductSpecIds.length > 0) factLines.push(`Deleted ${deletedProductSpecCount} of ${deleteProductSpecIds.length} requested software spec(s).`);
        if (createDrawingsReq.length > createdDrawings.length) factLines.push(`${createDrawingsReq.length - createdDrawings.length} of ${createDrawingsReq.length} requested engineering drawing(s) could not be generated.`);
        if (deleteDrawingIds.length > 0) factLines.push(`Deleted ${deletedDrawingCount} of ${deleteDrawingIds.length} requested engineering drawing(s).`);
        if (createAiProvidersReq.length > createdAiProviders.length) factLines.push(`${createAiProvidersReq.length - createdAiProviders.length} of ${createAiProvidersReq.length} requested AI provider(s) could not be created.`);
        if (activateAiProviderId && !activatedAiProvider) factLines.push(`Could not activate the requested AI provider — no matching provider or no access.`);
        if (deleteAiProviderIds.length > 0) factLines.push(`Deleted ${deletedAiProviderCount} of ${deleteAiProviderIds.length} requested AI provider(s).`);
        if (deleteMcpConnectorIds.length > 0) factLines.push(`Deleted ${deletedMcpConnectorCount} of ${deleteMcpConnectorIds.length} requested MCP connector(s).`);
        if (createProposalsReq.length > createdProposals.length) factLines.push(`${createProposalsReq.length - createdProposals.length} of ${createProposalsReq.length} requested proposal(s) could not be created — missing a valid company reference.`);
        if (updateProposalsReq.length > updatedProposalCount) factLines.push(`${updateProposalsReq.length - updatedProposalCount} of ${updateProposalsReq.length} requested proposal update(s) did not apply — no matching proposal or no access.`);
        if (deleteProposalIds.length > 0) factLines.push(`Deleted ${deletedProposalCount} of ${deleteProposalIds.length} requested proposal(s).`);
        batchLine(
          'company update(s)', updateCompaniesReq.length, updatedCompanyCount,
          companyLifecycleEditsSkipped > 0
            ? 'archived/active status can only change via archive or restore, not a field update — use restoreCompanyIds/archiveCompanyIds instead'
            : 'no matching company or no access',
        );

        if (factLines.length > 0) {
          result.summary = `${factLines.join(' ')}\n\n${result.summary || ''}`.trim();
        }

        // An organization graph check is one where the ENTIRE point of the turn is the
        // real query result — there is no legitimate content the model should be adding
        // beyond it. Prepending (like every other fact-line above) isn't enough here:
        // live-tested, the model's own prose contradicted a correct "clean, no issues
        // found" fact-line by inventing "critical issues" from stale conversation
        // history rather than the actual fresh result. Full replacement removes that
        // failure mode by construction instead of relying on the model reliably
        // following "don't also describe hypothetical problems yourself."
        if (organizationGraphCheck) {
          result.summary = organizationGraphCheck.report;
        }

        // Same full-replacement treatment as the organization graph check above, for the
        // exact defect this migration exists to close: a real archive/restore attempt's
        // outcome is not negotiable prose, it is what actually happened in the database.
        // Combined (not each independently overwriting result.summary) so a turn that
        // touches more than one of companies/tasks/goals doesn't silently lose all but
        // the last report - real, if uncommon (e.g. "archive this company and its task").
        // factoryWorkOrderReport (Workstream 5) joins the same combine array for the
        // identical reason: a real Work Order creation is the entire point of the turn,
        // so it fully replaces the model's own prose rather than merely prepending to it.
        const lifecycleReports = [archiveRestoreReport, taskArchiveRestoreReport, goalArchiveRestoreReport, factoryWorkOrderReport, personLifecycleReport].filter((r): r is string => !!r);
        // Wording deliberately does not presume "you named it ambiguously" (2026-08-30,
        // "test3 restore" incident: the founder named test3 exactly right - the real
        // failure was a mechanism bug, not a naming problem, so a message insisting they
        // "tell me exactly which company" would have been actively misleading in that
        // exact case). Stays honest and general: something was claimed, nothing was
        // actually attempted or completed, full stop - true regardless of whether the
        // underlying cause is genuine ambiguity or a different mechanism failure.
        const lifecycleMismatchCorrections: string[] = [];
        if (claimsCompanyDeleted) lifecycleMismatchCorrections.push('Couldn’t confirm that. No company was actually archived or restored this turn.');
        if (claimsTaskDeleted) lifecycleMismatchCorrections.push('Couldn’t confirm that. No task was actually archived, restored, or deleted this turn.');
        if (claimsGoalDeleted) lifecycleMismatchCorrections.push('Couldn’t confirm that. No goal was actually archived or restored this turn.');
        if (claimsPersonDeleted) lifecycleMismatchCorrections.push('Couldn’t confirm that. No employee’s employment was actually ended or restored this turn.');
        if (lifecycleReports.length > 0) {
          result.summary = lifecycleReports.join(' ');
        } else if (lifecycleMismatchCorrections.length > 0) {
          result.summary = lifecycleMismatchCorrections.join(' ');
        }

        // Real, systemic gap found live: work_orders.output was written once, as
        // p_output, INSIDE the sem_execute_ai_command call above — necessarily before
        // any of the factLines/organizationGraphCheck grounding logic runs, since that
        // logic depends on the RPC's own return values (createdCompanyRelationships etc).
        // That means every fact-line this session has ever built — deletion counts,
        // "N of M could not be created" gap notices, the organization graph check
        // override — was visible only in the live SSE stream and reverted to the raw,
        // ungrounded model text on any page reload or channel revisit (confirmed live:
        // getChatHistory in web/lib/data/chat-history.ts reads work_orders.output
        // directly). Persisting the corrected summary here is what makes every one of
        // those fixes actually durable instead of a one-time-per-request illusion.
        // hasResolvedEntities/hasExecutionEvidence (Workstream 3c/5) join the same
        // persist condition for the identical reason — both mutate `result` directly
        // rather than result.summary, so without this they'd be visible only in this
        // request's own SSE `done` event, not to the next turn's buildContext() read of
        // work_orders.output (recentlyResolvedEntities) or a future reload.
        if (factLines.length > 0 || organizationGraphCheck || lifecycleReports.length > 0 || lifecycleMismatchCorrections.length > 0 || hasResolvedEntities || hasExecutionEvidence) {
          await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);
        }

        await supabase.from('audit_logs').insert({ actor_profile_id:profile.id, actor_role:profile.role, event_type:'ai_command_request_completed', entity_type:'work_order', entity_id:workOrder.id, company_id:primaryCompanyId, message:'AI command request completed', metadata:{ elapsedMs:Date.now()-started, contextErrors, forcedApprovals:forcedApprovalTaskIndexes.length, deletedTasks:deletedTaskIds.length, deletedChannels:deletedChannelCount, deletedApprovals:deletedApprovalCount, companies:createdCompanies.length, people:createdPeople.length, projects:createdProjects.length, goals:createdGoals.length, companyRelationships:createdCompanyRelationships.length, personAssignments:createdPersonAssignments.length, memories:createdMemories.length, departmentsCreated:createdDepartments.length, departmentsUpdated:updatedDepartmentCount, leadsCreated:createdLeads.length, leadsUpdated:updatedLeadCount, documentsCreated:createdDocuments.length, productLinesCreated:createdProductLines.length, productLinesUpdated:updatedProductLineCount, productLinesDeleted:deletedProductLineCount, productSpecsCreated:createdProductSpecs.length, productSpecsUpdated:updatedProductSpecCount, productSpecsDeleted:deletedProductSpecCount, drawingsCreated:createdDrawings.length, drawingsDeleted:deletedDrawingCount, aiProvidersCreated:createdAiProviders.length, aiProviderActivated:activatedAiProvider, aiProvidersDeleted:deletedAiProviderCount, mcpConnectorsDeleted:deletedMcpConnectorCount, proposalsCreated:createdProposals.length, proposalsUpdated:updatedProposalCount, proposalsDeleted:deletedProposalCount, factoryWorkOrdersCreated:createdFactoryWorkOrders.length, companiesUpdated:updatedCompanyCount, companiesArchiveAttempted:archiveCompanyIds.length, companiesRestoreAttempted:restoreCompanyIds.length, tasksArchiveAttempted:archiveTaskIds.length, tasksRestoreAttempted:restoreTaskIds.length, goalsArchiveAttempted:archiveGoalIds.length, goalsRestoreAttempted:restoreGoalIds.length, peopleEndEmploymentAttempted:endEmploymentPersonIds.length, peopleRestoreEmploymentAttempted:restoreEmploymentPersonIds.length, organizationGraphChecked:!!organizationGraphCheck, organizationGraphClean:organizationGraphCheck?.clean ?? null } });

        send({ type: 'done', result, workOrder, createdTasks, createdApprovals, deletedTaskIds, createdCompanies, createdPeople, createdProjects, createdGoals, createdCompanyRelationships, createdPersonAssignments, createdMemories, createdDepartments, updatedDepartmentCount, createdLeads, updatedLeadCount, createdDocuments, createdProductLines, updatedProductLineCount, createdProductSpecs, updatedProductSpecCount, createdDrawings, createdAiProviders, activatedAiProvider, createdProposals, updatedProposalCount, createdFactoryWorkOrders, model, usage: usageRef.current, tokenEstimate, contextErrors, primaryCompanyId });
      } catch (e: any) {
        const errorMessage = e?.body?.error?.message || e?.message || String(e);
        if (workOrderId) {
          await supabase.rpc('mark_work_order_failed', { p_work_order_id: workOrderId, p_error: errorMessage }).catch(() => {});
        }
        send({ type: 'error', error: errorMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
