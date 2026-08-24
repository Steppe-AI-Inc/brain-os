import { getCurrentProfile } from "@/lib/data/profile";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts guarantees a valid session before this layout renders. Data authorization
  // remains in Supabase RLS; the shell only adapts navigation to desktop and mobile.
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-screen md:flex">
      <AppSidebar profile={profile} />
      <main className="min-w-0 flex-1 px-4 pb-8 pt-20 sm:px-6 md:p-8">{children}</main>
    </div>
  );
}
