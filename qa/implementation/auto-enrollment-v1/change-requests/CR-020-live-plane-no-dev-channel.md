# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-020 — "Test / dev keys exist only on disposable planes; the live plane has no dev channel" (S-5; AC-5(h)): the candidate holds
it in the artifact and in the founder's procedure. Is a runtime-side refusal wanted as well? (S-5; S-10; VERIFICATION_SPEC §3.4)**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation` (release-verification area,
  after the verifier review of L6-6 / L7-27).
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a clarification of how a Director requirement is read, and a possible new runtime refusal the r3 texts do not state. No
  Director text is edited.
- **Until the Director decides, the candidate keeps the r3 behaviour:** no new refusal is added anywhere, and the candidate relies on
  no answer.

## Requirement (the r3 texts)

- S-5: "Test / dev keys exist **only on disposable planes**; the live plane has no dev channel." And: "A production-channel artifact,
  the only kind a live-plane node installs, has no dev mode: it trusts only the founder's keys (C-3) and refuses a dev-key
  signature." Nothing received at runtime - "the plane's identity or URL" among them - adds a key or changes the mode.
- WO-6: "Test / dev keys are trusted only on disposable planes; the live plane has no dev channel."
- AC-5(h): "The dev channel holds only dev keys and exists only on disposable planes."
- S-10 and VERIFICATION_SPEC §3 step 4 (the plane-conditioned-behaviour scan, r3 classes): "a guard, front door or handler
  conditioned on plane identity" is a finding. The scan "covers every SQL object and migration statement the candidate adds or
  changes, its Edge handlers and its prepared founder steps, which is S-10's scope".

## What the candidate does

- **Held by the artifact.** The production-channel artifact refuses every dev-key signature by name
  (`dev_key_on_production_channel`), before its trust set is consulted and whatever that set holds
  (`scripts/factory-runner/enrolled/release.mjs`, `verifyRelease`). `scripts/factory-build/build-sea.mjs` (`channelTrust`) refuses to
  build a production trust set that holds a dev key, or a dev trust set that holds any other key (exit 4, nothing written).
- **Not held by the plane.** `factory.releases.channel` accepts `production` and `dev` on every plane
  (`supabase/control-plane/v1/060_releases.sql`); no SQL object or Edge handler asks which plane it is. A plane-side refusal of dev
  releases on the live plane would be a guard conditioned on plane identity, which S-10 and the §3.4 scan exclude.
- **Not held by the runtime either.** The dev-channel artifact carries no endpoint (`DEFAULT_API.dev = null`, CR-010) and accepts any
  `https` Factory Node API address given with `setup --api`, the live Factory project's included. Keeping dev artifacts and dev
  releases off the live plane therefore also rests on the founder's procedure: the founder never publishes a dev-channel release on
  the live plane and never points a dev-channel artifact at it.

## Evidence

- `scripts/factory-runner/enrolled/api.mjs` `endpointRefusal`: the only endpoint rules are a parseable URL without credentials, query
  or fragment, and `https` (plain `http` to loopback only). No channel rule.
- `scripts/factory-build/build-sea.mjs`: `DEFAULT_API = { production: <the live Factory project's Node API>, dev: null }`.
- `qa/factory/v1/release_acceptance.mjs` R-f/k, R-f2, R-k1, R-k3, R-n3 and `qa/factory/v1/release_trust_unit.mjs` U2 show the
  production-channel refusal; `qa/factory/sea_package_regression.mjs` B23, B24 and release_trust_unit U5 show the build refusal.

## Why a decision is needed

The runtime is outside S-10's scan scope, so S-10 does not forbid a runtime-side refusal, and S-5 does not ask for one. Whether
"the live plane has no dev channel" is met by the artifact plus the founder's procedure, or also needs a refusal in the dev-channel
artifact, is a reading of a Director requirement. A new refusal is new product behaviour; the implementer may propose it but not add
it without ratification (CLAUDE.md §8).

## Alternatives (for the Director)

1. **Keep r3 behaviour** (proposed): the separation is held by the production-channel artifact and the build, plus the founder's
   procedure; the candidate report states it as such.
2. **A dev-channel runtime refuses the production channel's endpoint.** A dev-channel artifact refuses, by name and before any
   request, a Factory Node API address equal to the production channel's compiled-in default endpoint (the live Factory project). It
   adds no key and changes no mode (S-5). It is a literal naming a live-plane object inside the runtime, outside the §3.4 scan's
   scope; it would need a developer row and a mutant.
3. **Both (2) and a founder-procedure statement** in `FOUNDER_PREPARED_STEPS.md` that no dev-channel release is ever published on
   the live plane.

## Impact

- On the candidate: none until decided.
- If (2) or (3) is ratified: one runtime check in the setup / upgrade / supervisor paths of the dev channel (or in the Node API
  client), one release_acceptance row and one mutant; (3) also adds a founder-step sentence.
