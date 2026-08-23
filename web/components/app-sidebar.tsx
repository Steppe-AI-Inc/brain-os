"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/i18n-context";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(app)/actions";

const NAV_ITEMS: Array<{ href: string; navKey: string; label: string; icon: string }> = [
  { href: "/dashboard", navKey: "nav.dashboard", label: "Dashboard", icon: "◈" },
  { href: "/chat", navKey: "nav.chatOps", label: "AI Native Chat", icon: "✦" },
  { href: "/mindmap", navKey: "nav.mindmap", label: "Operating Mindmap", icon: "◎" },
  { href: "/tasks", navKey: "nav.tasks", label: "Tasks", icon: "☑" },
  { href: "/approvals", navKey: "nav.approvals", label: "Approvals", icon: "⚑" },
  { href: "/companies", navKey: "nav.companies", label: "Companies", icon: "▰" },
  { href: "/people", navKey: "nav.people", label: "People", icon: "👤" },
  { href: "/projects", navKey: "nav.projects", label: "Projects", icon: "▱" },
];

export function AppSidebar({
  profile,
}: {
  profile: { full_name: string; role: string } | null;
}) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useT();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <div className="mb-4 flex items-center gap-3 border-b border-sidebar-border pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-black text-white">
          Σ
        </div>
        <div>
          <div className="text-lg font-bold leading-tight">SEM Brain</div>
          <div className="text-xs text-sidebar-foreground/60">Steppe AI, Inc.</div>
        </div>
      </div>

      {profile && (
        <div className="mb-4 rounded-xl bg-sidebar-accent p-3">
          <div className="text-sm font-semibold">{profile.full_name}</div>
          <div className="text-xs capitalize text-sidebar-foreground/60">
            {profile.role.replace("_", " ")}
          </div>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-1 overflow-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
              }`}
            >
              <span className="w-5 text-center">{item.icon}</span>
              <span>{t(item.navKey, item.label)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-2 border-t border-sidebar-border pt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-sidebar-foreground/60">{t("shell.language", "Language")}:</span>
          <Button
            size="sm"
            variant={locale === "en" ? "default" : "outline"}
            className="h-6 px-2 text-xs"
            onClick={() => setLocale("en")}
          >
            EN
          </Button>
          <Button
            size="sm"
            variant={locale === "mn" ? "default" : "outline"}
            className="h-6 px-2 text-xs"
            onClick={() => setLocale("mn")}
          >
            MN
          </Button>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            {t("shell.signOut", "Sign out")}
          </Button>
        </form>
      </div>
    </aside>
  );
}
