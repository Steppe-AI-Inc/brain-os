"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// THE ACCEPTANCE HALF, WHICH DID NOT EXIST.
//
// Before this file, `accept_company_invitation(token)` was called by NOTHING in web/ — the string appeared
// only in three comments. The governed lifecycle could create invitations, list them and revoke them, and
// had no way for anyone to accept one. `/pending-activation` even told people "once you accept that
// invitation, this page will send you straight to your dashboard", which was unreachable.
//
// That gap is why the Invite button had to be routed and this written in the same change: routing the
// button to the governed path without an acceptance surface would have created invitations nobody could
// ever redeem — strictly worse than the contract violation it replaced.
//
// EVERY AUTHORITY DECISION IS THE DATABASE'S. This module passes one opaque token and nothing else. The
// RPC is SECURITY DEFINER and derives company, role and recipient authority FROM THE STORED ROW; its
// signature deliberately takes no company or role parameter, so no payload from here can widen what a
// recipient receives. This file must never grow a company or role argument — that is the property, and
// adding one would silently turn acceptance into an authority-granting call.
//
// The RPC also enforces, and this module deliberately does NOT duplicate:
//   * single use      — `status = 'pending'` in the lookup plus `for update`, so a second acceptance and
//                       two concurrent ones both find nothing;
//   * expiry          — an expired row is flipped to 'expired' and refused, so expiry is recorded rather
//                       than merely checked;
//   * identity        — the caller's profile email must equal the invitation's email. This is what makes a
//                       Google or other OAuth account safe: matching the invited address accepts, any
//                       other address is refused even with a valid token.
//
// Re-implementing any of those here would create a second authority that could disagree with the first.

/** What acceptance can end as. Every one is terminal and every one is a sentence, never a provider string. */
export type AcceptOutcome =
  | "MEMBERSHIP_ACTIVE"
  | "NOT_SIGNED_IN"
  | "NO_TOKEN"
  | "ALREADY_USED"
  | "EXPIRED"
  | "WRONG_ACCOUNT"
  | "NO_PROFILE"
  | "UNKNOWN_ERROR";

export type AcceptResult = { outcome: AcceptOutcome; message: string };

// The RPC signals by RAISING, so these are matched on its own exception text — the one place that text is
// read, and it is discarded here rather than shown.
function classifyAcceptError(err: unknown): AcceptOutcome {
  const text = (
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err)
  ).toLowerCase();
  if (/expired/.test(text)) return "EXPIRED";
  if (/not found or already used/.test(text)) return "ALREADY_USED";
  if (/different email address/.test(text)) return "WRONG_ACCOUNT";
  if (/no profile bound/.test(text)) return "NO_PROFILE";
  return "UNKNOWN_ERROR";
}

function describe(outcome: AcceptOutcome): string {
  switch (outcome) {
    case "MEMBERSHIP_ACTIVE":
      return "Your invitation is accepted and your workspace access is active.";
    case "NOT_SIGNED_IN":
      return "Sign in with the email address this invitation was sent to, then open the link again.";
    case "NO_TOKEN":
      return "This link is missing its invitation code. Ask whoever invited you to send it again.";
    case "ALREADY_USED":
      return "This invitation has already been used, or it was cancelled. Ask for a new one.";
    case "EXPIRED":
      return "This invitation has expired. Ask whoever invited you to send a new one.";
    case "WRONG_ACCOUNT":
      return "This invitation was issued to a different email address than the account you are signed in with.";
    case "NO_PROFILE":
      return "Your account is not fully set up yet. Sign out, sign in again, and reopen this link.";
    case "UNKNOWN_ERROR":
      return "This invitation could not be accepted. Nothing was changed.";
  }
}

/**
 * Redeem one invitation token for the CURRENTLY SIGNED-IN account.
 *
 * IDEMPOTENT WHERE IT CAN BE AND HONEST WHERE IT CANNOT. The membership insert inside the RPC is
 * `on conflict (company_id, profile_id) do update set active = true`, so a membership that already exists
 * is re-activated rather than duplicated. The invitation itself is single-use, so a SECOND acceptance of
 * the same token reports ALREADY_USED — which is the truth, not a failure to hide: the first one worked.
 */
export async function acceptInvitation(token: string | undefined | null): Promise<AcceptResult> {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) return { outcome: "NO_TOKEN", message: describe("NO_TOKEN") };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // A token is a bearer credential; without a session there is no identity to bind it to, and the RPC
    // would refuse anyway. Saying so is more useful than letting it raise.
    if (!user) return { outcome: "NOT_SIGNED_IN", message: describe("NOT_SIGNED_IN") };

    const { error } = await supabase.rpc("accept_company_invitation", { p_token: t });
    if (error) {
      const outcome = classifyAcceptError(error);
      // The token is NEVER logged. It is a single-use credential and a log is the wrong place for one.
      console.error("acceptInvitation: refused", { outcome, authUserId: user.id });
      return { outcome, message: describe(outcome) };
    }

    revalidatePath("/dashboard");
    revalidatePath("/people");
    revalidatePath("/access");
    return { outcome: "MEMBERSHIP_ACTIVE", message: describe("MEMBERSHIP_ACTIVE") };
  } catch (e) {
    const outcome = classifyAcceptError(e);
    console.error("acceptInvitation: threw", { outcome });
    return { outcome, message: describe(outcome) };
  }
}
