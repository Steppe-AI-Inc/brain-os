"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callFactoryAdmin, type AdminResult } from "@/lib/factory/admin-client";
import { factoryReleasesUrl, INSTALLER_FILE, MANIFEST_FILE } from "@/lib/factory/config";
import { authenticodeImageHash } from "@/lib/factory/pe-image";
import { passwordReauth } from "@/lib/factory/reauth";
import { authorizePreparedUpdate, parsePrepared, PREPARED_FILE, sameUpdate, type AuthorizeReceipt, type PreparedUpdate } from "@/lib/factory/update";
import { listReleases, type Release } from "./factory-computers";

// Brain OS -> Factory -> Update (founder decision 2026-10-03). The founder holds no release key: the prepared release is authorized
// by entering, again, the password of the account that is signed in. This file reads what is prepared (the Factory's public release
// storage) and what is published (the Factory, with the viewer's own session), and wires the one action; the order of the checks
// and the handling of the password are lib/factory/update.ts and lib/factory/reauth.ts. Authority is the Factory's, on the call:
// founder-only, and a password entry at most two minutes old. Hiding the button is never the control.

export type UpdateState = {
  /** the prepared release in release storage; null when there is none (or it is not an unsigned production manifest) */
  prepared: PreparedUpdate | null;
  /** false when release storage could not be read at all (then `prepared` says nothing) */
  storageReadable: boolean;
  /** the production release the Factory has published now */
  published: Release | null;
  /** the PUBLIC half of this Factory's release signer: the key the installer's trust set must pin */
  signer: { key_id: string; public_key: string } | null;
  /** the prepared release is the published one */
  upToDate: boolean;
  /** for the published release: its signed manifest is in release storage, where the installer looks for it */
  manifestServed: boolean | null;
};

const MAX_INSTALLER_BYTES = 256 * 1024 * 1024;

async function readPrepared(): Promise<{ readable: boolean; prepared: PreparedUpdate | null }> {
  const base = factoryReleasesUrl();
  if (!base) return { readable: false, prepared: null };
  let res: Response;
  try {
    // the address is public and may be cached on the way: the query is only there to read the object as it is now
    res = await fetch(`${base}/production/${PREPARED_FILE}?at=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    return { readable: false, prepared: null };
  }
  if (res.status === 400 || res.status === 404) return { readable: true, prepared: null };   // no such object: nothing is prepared
  if (res.status !== 200) return { readable: false, prepared: null };
  const text = await res.text();
  if (text.length > 65536) return { readable: true, prepared: null };
  try {
    return { readable: true, prepared: parsePrepared(JSON.parse(text)) };
  } catch {
    return { readable: true, prepared: null };
  }
}

/** the S-5 digest (PE Authenticode image hash) of the installer release storage serves for a prepared release, or null */
async function servedDigest(p: PreparedUpdate): Promise<string | null> {
  const base = factoryReleasesUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/production/${encodeURIComponent(p.version)}/${INSTALLER_FILE}`, { cache: "no-store", signal: AbortSignal.timeout(120000) });
    if (res.status !== 200 || Number(res.headers.get("content-length") || "0") > MAX_INSTALLER_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_INSTALLER_BYTES) return null;
    return authenticodeImageHash(buf);
  } catch {
    return null;
  }
}

async function manifestIsServed(release: Release): Promise<boolean | null> {
  const base = factoryReleasesUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/production/${encodeURIComponent(release.version)}/${MANIFEST_FILE}?at=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (res.status !== 200) return false;
    const m = (await res.json()) as { digest?: unknown; signature?: unknown };
    return m.digest === release.digest && typeof m.signature === "string";
  } catch {
    return null;
  }
}

/** What Factory -> Update shows. A viewer who is not a Factory admin gets the Factory's refusal by name and nothing else. */
export async function getUpdateState(): Promise<AdminResult<UpdateState>> {
  const list = await listReleases();
  if (!list.ok) return list;
  const published = list.releases.items.find((r) => r.channel === "production" && r.state === "published") ?? null;
  const { readable, prepared } = await readPrepared();
  const upToDate = !!prepared && !!published && published.version === prepared.version && published.digest === prepared.digest;
  return {
    ok: true,
    prepared,
    storageReadable: readable,
    published,
    signer: list.signer ?? null,
    upToDate,
    manifestServed: published ? await manifestIsServed(published) : null,
  };
}

/** Confirm: authorize exactly the prepared release the page showed, with the password of the account that is signed in. */
export async function authorizeUpdate(input: { password: string; expected: PreparedUpdate }): Promise<AdminResult<AuthorizeReceipt>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, refused: "misconfigured", message: "Brain OS's address is not configured." };
  const expected = parsePrepared({ v: 1, ...(input?.expected ?? {}) });
  if (!expected || !sameUpdate(expected, input.expected)) return { ok: false, refused: "bad_request", message: "That is not a prepared update." };
  const result = await authorizePreparedUpdate(
    {
      account: async () => {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        return error || !data.user || !data.user.email ? null : { id: data.user.id, email: data.user.email };
      },
      gate: () => listReleases(),
      prepared: async () => (await readPrepared()).prepared,
      servedDigest,
      reauth: (account, password) => passwordReauth({ url, anonKey }, account, password),
      authorize: (p, freshToken) =>
        callFactoryAdmin<AuthorizeReceipt>("authorize-update", { channel: p.channel, version: p.version, source_sha: p.source_sha, digest: p.digest, receipt_sha256: p.receipt_sha256 }, freshToken),
    },
    { password: typeof input?.password === "string" ? input.password : "", expected },
  );
  revalidatePath("/software-factory/update");
  revalidatePath("/software-factory/computers");
  return result;
}
