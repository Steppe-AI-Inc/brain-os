# Provenance — Task Observer

- **Source**: https://github.com/rebelytics/one-skill-to-rule-them-all
- **Author**: Eoghan Henn / rebelytics.com
- **License**: CC BY 4.0 (share and adapt freely with credit to the author)
- **Pinned commit**: `510caad26c907793e48306262af216ff9f71c9f7` (real `main`-branch HEAD at
  the time of pinning, fetched via `gh api repos/rebelytics/one-skill-to-rule-them-all/commits/main`,
  2026-08-31 — not a floating ref)
- **Vendored file**: `SKILL.md` in this directory, byte-for-byte identical to the pinned
  commit's blob (fetched via `gh api repos/.../contents/SKILL.md?ref=<sha>`, base64-decoded,
  written unmodified — this provenance note lives in a separate sibling file specifically so
  it never changes SKILL.md's own content hash away from a true fingerprint of the real
  upstream blob).
- **sha256 (this repo's own hash of the vendored file)**: `a7d1e2074188a7e31c9eeb1ab5624e0429241085486edf45bfc216e954e8c1e8`
- **Security review**: prose methodology skill (session-observation logging, no executable
  scripts, no network calls, no credential access). Read in full before registration —
  contains no embedded shell/code beyond illustrative bash snippets shown as documentation
  (id-numbering/scan logic examples), never auto-executed by the skill itself.
- **Known limitation, disclosed**: the skill's own frontmatter references several companion
  files under `references/` and `skill-observations/skill-families.md` that are NOT vendored
  in this pass — only the core `SKILL.md` (the exact file the founder named:
  `plugins/task-observer` component path `SKILL.md`). Sufficient to prove the real
  observation → candidate pipeline; not a complete deployment of every reference doc.
- **Governance**: this skill produces free-text "Skill Improvement Candidate" observations
  only. It must never directly rewrite a production skill or Agent authority file — Brain OS
  enforces this by never granting the dispatched agent Write access to `.claude/agents/**` or
  `qa/scenarios-runner/**` etc. during an observation run; the skill's own text independently
  recommends staging-only edits, but that is advisory prose, not the enforcement mechanism.
