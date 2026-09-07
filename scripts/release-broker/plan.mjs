// THE PRODUCTION RELEASE BROKER — DECISION CORE.
//
// P1: PRODUCTION_WRITE_AUTHORITY_NOT_TECHNICALLY_ENFORCED.
//
// Migrations A/B/D were founder-authorized. C (202609020003) and 202609040001 were EXPLICITLY
// EXCLUDED. All five are recorded as applied in production, because `supabase db push` has no
// selectivity: it applies every pending migration. The exclusion was an AUTHORIZATION; the only
// tool available could not honour a partial set. This is the SECOND occurrence of that class —
// ledger #16 (2026-08-28) asked for a real technical enforcement point and it was never built.
//
// WHY THIS FILE IS PURE. It takes facts and returns a decision. No network, no credentials, no CLI,
// no filesystem, no clock. That is not tidiness — it is what makes the refusals testable on any
// machine, in CI, with no production access at all. A guard that can only be exercised by pointing
// it at production is a guard nobody exercises. Every refusal below has a test that fails without it.
//
// WHY IT IS SUBSTRATE-INDEPENDENT. The founder's requirement is that the broker contract be
// identical whether it runs in a protected GitHub Environment or on a dedicated release machine.
// So the substrate does I/O and approval; this module decides. Porting the broker means writing a
// new shell around the same function, not reimplementing the rules.
//
// THE MECHANISM IS PORTED, NOT INVENTED. `qa/dbtest/selective_apply_abd.sh` already solved the hard
// part: curate a temp workdir containing only (already-applied ∪ approved), so the CLI is PHYSICALLY
// INCAPABLE of applying anything else, then prove the dry-run apply set equals the approved set
// exactly. What that script lacks is an authorization artifact: its manifest is hard-coded shell
// constants, and it PRINTS sha256 without ever COMPARING it. Here the hashes are a refusal, and the
// curation is computed rather than trusted.

/** Every refusal has a stable code. Codes are contract: tests and audit records reference them. */
export const REFUSAL = {
  COMMIT_MALFORMED: 'COMMIT_MALFORMED',
  COMMIT_NOT_ANCESTOR_OF_MASTER: 'COMMIT_NOT_ANCESTOR_OF_MASTER',
  MANIFEST_MISSING: 'MANIFEST_MISSING',
  MANIFEST_SCHEMA_UNSUPPORTED: 'MANIFEST_SCHEMA_UNSUPPORTED',
  AUTHORIZATION_ID_MISMATCH: 'AUTHORIZATION_ID_MISMATCH',
  PROJECT_REF_MISMATCH: 'PROJECT_REF_MISMATCH',
  AUTHORIZATION_EXPIRED: 'AUTHORIZATION_EXPIRED',
  AUTHORIZATION_NOT_YET_VALID: 'AUTHORIZATION_NOT_YET_VALID',
  ROLLBACK_BLOCK_MISSING: 'ROLLBACK_BLOCK_MISSING',
  FILE_HASH_MISMATCH: 'FILE_HASH_MISMATCH',
  FILE_DIFFERS_FROM_PACKAGE_COMMIT: 'FILE_DIFFERS_FROM_PACKAGE_COMMIT',
  FILE_MISSING_AT_CHECKOUT: 'FILE_MISSING_AT_CHECKOUT',
  VALIDATION_NOT_GREEN_FOR_COMMIT: 'VALIDATION_NOT_GREEN_FOR_COMMIT',
  REMOTE_HISTORY_UNREADABLE: 'REMOTE_HISTORY_UNREADABLE',
  APPROVED_ALREADY_APPLIED: 'APPROVED_ALREADY_APPLIED',
  EXCLUDED_ALREADY_APPLIED: 'EXCLUDED_ALREADY_APPLIED',
  PENDING_MIGRATION_NOT_IN_MANIFEST: 'PENDING_MIGRATION_NOT_IN_MANIFEST',
  APPLY_SET_NOT_EQUAL_TO_MANIFEST: 'APPLY_SET_NOT_EQUAL_TO_MANIFEST',
  EXECUTION_MODEL_UNDECLARED: 'EXECUTION_MODEL_UNDECLARED',
  EXECUTION_MODEL_CONTRADICTS_MANIFEST: 'EXECUTION_MODEL_CONTRADICTS_MANIFEST',
  ACTUAL_PENDING_SET_NOT_AUTHORIZED: 'ACTUAL_PENDING_SET_NOT_AUTHORIZED',
  SELECTIVE_EXECUTION_UNVERIFIED: 'SELECTIVE_EXECUTION_UNVERIFIED',
  SELECTIVE_EXECUTION_SCOPE_MISMATCH: 'SELECTIVE_EXECUTION_SCOPE_MISMATCH',
  NOTHING_TO_APPLY: 'NOTHING_TO_APPLY',
};

