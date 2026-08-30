# Brain OS Plugin Manifest Format

A `brain-plugin.yaml` (or `.json`) describes one installable component for the Software
Factory's plugin registry (`plugin_sources`/`plugin_components`, see
`202608300004_plugin_registry.sql`). External repositories are never required to natively
understand Brain OS — an importer translates their own native format into this shape.

## Shape

```yaml
name: systematic-debugging          # matches plugin_components.slug
type: skill                          # agent | skill | plugin | mcp_server | execution_provider
                                      # | workflow | testing_tool | library | template
version: "6.3.0"
source:
  owner: obra
  repo: superpowers
  pinned_ref: "b36e0829c6d0140e93cfef2ca599b1b07d4a7797"
entrypoint: skills/systematic-debugging/SKILL.md
skills:
  - systematic-debugging
capabilities:                        # matched against agents.capabilities for routing
  - debugging
  - root-cause-analysis
tools: []                            # any tool this component exposes (MCP servers, etc.)
supported_agents:                    # which Brain OS agent categories this is meaningful for
  - SOFTWARE_FACTORY
  - VERIFICATION
required_permissions: []             # e.g. READ_REPOSITORY, RUN_TESTS — see permission
                                      # vocabulary below; empty for pure prompt/skill content
execution_provider_compatibility: [] # e.g. claude_code_background, mini_swe_agent — empty
                                      # means "not an execution provider"
dependencies: []
health_check: null                   # optional command/URL a health-check pass can run
license: MIT
```

## Permission vocabulary (least privilege, explicit)

`READ_REPOSITORY`, `WRITE_REPOSITORY`, `RUN_TESTS`, `CREATE_WORKTREE`, `NETWORK_ACCESS`,
`DATABASE_READ`, `DATABASE_WRITE`, `DEPLOY_PRODUCTION`.

Any component requesting `WRITE_REPOSITORY`, `DATABASE_WRITE`, or `DEPLOY_PRODUCTION` sets
`plugin_components.requires_approval = true` and cannot reach `install_status = 'registered'`
without an explicit founder/admin approval (`approved_by_profile_id`/`approved_at` populated).

## Importers

A native external format is translated into this manifest shape by a thin importer, not by
requiring the upstream repo to change:

- **Claude agent definitions** (`.claude/agents/*.md` frontmatter) — `type: agent`,
  `entrypoint` = the file path, `capabilities` parsed from an explicit `capabilities:`
  frontmatter line (falls back to an empty list, never inferred from prose).
- **Claude skills** (`SKILL.md` files, e.g. obra/superpowers) — `type: skill`, `entrypoint`
  = the skill file path.
- **MCP servers** (a connector config) — `type: mcp_server`, `tools` populated from a live
  `tools/list` call at smoke-test time, never guessed ahead of time.
- **Selected open-source agent definitions** (wshobson/agents, VoltAgent catalog) — `type:
  agent` or `skill` depending on the source item, `source.pinned_ref` always required (no
  floating `main` installs).

## Install pipeline stage → manifest field mapping

DISCOVER (repo registered, `plugin_sources` row created) → FETCH METADATA (`plugin-sync.mjs`
populates `license`/`latest_upstream_sha`) → LICENSE CHECK (reject if not an approved
permissive license) → STATIC SECURITY INSPECTION (manifest's `required_permissions` reviewed
against actual file contents) → CAPABILITY/PERMISSION INSPECTION (`capabilities`/
`required_permissions` recorded) → QUARANTINE (`install_status = 'quarantined'`, cannot be
attached yet) → SANDBOX SMOKE TEST (real invocation in an isolated context) → REGISTER
(`install_status = 'registered'`, `plugin_components` row complete) → ENABLE (`enabled =
true`) → ATTACH TO AGENT (`agent_plugin_attachments` row) → HEALTH CHECK (`last_health_check_at`/
`last_health_status`).

Pasting a GitHub URL never skips straight to execution — a component sits in `quarantined`
until it has passed static inspection and a real sandboxed smoke test.
