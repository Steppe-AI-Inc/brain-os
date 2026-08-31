import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/data/profile";
import { signOut } from "../(app)/actions";

// Real UI counterpart to migration 202608310009 (invite-only signup, BUG-004 follow-on).
// Since that migration, handle_new_auth_user() creates every new signup genuinely inert
// (active=false, zero company_memberships) — real workspace access requires a real
// company_invitations row redeemed via accept_company_invitation(token). Before this
// page existed, an inert account authenticated successfully (middleware only checks
// "is there a session", not profile.active) and landed straight on an empty, unexplained
// /dashboard with zero indication anything was pending — a real UI<->DB truth gap found
// during independent BUG-004 verification (qa/KNOWN_FAILURE_MODES.md, same entry as this
// fix). This page is the one honest state a genuinely inert account can land on.
export default async function PendingActivationPage() {
  const profile = await getCurrentProfile();

  // No profile row at all (shouldn't happen - handle_new_auth_user() always creates one)
  // or a profile that's already active: never trap a real, activated user here.
  if (!profile || profile.active) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-8">
      <Card className="w-full max-w-md border-border/60 bg-card/90 backdrop-blur">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-black text-white">
            Σ
          </div>
          <CardTitle className="text-xl">Your account is pending activation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Your Brain OS sign-in was created, but you don&rsquo;t have access to a
            workspace yet. Access is granted by invitation — ask your company admin or
            manager to invite <span className="font-medium text-foreground">{profile.email}</span> to
            their company. Once you accept that invitation, this page will send you
            straight to your dashboard.
          </p>
          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