const HEX40 = /^[0-9a-f]{40}$/;
const VERSION = /^[0-9]{12,14}$/;
const SHA256 = /^[0-9a-f]{64}$/;

const refuse = (code, reason, extra = {}) => ({ decision: 'REFUSE', code, reason, ...extra });

/**
 * Decide whether a production migration apply is authorized, and exactly which files may run.
 *
 * Every argument is a FACT the substrate gathered. Nothing here reads the world, so nothing here
 * can be fooled by a working tree that changed after the facts were gathered — the substrate's job
 * is to gather them from a fresh checkout of `package_commit`.
 *
 * @param {object}   manifest                 parsed governance/authorizations/<id>.yaml, or null
 * @param {string[]} appliedVersions          versions already in the remote migration history
 * @param {string[]} migrationFilesAtCheckout every filename in supabase/migrations at the checkout
 * @param {Record<string,string>} fileHashes  filename -> sha256 of its LF-normalised bytes
 * @param {Record<string,boolean>} gitDiffClean filename -> true when checkout == package_commit
 * @param {string|null} ciConclusion          conclusion of migration-validation for package_commit
 * @param {boolean}  ancestorOfMaster         is package_commit an ancestor of origin/master
 * @param {string}   workflowProjectRef       the ref hard-coded in the broker substrate itself
 * @param {object}   inputs                   { authorization_id, git_commit, confirm_project_ref }
 * @param {Date}     now                      injected, never read from the clock
 */
