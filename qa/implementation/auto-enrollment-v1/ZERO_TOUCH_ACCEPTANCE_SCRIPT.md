# Zero-touch acceptance on a clean PC — the prepared script (NOT RUN)

**Who runs it:** the independent verifier, on the acceptance machine (the third PC), after the founder's steps S and 1–8
(`FOUNDER_PREPARED_STEPS.md`): the release it installs is the one the founder authorized in Brain OS → Factory → Update, signed by
the Factory's own signer. The implementer never touches that machine (S-15). This script is the implementer's
preparation only. The Director's AC-1..AC-4 rows and `VERIFICATION_SPEC.md` §6 define acceptance; this file does not.

**The machine:** a Windows 10/11 PC that has never run Brain Factory. It has a standard (non-admin) Windows user, and no Git, Node,
npm, repository checkout, `runner.env`, CA file or database URL. Nothing is pre-installed.

## A. In Brain OS (a Factory admin: founder or holding_admin, with a `tenant_admins` row)

1. Open **Factory → Factory Computers** (`/software-factory/computers`). The list shows the Factory's derived states, and the counts are
   the Factory's own ("Showing x of y").
2. **Add computer**:
   - display name: "Acceptance PC";
   - envelope: roles `generic` and `verifier`, max concurrent runs 1, max heavy 1.
   
   Leave S-16(a) unbound unless this is the Home computer.
3. The page shows the **pairing code once**, with its expiry, plus the download link for `BrainFactorySetup.exe` (production, the
   published release the Factory signed). Record the time.
4. Optional: **Check the served file**. The sha256 as served, the digest equal to the published release's digest, and the
   certificate-table state are shown.

## B. On the clean PC (the only human steps)

1. Download `BrainFactorySetup.exe` from the link. One file: setup fetches its signed manifest from the same public release.
2. Run it (double-click: no argument) and type the pairing code at its prompt. Nothing else is asked. The code is never typed on
   a command line and never shown by setup (S-12).
3. Setup does the following, in order, and prints each step:
   - verifies the release before anything runs (signature, key id, PE image hash against the trust set fixed in the exe);
   - makes a new key and stores it with DPAPI (it never leaves the PC); where DPAPI is unavailable, setup refuses by name
     (`dpapi_required`) before the code is asked;
   - asks for the code, and enrolls with it (proof of possession);
   - checks the release against the plane's current revocations and the no-downgrade rule, before anything is installed;
   - installs under `%LOCALAPPDATA%\BrainFactory`;
   - registers the logon task and its 5-minute watchdog (Interactive, Limited, no elevation);
   - starts the runtime, and reports **ALIVE**.
4. Expected: no UAC prompt, no console window left open, and no other download.

## C. Back in Brain OS (observe server truth only)

1. The computer shows the badges **Alive** and **Available**. The heartbeat age uses the Factory clock. The runtime version and digest are the
   published release's.
2. `status` on the PC (`%LOCALAPPDATA%\BrainFactory\runtime\<version>-<digest>\BrainFactory.exe status`) agrees with the page.
3. Submit a probe work order that requires verification (`POST /v1/admin/submit-work-order` with a Factory admin's own Brain OS
   session: the page lists work, it has no control that submits it). One node authors it and a different identity certifies
   it. The work order ends `done` (Work card). The Waiting card shows each node's first failing gate while it waits.

## D. Lifecycle, observed on the page and on the PC

| action | expected on the page | expected on the PC |
|---|---|---|
| Drain | Draining; no new claims (gate 9 named) | status DRAINING |
| Resume | Available | claims again |
| Request key rotation | the credential is superseded and the new one is active; same principal | the runtime rotates on its next call |
| Revoke credential | Credential revoked; every call refused | status REFUSED (credential_revoked), not restarted (no loop) |
| Re-pair | a new code for the same principal | `.\BrainFactorySetup.exe uninstall`, in a terminal opened in its folder (the revoked key and the state go), then run BrainFactorySetup.exe and enter the code: a new key, the same node id. Setup run on the old home refuses by name (`credential_revoked`) and says this |
| Archive | Archived; every credential revoked | REFUSED |
| Restore | a fresh re-pair code | as for re-pair (uninstall, then setup with the code): ALIVE again |
| Reboot the PC and sign in | Recovering, then Available (the logon task) | the supervisor starts at logon |
| Kill the supervisor (Task Manager) | stale at most until the watchdog (5 min) | restarted by the watchdog |
| Uninstall (`.\BrainFactorySetup.exe uninstall`, the downloaded installer, in a terminal opened in its folder; the installed copy cannot remove its own running file) | Stale → Offline; then revoke or archive it in Brain OS | the task, the runtime, the key and the state are removed |

## E. Negative checks on the same machine

- Enter an expired, revoked or already-used code: setup refuses by name, and nothing is installed.
- Change one byte of `BrainFactorySetup.exe` (inside the hashed ranges): setup refuses before execution (`digest_mismatch`).
- Give setup a pairing code as an argument (any position): refused by name, exit 64, the argument never shown, nothing sent.
- On the enrolled PC, run the setup of an older certified release: refused by name (`downgrade_refused`); nothing is installed and
  the running release is unchanged.
- A holding_admin who is not in `tenant_admins`, and an employee, open the Computers page: "Refused not_authorized", and no computer
  is shown.

## F. Evidence

For every step, the verifier records its screenshot (page), the server rows (read-only observer), the PC's
`status`, `logs` and task XML, the time, the exact deployed SHA and function versions, and the release digest.
