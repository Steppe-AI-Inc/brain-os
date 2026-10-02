// FACTORY -> UPDATE: what is authorized, and in which order (founder decision 2026-10-03). No dependency on the request, cookies or
// next/*: lib/data/factory-update.ts hands in the real dependencies, and the suite runs this file as it is.
//
// THE PREPARED UPDATE is the release the founder's staging step placed in the Factory's public release storage:
//   <releases>/production/prepared.json                       the release's manifest, NOT signed (release-manifest.mjs make)
//   <releases>/production/<version>/BrainFactorySetup.exe     the installer
// Confirm authorizes EXACTLY that release: the one the page showed, still the one in storage, whose installer - as storage serves
// it - has the manifest's digest. Only then is the password checked, and only then is the Factory asked to sign and publish.
import type { AdminRefusal, AdminResult } from "./admin-client";
import type { Reauth } from "./reauth";

export type PreparedUpdate = { channel: "production"; version: string; source_sha: string; digest: string; receipt_sha256: string };
export type AuthorizeReceipt = { release_id: string; already?: boolean; supersedes?: string | null; manifest: Record<string, unknown>; manifest_served: boolean };

export const PREPARED_FILE = "prepared.json";
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]{1,40})?$/;

/** the prepared release from the bytes release storage serves, or null when they are not an unsigned production manifest */
export function parsePrepared(value: unknown): PreparedUpdate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  if (m.v !== 1 || m.channel !== "production") return null;
  if (typeof m.version !== "string" || !VERSION.test(m.version)) return null;
  if (typeof m.source_sha !== "string" || !/^[0-9a-f]{40}$/.test(m.source_sha)) return null;
  if (typeof m.digest !== "string" || !/^[0-9a-f]{64}$/.test(m.digest)) return null;
  if (typeof m.receipt_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(m.receipt_sha256)) return null;
  // a prepared release is not signed: the Factory signs it when the founder confirms
  if ((m.signature !== null && m.signature !== undefined) || (m.key_id !== null && m.key_id !== undefined)) return null;
  return { channel: "production", version: m.version, source_sha: m.source_sha, digest: m.digest, receipt_sha256: m.receipt_sha256 };
}

export function sameUpdate(a: PreparedUpdate, b: PreparedUpdate): boolean {
  return a.channel === b.channel && a.version === b.version && a.source_sha === b.source_sha && a.digest === b.digest && a.receipt_sha256 === b.receipt_sha256;
}

export type UpdateDeps = {
  /** the account signed in on the page, verified with Brain OS; null when there is none */
  account: () => Promise<{ id: string; email: string } | null>;
  /** a Factory read with the page session: a caller who is not a Factory admin is refused here, by the Factory, before anything is fetched */
  gate: () => Promise<AdminResult<unknown>>;
  /** the prepared release in release storage now */
  prepared: () => Promise<PreparedUpdate | null>;
  /** the digest (PE image hash) of the installer release storage serves for it; null when it serves none */
  servedDigest: (p: PreparedUpdate) => Promise<string | null>;
  /** the password check of that account (lib/factory/reauth.ts) */
  reauth: (account: { id: string; email: string }, password: string) => Promise<Reauth>;
  /** the Factory's authorize-update, called with the fresh session's token */
  authorize: (p: PreparedUpdate, freshToken: string) => Promise<AdminResult<AuthorizeReceipt>>;
};

const refuse = (refused: string, message: string): AdminRefusal => ({ ok: false, refused, message });

/** One confirmation: the exact prepared release, the password of the account that is signed in, then the Factory. The password is
 *  handed to `reauth` and to nothing else. */
export async function authorizePreparedUpdate(deps: UpdateDeps, input: { password: string; expected: PreparedUpdate }): Promise<AdminResult<AuthorizeReceipt>> {
  const account = await deps.account();
  if (!account) return refuse("not_authenticated", "Sign in to Brain OS first.");
  if (typeof input.password !== "string" || input.password.length === 0) return refuse("password_required", "Enter the password of the account you are signed in with.");
  const gate = await deps.gate();
  if (!gate.ok) return gate;
  const prepared = await deps.prepared();
  if (!prepared) return refuse("no_prepared_update", "Release storage holds no prepared update. Nothing was authorized.");
  if (!sameUpdate(prepared, input.expected)) return refuse("update_changed", "The prepared update changed since this page was loaded. Reload and read it again. Nothing was authorized.");
  const served = await deps.servedDigest(prepared);
  if (served !== prepared.digest) {
    return refuse("installer_mismatch", served
      ? `The installer release storage serves is not the prepared one (its digest starts ${served.slice(0, 16)}). Nothing was authorized.`
      : "Release storage does not serve the prepared installer. Nothing was authorized.");
  }
  const fresh = await deps.reauth(account, input.password);
  if (!fresh.ok) return fresh;
  try {
    return await deps.authorize(prepared, fresh.token);
  } finally {
    await fresh.signOut();
  }
}
