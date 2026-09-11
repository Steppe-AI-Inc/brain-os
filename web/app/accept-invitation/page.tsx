import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// `buttonVariants` rather than `<Button asChild>`: this Button has no asChild prop, and nesting a
// <button> inside an <a> is invalid HTML. Styling the Link is the idiom that actually works here.
import { buttonVariants } from "@/components/ui/button";
import { acceptInvitation } from "@/lib/data/accept-invitation";

// THE ONE SURFACE THAT TURNS AN INVITATION INTO A MEMBERSHIP.
//
// It exists because nothing did. `accept_company_invitation(token)` had no caller anywhere in web/, so the
// governed lifecycle could create, list and revoke invitations and could never complete one.
//
// THE TOKEN IS CONSUMED ON THE SERVER AND NEVER REACHES THE CLIENT BUNDLE. This is a server component: the
// token arrives in the URL, is passed straight to the server action, and the page renders only the outcome
// sentence. It is never placed in a prop, a data attribute, or a client component, because a single-use
// bearer credential in client-visible markup is a credential exposure.
//
// ACCEPTING ON RENDER IS DELIBERATE, AND IT IS SAFE BECAUSE THE RPC IS SINGLE-USE. An emailed link is
// followed by a mail client prefetcher as often as by a person, so a confirm button would not prevent a
// double redemption — the database's `status = 'pending'` predicate plus `for update` is what prevents it,
// and a second redemption reports ALREADY_USED rather than granting anything twice. A reload therefore
// shows ALREADY_USED on an invitation that genuinely succeeded, which is why the success and already-used
// states are worded as separate sentences rather than one hedged one.
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await acceptInvitation(token);
  const ok = result.outcome === "MEMBERSHIP_ACTIVE";

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-8">
      <Card className="w-full max-w-md border-border/60 bg-card/90 backdrop-blur">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-black text-white">
            Σ
          </div>
          <CardTitle className="text-xl">
            {ok ? "You're in" : "This invitation could not be accepted"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{result.message}</p>

          {/* INVITATION != MEMBERSHIP, stated at the one moment it has just stopped being true. The
              membership exists now, and it exists because it was accepted — not because an email was
              sent. */}
          {ok ? (
            <Link href="/dashboard" className={buttonVariants()}>
              Go to your dashboard
            </Link>
          ) : (
            <div className="flex flex-col gap-2">
              {result.outcome === "NOT_SIGNED_IN" || result.outcome === "WRONG_ACCOUNT" ? (
                <Link href="/login" className={buttonVariants()}>
                  Sign in
                </Link>
              ) : null}
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                Back
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
