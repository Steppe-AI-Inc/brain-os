// Permanent regression for a real defect found by the independent verifier while auditing
// commit 15e868a ("Fix root cause: fabricated company status when name falls outside
// context cap"): that fix added an uncapped, targeted named-COMPANY lookup merged into
// context.companies, but context.people (supabase/functions/sem-ai-command/index.ts) had
// the exact same defect class — capped at .limit(30) with no explicit order, no analogous
// targeted lookup — meaning a person named directly in the founder's command could fall
// entirely outside that window and the model would have zero real data to ground an
// employment/status answer for them, the same "fabricate a plausible status" risk 15e868a
// closed for companies. Fixed alongside this test: namedPersonLookupQuery mirrors
// namedCompanyLookupQuery exactly (same commandNameTokens extraction, same ilike-based
// query, same dedup-by-id merge into the base capped list before any downstream
// computation), plus a personCurrentStatus annotation on memories (entity_type='person')
// mirroring companyCurrentStatus (entity_id has no FK, so unlike company_id it is never
// auto-nulled by a cascade when the named person is later permanently deleted).
//
// Run with: node qa/scenarios-runner/sem_ai_command_named_person_lookup_truth.mjs
// Function bodies below are byte-for-byte-equivalent copies of the shipped logic (kept in
// sync manually, same convention as every other file in this directory).

const COMMON_COMMAND_STOPWORDS = new Set([
  'the','and','for','are','was','were','with','about','show','what','who','when','where',
  'why','how','does','did','has','have','had','this','that','their','they','them',
  'company','companies','employee','employees','person','people','status','currently',
  'active','archived','restore','delete','archive','create','update','all','data',
  'related','permanently','please','tell','check','give','list','ceo','the',
]);

function extractCommandNameTokens(command) {
  return [...new Set(
    (command.match(/[A-Za-z][A-Za-z0-9'&.-]{2,}/g) || [])
      .map((t) => t.toLowerCase())
      .filter((t) => !COMMON_COMMAND_STOPWORDS.has(t)),
  )].slice(0, 8);
}

// byte-for-byte copy: mergedPeopleData (index.ts) — dedup by id, base capped list first.
function mergePeopleData(cappedPeople, namedLookupPeople) {
  const seen = new Set(cappedPeople.map((p) => p.id));
  const extra = namedLookupPeople.filter((p) => !seen.has(p.id));
  return [...cappedPeople, ...extra];
}

// byte-for-byte copy: packMemories.personCurrentStatus (index.ts)
function personCurrentStatus(memory, activeById) {
  if (memory.entity_type !== 'person' || typeof memory.entity_id !== 'string') return null;
  if (!activeById.has(memory.entity_id)) return 'not_found';
  return activeById.get(memory.entity_id) ? 'active' : 'inactive';
}

let failed = false;
function assert(cond, name, detail) {
  if (!cond) { failed = true; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`PASS ${name}`);
}

// ============ CRITICAL: the exact real incident shape, for a person instead of a company ============
{
  // A 30-row capped people list that does NOT include "test4 employee" (simulating it
  // being alphabetically/insertion-order outside the window), plus the targeted lookup
  // finding it by name — the merge must make it visible regardless.
  const cappedPeople = Array.from({ length: 30 }, (_, i) => ({ id: `capped-${i}`, full_name: `Other Person ${i}`, active: true }));
  const namedLookupPeople = [{ id: 'person-test4', full_name: 'test4 employee', active: true, company_id: 'co-test4' }];
  const merged = mergePeopleData(cappedPeople, namedLookupPeople);
  assert(merged.some((p) => p.id === 'person-test4'), 'CRITICAL: a person named directly in the command is present in merged context even when outside the base capped list (the real test4-shaped incident, for a person)');
  assert(merged.length === 31, 'merge adds exactly the one new person, not a duplicate of anything already capped');
}

// ============ dedup: a person already in the capped list is not duplicated ============
{
  const cappedPeople = [{ id: 'p1', full_name: 'Existing Person' }];
  const namedLookupPeople = [{ id: 'p1', full_name: 'Existing Person' }, { id: 'p2', full_name: 'New Named Person' }];
  const merged = mergePeopleData(cappedPeople, namedLookupPeople);
  assert(merged.length === 2, 'a person already present in the capped list is never duplicated by the named lookup merge');
  assert(merged.filter((p) => p.id === 'p1').length === 1, 'exactly one copy of the already-capped person survives the merge');
}

// ============ token extraction reuses the same extraction as the company fix ============
{
  const tokens = extractCommandNameTokens('is test4 employee still active?');
  assert(tokens.includes('test4'), 'a distinctive name token ("test4") is extracted from the command text');
  assert(!tokens.includes('active'), 'a generic stopword ("active") is filtered out, same as the company-name fix');
}

// ============ personCurrentStatus annotation (memories) ============
{
  const activeById = new Map([['person-x', true], ['person-y', false]]);
  assert(personCurrentStatus({ entity_type: 'person', entity_id: 'person-x' }, activeById) === 'active', 'a memory about a currently-active person is annotated "active"');
  assert(personCurrentStatus({ entity_type: 'person', entity_id: 'person-y' }, activeById) === 'inactive', 'a memory about a currently-inactive (ended employment) person is annotated "inactive"');
  assert(personCurrentStatus({ entity_type: 'person', entity_id: 'person-deleted' }, activeById) === 'not_found', 'CRITICAL: a memory about a PERMANENTLY DELETED person (no longer in people at all) is annotated "not_found", never left to free-text inference — the exact defect class 15e868a closed for companies, closed here for people');
  assert(personCurrentStatus({ entity_type: 'company', entity_id: 'co-1' }, activeById) === null, 'a company-tagged memory is not given a (meaningless) personCurrentStatus');
  assert(personCurrentStatus({ entity_type: 'person', entity_id: null }, activeById) === null, 'a person-tagged memory with no entity_id at all is not given a fabricated status either');
}

console.log(failed ? '\nSOME REGRESSIONS FAILED' : '\nALL REGRESSIONS PASSED');
process.exit(failed ? 1 : 0);
