# Provenance — Claude Code Setup (claude-automation-recommender)

- **Source**: https://github.com/anthropics/claude-plugins-official
- **Component path**: `plugins/claude-code-setup/skills/claude-automation-recommender/SKILL.md`
- **Author**: Anthropic
- **License**: Apache-2.0
- **Pinned commit**: `ed404106fcd80ba98ecb7c851e531dcb626d13b7` (real `main`-branch HEAD at
  the time of pinning, fetched via `gh api repos/anthropics/claude-plugins-official/commits/main`,
  2026-08-31 — not a floating ref)
- **Vendored file**: `SKILL.md` in this directory, byte-for-byte identical to the pinned
  commit's blob.
- **sha256 (this repo's own hash of the vendored file)**: `441c57e26f0931b64dd085deaad9213c4e3efea27d916dd7443cd33c7e338227`
- **Security review**: read in full before registration. Explicitly declares itself
  read-only in its own text ("This skill is read-only. It analyzes the codebase and
  outputs recommendations. It does NOT create or modify any files.") and its own
  frontmatter `tools:` list is `Read, Glob, Grep, Bash` — no `Write`/`Edit`. Genuinely
  low-risk by design, matching the founder's required semantics exactly.
- **Known limitation, disclosed**: the skill's own `references/` directory (hooks-patterns.md,
  mcp-servers.md, plugins-reference.md, skills-reference.md, subagent-templates.md) is NOT
  vendored in this pass — only the core `SKILL.md`. The core file's own tables already carry
  enough content to produce a real recommendation; the reference files add depth per category,
  not a different mechanism.
- **Governance**: any recommendation this skill produces enters Brain OS labeled
  `RECOMMENDED`, never `INSTALLED` — it is Anthropic's own official plugin, but "official"
  is not "installed"; the distinction the founder required applies regardless of source
  trust level.
