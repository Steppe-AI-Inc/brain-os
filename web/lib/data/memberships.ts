"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// MEMBERSHIP IS REVOCABLE, OR IT IS NOT GOVERNED (BUG-035, IM-D5).
//
// Until this file existed, nothing in the product could remove a person's access to a company. Invitations
// could be revoked; the MEMBERSHIP an accepted invitation creates could not. So an accepted invitation — or
// one of the memberships the old, ungoverned invite path created directly — produced an active member no
// founder-facing screen could undo. Routing the Invite button through the governed lifecycle did not touch
// that, which is why IM-D5 is a SEPARATE defect identity from BUG-036 and BUG-037.
//
// DEACTIVATE, NOT DELETE. `company_memberships.active` is what every consumer already reads —
// `getOrganizations` filters on it, the membership check in `invitePerson` filters on it — so setting it
// false removes access everywhere at once, and the row survives as the record that access WAS held and when
// it ended. Deleting the row would erase that, and an access grant with no history is not auditable.
//
// AUTHORIZATION IS THE DATABASE'S, NOT THIS FILE'S. `memberships_write_admin` is
// `for all using (is_founder_or_admin()) with check (is_founder_or_admin())`, so a caller without that
// authority updates zero rows. This file therefore asks the database to do it and REPORTS WHAT HAPPENED,
// rather than deciding first whether the caller ought to be allowed — a client-side opinion about authority
// is a second, weaker copy of a rule that already exists, and the two drift.
//
// NOTHING HERE THROWS. A throw inside a Server Action rejects it and the caller cannot turn a rejection
// into a message (BUG-037). Every path below returns a terminal outcome.

export const MEMBERSHIP_OUTCOMES = [
  "DEACTIVATED",
  "ALREADY_IN_THAT_STATE",
  "NOT_FOUND_OR_NOT_PERMITTED",
  "UNKNOWN_ERROR",
] as const;

export type MembershipOutcome = (typeof MEMBERSHIP_OUTCOMES)[number];

export type MembershipResult = {
  ok: boolean;
  outcome: MembershipOutcome;
  message: string;
};

function say(outcome: MembershipOutcome, who: string): MembershipResult {
  // `ok` means THE WORLD CHANGED AS ASKED — not "the request completed". The invitation work is where that
  // distinction was learned: an `ok: true` that meant "the API call returned" is how a founder came to
  // believe a message had arrived.
  const messages: Record<MembershipOutcome, string> = {
    DEACTIVATED: `${who} no longer has access to this company. The membership record is kept, so when they had access and when it ended stay on file.`,
    ALREADY_IN_THAT_STATE: `${who} already has no access to this company — nothing was changed.`,
    NOT_FOUND_OR_NOT_PERMITTED: `That membership could not be changed. Either it no longer exists, or your account is not permitted to change access for this company.`,
    UNKNOWN_ERROR: `The change could not be completed, and the reason was not one this screen recognises. Nothing has been reported as done. Please try again.`,
  };
  return {
    ok: outcome === "DEACTIVATED",
    outcome,
    message: messages[outcome],
  };
}

async function readMembership(membershipId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_memberships")
    .select("id, active, role_in_company, company_id, profiles(full_name)")
    .eq("id", membershipId)
    .maybeSingle();
  return { supabase, data, error };
}

function nameOf(row: { profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null } | null): string {
  if (!row?.profiles) return "That person";
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return p?.full_name || "That person";
}

/**
 * Remove a person's access to one company, keeping the record that they had it.
 *
 * THE ROW COUNT IS THE EVIDENCE. A `.update()` that RLS refuses does not error — it updates nothing and
 * returns an empty set. Reading that back is the only way to tell "changed" from "silently not permitted",
 * and reporting the second as the first is precisely the class of defect this campaign keeps finding.
 */
export async function deactivateCompanyMembership(membershipId: string): Promise<MembershipResult> {
  try {
    const { supabase, data: existing, error: readError } = await readMembership(membershipId);
    if (readError) return say("UNKNOWN_ERROR", "That person");
    if (!existing) return say("NOT_FOUND_OR_NOT_PERMITTED", "That person");
    const who = nameOf(existing);
    if (existing.active === false) return say("ALREADY_IN_THAT_STATE", who);

    const { data: changed, error } = await supabase
      .from("company_memberships")
      .update({ active: false })
      .eq("id", membershipId)
      .select("id");
    if (error) {
      console.error("deactivateCompanyMembership: the update failed", { membershipId, error });
      return say("UNKNOWN_ERROR", who);
    }
    if (!changed || changed.length === 0) return say("NOT_FOUND_OR_NOT_PERMITTED", who);

    revalidatePath("/access");
    revalidatePath("/people");
    return say("DEACTIVATED", who);
  } catch (e) {
    console.error("deactivateCompanyMembership: threw", { membershipId, error: e });
    return say("UNKNOWN_ERROR", "That person");
  }
}

// REACTIVATION AND ROLE-EDITING DELIBERATELY DO NOT EXIST HERE.
//
// A first draft of this file carried `reactivateCompanyMembership` and `setCompanyMembershipRole`. Both were
// removed, and the suite that caught them was right to.
//
// ACTIVATING a membership from the application is the founder's prohibition in its exact words: authority is
// granted at ACCEPTANCE and nowhere else. "They used to have access" is not acceptance either - if someone
// should have access again, they are INVITED again, through the governed lifecycle, and they accept. That is
// what INVITE != ADD MEMBER means when it is inconvenient.
//
// EDITING THE ROLE on an existing membership is the un-auditable path the invitation work exists to replace.
// The role belongs on the INVITATION, where it is chosen once, recorded, and applied by the acceptance gate
// from the stored row - see `invitePerson`'s invitedRole argument. A membership whose role was edited
// afterwards no longer says what the person was invited as.
//
// So this file has exactly one operation, and it only ever takes access AWAY.
