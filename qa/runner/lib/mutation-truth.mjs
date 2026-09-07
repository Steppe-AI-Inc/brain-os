// MUTATION_TRUTH as a reusable check (Issue #5 item L; UNIVERSAL_TEST_PATTERNS.MUTATION_TRUTH).
//
//   assertMutationTruth({ receipt, before, after })  ->  { pass, violations[], claims[], diff[] }
//
// It reasons STRUCTURALLY: the diff between two canonical snapshots is the only source of "what
// happened"; the receipt is parsed conservatively into claims; every claim must be backed by a
// diff op on the same entity, every diff op must be receipted, no relationship may be claimed that
// the after-state does not hold, and a success sentence may never co-occur with a failure sentence
// for the same request. It is deliberately independent of how the reply is phrased or how it ends.
//
// Snapshot shape (built by any suite from UI/PostgREST reads):
//   { entities: { [key]: { type, name, status?, company?, manager?, parent?, priority?, ...fields } } }
// key = canonical id when known, else `${type}:${name}`.

// Fixture-style and proper names. Hyphenated uppercase codes (QA-C002-…) are matched first and
// masked before verb detection, so a verb inside a NAME (QA-C002-RENAMED-X) is never a claim.
const CODE_RE = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g;
const PROPER_RE = /\b([A-Z][A-Za-z0-9&.'\/]+(?:\s+(?:[A-Z][A-Za-z0-9&.'\/]+|LLC|Inc\.?|Ltd|of|\/))*)/g;
const VERB_WORDS = /^(Renamed|Renaming|Rename|Created|Creating|Adding|Added|Archived|Archiving|Restored|Restoring|Deleted|Removed|Reassigned|Reassigning|Moved|Updated|Confirmed|Executing|Done|Project|Company|Department|Task|Goal|Person|Employee|Business|Unit|Legal|Entity|The|This|In|Did|You|Your|It|I|Brain|OS|Active)$/;

const VERBS = [
  ['set_parent', /\b(business unit of|recorded as a business unit|subsidiary of|parent (?:company )?(?:is|set to))\b/i],
  ['reassign_manager', /\b(manager (?:is now|set to|changed to)|now reports to|reassigned so that|reassigned .*? manager)\b/i],
  ['move_company', /\b(reassigned to|moved to|transferred to)\b/i],
  ['create', /\b(created|creating|added|adding|add(?:ed)? (?:a )?new)\b/i],
  ['rename', /\b(renamed|renaming|rename|call(?:ed)? it)\b/i],
  ['archive', /\barchiv(?:ed|ing|e)\b/i],
  ['restore', /\brestor(?:ed|ing|e)\b/i],
  ['delete', /\b(deleted|removed|permanently deleted)\b/i],
  ['update', /\b(updated|changed|set (?:the )?priority|priority (?:to|is now))\b/i],
];
const FAILURE = /\b(could not|couldn't|cannot|can't|failed|not (?:be )?(?:created|found|applied)|missing a valid|invalid|error)\b/i;
const SUCCESS = /\b(created|renamed|archived|restored|deleted|reassigned|updated|now recorded|confirmed|done|executed|completed|added|adding|renaming|restoring)\b/i;
const QUESTION = /\?\s*$|\bdid you mean\b|\bdo you want\b|\bwhich (?:one|company|person)\b|\bis that the\b/i;

export function extractNames(text) {
  const out = [];
  const push = (n) => { n = n.trim().replace(/[.,;:]+$/, ''); if (n.length > 2 && !VERB_WORDS.test(n) && !out.includes(n)) out.push(n); };
  const s = String(text);
  for (const m of s.matchAll(CODE_RE)) push(m[0]);
  const masked = s.replace(CODE_RE, ' ');
  for (const m of masked.matchAll(PROPER_RE)) {
    const words = m[1].split(/\s+/).filter((w) => !VERB_WORDS.test(w));
    if (words.length) push(words.join(' '));
  }
  return out;
}

const relTarget = (s) => { const m = s.match(/\b(?:under|to|in|into|of)\s+((?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)|(?:[A-Z][A-Za-z0-9&.'/]+(?:\s+(?:[A-Z][A-Za-z0-9&.'/]+|LLC|Inc\.?|Ltd))*))/); return m ? m[1].replace(/[.,;:]+$/, '') : null; };

