import { getCurrentProfile } from "@/lib/data/profile";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already guarantees a session exists for every route under this layout
  // (unauthenticated requests are redirected to /login before this ever renders).
  // Fetching the profile here (not there) keeps the redirect check cheap and lets the
  // profile row itself go through the same RLS as any other query.
  const profile = await getCurrentProfile();

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar profile={profile} />
      <main className="min-w-0 flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