export function buildApplyPlan({
  manifest, appliedVersions, migrationFilesAtCheckout, fileHashes, gitDiffClean,
  ciConclusion, ancestorOfMaster, workflowProjectRef, inputs, now,
}) {
  // ── the request itself ──────────────────────────────────────────────────────────────────────
  if (!inputs || typeof inputs.git_commit !== 'string' || !HEX40.test(inputs.git_commit)) {
    return refuse(REFUSAL.COMMIT_MALFORMED,
      'git_commit must be a full 40-character hex SHA. An abbreviated SHA can become ambiguous as '
      + 'the repository grows, and an authorization must name exactly one commit forever.');
  }
  if (ancestorOfMaster !== true) {
    return refuse(REFUSAL.COMMIT_NOT_ANCESTOR_OF_MASTER,
      'The authorized commit is not an ancestor of origin/master. A manifest on a side branch has '
      + 'not been through the branch protections and cannot authorize a production write.');
  }
  if (!manifest || typeof manifest !== 'object') {
    return refuse(REFUSAL.MANIFEST_MISSING,
      'No authorization manifest at governance/authorizations/' + inputs.authorization_id
      + '.yaml in the authorized commit.');
  }
  if (manifest.schema_version !== 1) {
    return refuse(REFUSAL.MANIFEST_SCHEMA_UNSUPPORTED,
      'Unsupported manifest schema_version ' + manifest.schema_version + '. Refusing rather than '
      + 'guessing at fields a future schema may have moved.');
  }
  if (manifest.authorization_id !== inputs.authorization_id) {
    return refuse(REFUSAL.AUTHORIZATION_ID_MISMATCH,
      'The manifest names authorization ' + manifest.authorization_id + ' but the run was '
      + 'dispatched for ' + inputs.authorization_id + '. The approver must be approving the '
      + 'operation they were shown.');
  }

  // ── the target, agreed by three independent sources ─────────────────────────────────────────
  // Input, manifest and the substrate's own constant must agree. No single edit retargets the
  // broker: changing the manifest is not enough, changing the dispatch input is not enough, and
  // changing the substrate constant requires permissions a developer session does not hold.
  const refs = [inputs.confirm_project_ref, manifest.project_ref, workflowProjectRef];
  if (new Set(refs).size !== 1 || !refs[0]) {
    return refuse(REFUSAL.PROJECT_REF_MISMATCH,
      'project_ref disagreement across the three independent sources — dispatch input='
      + inputs.confirm_project_ref + ', manifest=' + manifest.project_ref + ', broker constant='
      + workflowProjectRef + '. All three must agree before anything is written.');
  }

  // ── the authorization is an event, not a standing grant ─────────────────────────────────────
  const t = now instanceof Date ? now.getTime() : NaN;
  const issued = Date.parse(manifest.issued_at);
  const expires = Date.parse(manifest.expires_at);
  if (!Number.isFinite(t) || !Number.isFinite(issued) || !Number.isFinite(expires)) {
    return refuse(REFUSAL.MANIFEST_SCHEMA_UNSUPPORTED,
      'issued_at and expires_at must both be parseable RFC3339 timestamps, and `now` must be a Date.');
  }
  if (t < issued) {
    return refuse(REFUSAL.AUTHORIZATION_NOT_YET_VALID,
      'The authorization is dated in the future (issued_at ' + manifest.issued_at + ').');
  }
  if (t > expires) {
    return refuse(REFUSAL.AUTHORIZATION_EXPIRED,
      'The authorization expired at ' + manifest.expires_at + '. Re-authorize rather than reviving '
      + 'a decision made against a state of the world that has since moved.');
  }

  // A reversal plan is part of the decision, not paperwork. If nobody has said how this comes back
  // out, the risk has not actually been assessed.
  if (!manifest.rollback || typeof manifest.rollback.kind !== 'string') {
    return refuse(REFUSAL.ROLLBACK_BLOCK_MISSING,
      'The manifest carries no rollback block. State how this is reversed — including '
      + '"forward_fix_only" — before it is applied.');
  }

  const approved = Array.isArray(manifest.approved_migrations) ? manifest.approved_migrations : [];
  const excluded = Array.isArray(manifest.excluded_migrations) ? manifest.excluded_migrations : [];
  if (approved.length === 0) {
    return refuse(REFUSAL.NOTHING_TO_APPLY,
      'The manifest approves no migrations. There is nothing to authorize.');
  }

  // ── bytes: the manifest names files by hash, and the hash is a REFUSAL, not a printout ───────
  // selective_apply_abd.sh prints sha256 and compares only the git commit. A commit binding alone
  // cannot catch a manifest written against different bytes than the ones it lists.
  for (const m of [...approved, ...excluded]) {
    if (!m || !VERSION.test(String(m.version)) || typeof m.filename !== 'string' || !SHA256.test(String(m.sha256))) {
      return refuse(REFUSAL.MANIFEST_SCHEMA_UNSUPPORTED,
        'Every approved and excluded entry needs a version, a filename and a 64-hex sha256. '
        + 'Offending entry: ' + JSON.stringify(m));
    }
    if (!migrationFilesAtCheckout.includes(m.filename)) {
      return refuse(REFUSAL.FILE_MISSING_AT_CHECKOUT,
        m.filename + ' is named in the manifest but absent from the authorized commit.');
    }
    if (fileHashes[m.filename] !== m.sha256) {
      return refuse(REFUSAL.FILE_HASH_MISMATCH,
        m.filename + ' does not match the manifest hash. Expected ' + m.sha256 + ', got '
        + fileHashes[m.filename] + '. The reviewed bytes and the bytes about to run are not the same.',
        { filename: m.filename });
    }
    if (gitDiffClean[m.filename] !== true) {
      return refuse(REFUSAL.FILE_DIFFERS_FROM_PACKAGE_COMMIT,
        m.filename + ' differs between the authorized commit and the reviewed package '
        + manifest.package_commit + '. Re-review is required before any production write.',
        { filename: m.filename });
    }
  }

  // ── the reviewed package must have actually passed validation, for THIS commit ───────────────
  // migration-validation.yml's header says "no migration reaches production authorization on static
  // review alone". That was a comment. Here it is a condition.
  if (ciConclusion !== 'success') {
    return refuse(REFUSAL.VALIDATION_NOT_GREEN_FOR_COMMIT,
      'migration-validation has no successful run for exactly ' + manifest.package_commit
      + ' (conclusion: ' + String(ciConclusion) + ').');
  }

  // ── remote state ────────────────────────────────────────────────────────────────────────────
  if (!Array.isArray(appliedVersions) || appliedVersions.length === 0) {
    return refuse(REFUSAL.REMOTE_HISTORY_UNREADABLE,
      'Could not read any applied version from the remote migration history. Refusing to curate '
      + 'blind: the curated set is computed FROM this list, so an empty list would silently mean '
      + '"treat every file as pending".');
  }
  const appliedSet = new Set(appliedVersions.map(String));

  for (const m of approved) {
    if (appliedSet.has(String(m.version))) {
      return refuse(REFUSAL.APPROVED_ALREADY_APPLIED,
        'Approved migration ' + m.version + ' is already applied remotely. The conditions the '
        + 'authorization was written against have changed; re-check before proceeding.',
        { version: String(m.version) });
    }
  }
  for (const m of excluded) {
    if (appliedSet.has(String(m.version))) {
      return refuse(REFUSAL.EXCLUDED_ALREADY_APPLIED,
        'EXCLUDED migration ' + m.version + ' is already applied remotely. This is the state the '
        + '2026-09 incident left production in; it must be reconciled deliberately before this '
        + 'broker writes anything.',
        { version: String(m.version) });
    }
  }

  // ── every pending file must be accounted for ────────────────────────────────────────────────
  // THIS IS THE INCIDENT. selective_apply_abd.sh silently deletes unlisted pending files from its
  // temp dir. That is safe for the apply and dangerous for the authorization: it hides that the
  // manifest was written against a different tree than the one being applied. An unlisted pending
  // migration means the approver did not see the whole picture, so the broker refuses instead of
  // quietly curating it away.
  const named = new Set([...approved, ...excluded].map((m) => String(m.version)));
  const unaccounted = migrationFilesAtCheckout
    .map((f) => ({ file: f, version: f.slice(0, 12) }))
    .filter(({ version }) => VERSION.test(version) && !appliedSet.has(version) && !named.has(version))
    .map(({ file }) => file);
  if (unaccounted.length > 0) {
    return refuse(REFUSAL.PENDING_MIGRATION_NOT_IN_MANIFEST,
      'Pending migrations exist that the manifest neither approves nor excludes: '
      + unaccounted.join(', ') + '. Every pending file must be named, so the approver sees the '
      + 'whole picture. Silently curating an unknown file away is how the excluded migrations '
      + 'reached production.',
      { unaccounted });
  }

  // ── ACTUAL_PENDING_SET == AUTHORIZED_PENDING_SET ────────────────────────────────────────────
  // Accounting for every pending file is necessary but NOT sufficient. A manifest that lists C and
  // E under excluded_migrations accounts for them — and then curation deletes them and the release
  // proceeds, with the authorization reading as though the tree matched. It did not. The approver
  // approved A/B/D against a tree that also held C and E, and the only record that the release was
  // partial lives in a field nobody re-reads at approval time.
  //
  // So the default relationship is EQUALITY: what production will have pending is exactly what the
  // founder authorized. A partial release is permitted only when the manifest declares a selective
  // execution model explicitly, names the excluded scope in that declaration, and the SUBSTRATE
  // independently confirms the selective mechanism was verified — a manifest may not certify its
  // own selectivity. Anything else fails closed.
  const pendingVersions = migrationFilesAtCheckout
    .map((f) => f.slice(0, 12))
    .filter((v) => VERSION.test(v) && !appliedSet.has(v))
    .sort();
  const approvedVersions = approved.map((m) => String(m.version)).sort();
  const excludedVersionsSorted = excluded.map((m) => String(m.version)).sort();
  const model = manifest.execution_model;

  if (model !== 'ALL_PENDING' && model !== 'SELECTIVE_CURATION') {
    return refuse(REFUSAL.EXECUTION_MODEL_UNDECLARED,
      'The manifest does not declare execution_model. It must be either ALL_PENDING (the apply set '
      + 'is the entire pending set) or SELECTIVE_CURATION (a partial release, which carries extra '
      + 'requirements). An undeclared model is refused rather than defaulted, because the default '
      + 'that felt obvious to whoever wrote the tool is exactly what put C and 202609040001 into '
      + 'production.',
      { declared: model === undefined ? null : String(model) });
  }

  if (model === 'ALL_PENDING') {
    if (excludedVersionsSorted.length > 0) {
      return refuse(REFUSAL.EXECUTION_MODEL_CONTRADICTS_MANIFEST,
        'execution_model is ALL_PENDING but the manifest also lists excluded migrations ['
        + excludedVersionsSorted.join(' ') + ']. The two cannot both be true.',
        { excluded: excludedVersionsSorted });
    }
    if (pendingVersions.join(',') !== approvedVersions.join(',')) {
      return refuse(REFUSAL.ACTUAL_PENDING_SET_NOT_AUTHORIZED,
        'Production has pending [' + pendingVersions.join(' ') + '] but the founder authorized ['
        + approvedVersions.join(' ') + ']. Under ALL_PENDING these must be identical. The apply set '
        + 'is not silently narrowed to the intersection: a release that would leave authorized work '
        + 'unapplied, or that would face unauthorized work, is refused so the manifest can be '
        + 'rewritten against the tree that actually exists.',
        { pending: pendingVersions, approved: approvedVersions });
    }
  } else {
    // SELECTIVE_CURATION. The exclusions must be declared IN the selective-execution block, not
    // merely present elsewhere in the file, so the scope of the partial release is the thing being
    // approved rather than a consequence of it.
    const se = manifest.selective_execution;
    if (!se || typeof se !== 'object' || !se.mechanism || !se.verified_by
        || !Array.isArray(se.excluded_scope)) {
      return refuse(REFUSAL.SELECTIVE_EXECUTION_UNVERIFIED,
        'execution_model is SELECTIVE_CURATION but the manifest carries no complete '
        + 'selective_execution block. It must name the mechanism, the regression that verifies it '
        + '(verified_by), and the exact excluded_scope.',
        { selective_execution: se === undefined ? null : se });
    }
    const declaredScope = se.excluded_scope.map(String).sort();
    if (declaredScope.join(',') !== excludedVersionsSorted.join(',')) {
      return refuse(REFUSAL.SELECTIVE_EXECUTION_SCOPE_MISMATCH,
        'selective_execution.excluded_scope [' + declaredScope.join(' ') + '] does not equal the '
        + "manifest's excluded_migrations [" + excludedVersionsSorted.join(' ') + '].',
        { declaredScope, excluded: excludedVersionsSorted });
    }
    const union = approvedVersions.concat(excludedVersionsSorted).sort();
    if (pendingVersions.join(',') !== union.join(',')) {
      return refuse(REFUSAL.ACTUAL_PENDING_SET_NOT_AUTHORIZED,
        'Production has pending [' + pendingVersions.join(' ') + '] but approved ∪ excluded is ['
        + union.join(' ') + ']. Even a selective release must describe the entire pending set.',
        { pending: pendingVersions, union });
    }
    // The substrate says whether the selective mechanism was independently verified for THIS run.
    // A manifest asserting its own trustworthiness is not evidence.
    if (inputs.selective_execution_verified !== true) {
      return refuse(REFUSAL.SELECTIVE_EXECUTION_UNVERIFIED,
        'The substrate did not confirm that the selective execution mechanism (' + se.mechanism
        + ') was independently verified for this run. Selective execution is the mechanism that '
        + 'decides which authorized work reaches production, so it is exactly the mechanism that '
        + 'may not be taken on trust.',
        { mechanism: String(se.mechanism), verified_by: String(se.verified_by) });
    }
  }

  // ── the curated set: what the substrate keeps, and what it must delete ───────────────────────
  // Keep (already-applied ∪ approved). The CLI then cannot apply anything else even if it wanted
  // to — that physical impossibility is the mechanism, not the equality check that follows it.
  const curatedKeep = [];
  const curatedDelete = [];
  for (const f of migrationFilesAtCheckout) {
    const v = f.slice(0, 12);
    if (appliedSet.has(v) || approvedVersions.includes(v)) curatedKeep.push(f);
    else curatedDelete.push(f);
  }

  const applySet = approvedVersions;
  const manifestSorted = approvedVersions.slice().sort();
  if (applySet.join(',') !== manifestSorted.join(',')) {
    return refuse(REFUSAL.APPLY_SET_NOT_EQUAL_TO_MANIFEST,
      'Computed apply set [' + applySet.join(' ') + '] is not exactly the manifest set ['
      + manifestSorted.join(' ') + '].');
  }

  return {
    decision: 'APPLY',
    code: null,
    reason: 'Apply set is exactly the approved set; every pending file is accounted for; bytes '
      + 'match the reviewed package; validation is green for that commit.',
    applySet,
    curatedKeep,
    curatedDelete,
    excludedVersions: excludedVersionsSorted,
    executionModel: model,
    pendingVersions,
    projectRef: refs[0],
  };
}