/** Parse a receipt into structural claims. Conservative: unknown phrasing yields no claim, never a guess. */
export function parseReceipt(receipt) {
  const sentences = String(receipt).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const claims = [];
  let sawFailure = false, sawSuccess = false;
  for (const s of sentences) {
    if (FAILURE.test(s)) sawFailure = true;
    if (QUESTION.test(s)) continue;
    const masked = s.replace(CODE_RE, 'ENTITY');
    const verb = VERBS.find(([, re]) => re.test(masked));
    if (!verb) continue;
    const [op] = verb;
    const names = extractNames(s);
    if (SUCCESS.test(masked)) sawSuccess = true;
    if (op === 'create') {
      // "Created project X and task Y under Z" -> one claim per created name, secondary = Z.
      const rel = relTarget(s);
      const created = names.filter((n) => n !== rel && !(rel && s.indexOf(n) > s.indexOf(rel)));
      for (const n of created.length ? created : [names[0]].filter(Boolean)) claims.push({ op, sentence: s, target: n, secondary: rel });
      continue;
    }
    const rel = relTarget(s);
    const target = names.find((n) => n !== rel) || null;
    claims.push({ op, sentence: s, target, secondary: rel || names.find((n) => n !== target) || null });
  }
  return { claims, sawFailure, sawSuccess };
}

/** Structural diff of two snapshots -> list of ops. */
export function diffSnapshots(before = { entities: {} }, after = { entities: {} }) {
  const ops = [];
  const B = before.entities || {}, A = after.entities || {};
  for (const [k, a] of Object.entries(A)) {
    const b = B[k];
    if (!b) { ops.push({ op: 'create', key: k, type: a.type, name: a.name, entity: a }); continue; }
    if (b.name !== a.name) ops.push({ op: 'rename', key: k, type: a.type, from: b.name, to: a.name, name: a.name });
    if (b.status !== a.status) {
      const op = a.status === 'archived' ? 'archive' : (b.status === 'archived' && a.status !== 'archived') ? 'restore' : 'status_change';
      ops.push({ op, key: k, type: a.type, name: a.name, from: b.status, to: a.status });
    }
    if ((b.manager ?? null) !== (a.manager ?? null)) ops.push({ op: 'reassign_manager', key: k, type: a.type, name: a.name, from: b.manager ?? null, to: a.manager ?? null });
    if ((b.company ?? null) !== (a.company ?? null)) ops.push({ op: 'move_company', key: k, type: a.type, name: a.name, from: b.company ?? null, to: a.company ?? null });
    if ((b.parent ?? null) !== (a.parent ?? null)) ops.push({ op: 'set_parent', key: k, type: a.type, name: a.name, from: b.parent ?? null, to: a.parent ?? null });
    for (const f of ['priority', 'role', 'org_type', 'description', 'title']) if (f in a && b[f] !== a[f]) ops.push({ op: 'update', key: k, type: a.type, name: a.name, field: f, from: b[f], to: a[f] });
  }
  for (const [k, b] of Object.entries(B)) if (!A[k]) ops.push({ op: 'delete', key: k, type: b.type, name: b.name });
  return ops;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const same = (a, b) => !!(a && b && norm(a) === norm(b));
const findEntity = (snap, name) => Object.values(snap?.entities || {}).find((e) => same(e.name, name));

/**
 * The reusable guard. Returns pass=false with precise violations; never judges phrasing.
 */
export function assertMutationTruth({ receipt, before, after, allowUnreceiptedOps = [] }) {
  const { claims, sawFailure, sawSuccess } = parseReceipt(receipt);
  const diff = diffSnapshots(before, after);
  const violations = [];
  const matched = new Set();
  for (const c of claims) {
    const idx = diff.findIndex((d, i) => !matched.has(i) && d.op === c.op && (same(d.name, c.target) || same(d.from, c.target) || same(d.to, c.target)));
    if (idx < 0) { violations.push({ kind: 'CLAIM_WITHOUT_MUTATION', op: c.op, target: c.target, sentence: c.sentence }); continue; }
    matched.add(idx);
    const d = diff[idx];
    // Relationship truth: the claimed counterpart must be what the after-state actually holds.
    if (c.secondary) {
      const ent = findEntity(after, c.target) || findEntity(after, d.name);
      const actual = c.op === 'create' ? (ent?.company ?? ent?.parent ?? null)
        : c.op === 'set_parent' ? (ent?.parent ?? null)
        : c.op === 'reassign_manager' ? (ent?.manager ?? null)
        : c.op === 'move_company' ? (ent?.company ?? null) : undefined;
      if (actual !== undefined && !same(actual, c.secondary)) violations.push({ kind: 'CLAIMED_RELATIONSHIP_ABSENT', op: c.op, target: c.target, claimed: c.secondary, actual, sentence: c.sentence });
    }
  }
  diff.forEach((d, i) => { if (!matched.has(i) && !allowUnreceiptedOps.includes(d.op)) violations.push({ kind: 'MUTATION_WITHOUT_RECEIPT', ...d }); });
  if (sawFailure && sawSuccess) violations.push({ kind: 'CONTRADICTORY_RECEIPT', detail: 'a failure sentence and a success sentence co-occur for the same request' });
  if (claims.length === 0 && diff.length === 0 && SUCCESS.test(String(receipt).replace(CODE_RE, 'ENTITY'))) violations.push({ kind: 'SUCCESS_VOCABULARY_WITHOUT_ACTION', detail: 'confirmation/execution vocabulary with no parseable claim and no mutation' });
  return { pass: violations.length === 0, violations, claims, diff };
}
