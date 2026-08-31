import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { getOrganizationContext } from "@/lib/data/organizations";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already guarantees a session exists for every route under this layout
  // (unauthenticated requests are redirected to /login before this ever renders).
  // Fetching the profile here (not there) keeps the redirect check cheap and lets the
  // profile row itself go through the same RLS as any other query.
  const profile = await getCurrentProfile();

  // Real UI counterpart to migration 202608310009 (invite-only signup, BUG-004
  // follow-on): a genuinely inert signup (active=false, zero company_memberships) is
  // still a valid authenticated session - RLS alone made every real query return empty,
  // but nothing ever told the user why, or stopped them landing on an empty dashboard.
  // Found live during independent BUG-004 verification. `!profile` also lands here
  // defensively (handle_new_auth_user() always creates one, but never silently render
  // an authenticated app shell for a session with no profile row at all).
  if (!profile || !profile.active) {
    redirect("/pending-activation");
  }

  // Overnight multi-org milestone: real organization selector context, fetched once
  // per navigation here (same place the profile itself is fetched) so it's available
  // to the sidebar switcher and, eventually, any page that wants to scope its own
  // queries by the active organization.
  const organizations = await getOrganizationContext();

  return (
    <div className="flex h-dvh flex-col overflow-hidden md:h-screen md:flex-row">
      <AppSidebar profile={profile} organizations={organizations} />
      <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