/**
 * The post-apply reconciliation. The push command's exit status is NOT evidence — that rule is
 * inherited from selective_apply_abd.sh and it is right. What is evidence is that the remote
 * history afterwards equals what it was before, plus exactly the approved set, and nothing else.
 */
export function reconcileAfterApply({ appliedBefore, appliedAfter, applySet, excludedVersions }) {
  const before = new Set(appliedBefore.map(String));
  const after = new Set(appliedAfter.map(String));
  const expected = new Set([...before, ...applySet.map(String)]);

  const missing = [...expected].filter((v) => !after.has(v)).sort();
  const unexpected = [...after].filter((v) => !expected.has(v)).sort();
  const excludedNowApplied = (excludedVersions || []).map(String).filter((v) => after.has(v)).sort();

  const ok = missing.length === 0 && unexpected.length === 0 && excludedNowApplied.length === 0;
  return {
    ok,
    missing,
    unexpected,
    excludedNowApplied,
    reason: ok
      ? 'Remote history is exactly the prior history plus the approved set.'
      : 'Remote history does not match the authorization. missing=[' + missing.join(' ')
        + '] unexpected=[' + unexpected.join(' ') + '] excludedNowApplied=['
        + excludedNowApplied.join(' ') + ']. Do NOT auto-revert: emit RECONCILIATION_REQUIRED. '
        + 'Automatic reversal of partially-applied DDL is more dangerous than the failure.',
  };
}
