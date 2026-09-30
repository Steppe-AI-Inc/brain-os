# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-010 — Where the dev-channel BrainFactorySetup.exe finds its Factory Node API and its signed manifest in R-1, so that R-1
rehearses AC-1 with exactly AC-1's human steps**

- **Filed:** 2026-09-28 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Required by:** AC-1 (and its rehearsal R-1), WO-4 ("What must be true", the human-steps bullet), P-4, S-5,
  `VERIFICATION_SPEC.md` §8.
- **Kind:** a conflict between acceptance criteria that the implementer cannot settle. This request edits no Director text.
  **None of the options below is implemented, and none will be before the Director decides.** Until then the dev channel behaves as
  r3 has it (no compiled-in endpoint, no release storage), and the Computers page lists the steps that artifact actually needs (see
  "Meanwhile" below).

## Requirement (the conflict: three r3 texts)

Three r3 requirements cannot all hold for R-1 as the candidate is built today.

1. **The human steps.** AC-1 (`ACCEPTANCE_MATRIX.md:43`) allows, on the PC, only "download and run `BrainFactorySetup.exe`, enter the
   code", followed by "**no human step**". WO-4 lists the same three steps and ends with "Nothing after that." P-4 is zero-touch.
2. **R-1 uses the dev artifact against a throwaway plane.** R-1 (`ACCEPTANCE_MATRIX.md:12-14`) is AC-1 run "in a fresh disposable
   Windows VM" that "runs against a disposable plane and local function runtimes". S-5 (`...SECURITY_TENANCY.md:15`) says R-1
   "rehearses with the dev-channel artifact and its digest", and that "the live plane has no dev channel".
3. **The endpoint is part of the certified bytes.** Under S-5 the endpoint is fixed into each channel's artifact (AC-5(n): bytes outside
   the hashed ranges change neither it nor the trust set), and §8 (`VERIFICATION_SPEC.md:421-426`) requires every channel's
   reproduced digest to equal the digest recorded for that channel in the candidate's release manifest.

## Evidence (what the dev build does today)

The address of a disposable plane is unknown when the candidate is built and changes from one rehearsal to the next, so the dev build
compiles in neither an endpoint nor a release-storage address (`scripts/factory-build/build-sea.mjs`: `DEFAULT_API.dev = null`,
`RELEASE_BASE.dev = null`). Double-clicking it on the R-1 VM therefore does not work on its own: the operator must also save the
signed manifest into the same folder, and must start the exe from a terminal with the Node API address as a non-secret `--api`
argument. With the dev artifact as r3 stands, R-1 cannot show AC-1's three steps.

The L4-F7 fix in this candidate narrows the choices further. The node now sends a pairing code or a session token only to an `https`
address, or over plain `http` to its own loopback (`127.0.0.1`, `localhost`, `[::1]`; `scripts/factory-runner/enrolled/api.mjs`,
`endpointRefusal`). A local function runtime serves plain `http`, and from inside a VM the host is a network address, which the rule
refuses. Serving `https` from the host would need its private certificate authority installed on the VM, and WO-4 excludes "CA
copying". R-1 therefore also needs the host's function runtime to answer on the VM's own loopback address.

## Alternatives (the options for the Director)

- **C (proposed; the smallest change).** Give the dev channel fixed loopback values in source:
  `DEFAULT_API.dev = http://127.0.0.1:54321/functions/v1/factory-node-api` and
  `RELEASE_BASE.dev = http://127.0.0.1:54321/storage/v1/object/public/factory-releases/dev`. Port 54321 is where the Supabase CLI's
  local stack serves its API, so these paths exist on any local stack. Before the standard user first signs in, the verifier's VM
  administrator forwards 127.0.0.1:54321 on the VM to the host's local stack (for example with `netsh interface portproxy`) and puts
  the dev release into that stack's `factory-releases` bucket. The operator then downloads `BrainFactorySetup.exe` alone,
  double-clicks it and types the code; setup loads its manifest from the release storage and enrolls.
  - No build input is added, so §8's per-channel digest comparison applies unchanged, and the L4-F7 rule needs no exception.
  - The Director would describe the port forward as part of R-1's prepared environment, not as a step of the operator.
  - On a machine where nothing answers at 127.0.0.1:54321, the dev build stops with a named refusal (the plane does not answer)
    before it asks for a code.
- **A.** Two build options accepted only when `--channel dev` is given, for example `--dev-api <url>` and
  `--dev-release-base <url>`; a production build refuses them and keeps its values in source. Both values would be written into
  build-info and into the verification receipt. For R-1 the verifier would build a dev artifact carrying its own plane's addresses
  and record that artifact's digest on its own line. §8 would then compare the dev digest of a build made without these options,
  while the digest installed during R-1 would have to match a rebuild made with the recorded values. If the only route from the VM to
  the host is plain `http` over the network, the Director would also have to decide whether a dev build may send to a private
  address, which the L4-F7 rule currently refuses.
- **B.** The Director states in R-1's procedure that, for the dev channel only, saving the manifest beside the exe and passing the
  non-secret `--api` address count as preparation of the rehearsal and not as enrollment steps. The production channel, and with it
  final AC-1, is untouched: that build carries its endpoint and its release storage.

## Why the implementer does not choose

Every option changes either what R-1 proves or how §8 is read. C alters the dev channel's values in source and adds a prepared step
to R-1's environment; A changes how the dev digest is reproduced; B changes how many human steps R-1 shows. Those are decisions about
acceptance criteria, which CLAUDE.md §8 reserves to the Director: the implementer may only propose them.

## Meanwhile (the r3 behaviour)

- The dev channel still has no compiled-in endpoint and no release storage, exactly as at `412ac14`.
- The Computers page lists, for each channel, what its artifact needs. On the production channel: "Run BrainFactorySetup.exe and
  enter the code". On the dev channel: save the manifest into the same folder; in a terminal opened there, start
  `.\BrainFactorySetup.exe setup --api <the Factory Node API URL of the plane>`; type the code when setup asks for it, never on the
  command line (`web/app/(app)/software-factory/computers/shared.tsx`). This is the page half of finding L4-F4, fixed without waiting
  for this request.
- On every channel the pairing code is never an argument (B-3), and setup asks for nothing but the code (L3-F1).

## Impact

- **On R-1:** until a decision is made, R-1 with the dev artifact shows two extra operator actions (saving the manifest and passing
  `--api`), and it needs the host's function runtime reachable on the VM's loopback.
- **On the production channel and final AC-1:** none. The production build carries its `https` endpoint and its release storage, so
  the acceptance machine needs only the download, the run and the code.
- **After a decision:** the next candidate implements the option chosen, and the Computers page lists exactly its steps.
