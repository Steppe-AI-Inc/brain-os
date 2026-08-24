"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Network,
  ListChecks,
  ShieldCheck,
  Building2,
  Users,
  FolderKanban,
  LogOut,
  FileSignature,
  TrendingUp,
  Boxes,
  Package,
  Gauge,
  BrainCircuit,
  FileText,
  Workflow,
  Code2,
  Plug,
  KeyRound,
  Target,
  Kanban,
  Landmark,
  Settings2,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/i18n-context";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(app)/actions";

const NAV_GROUPS: Array<{
  title: string;
  items: Array<{ href: string; navKey: string; label: string; icon: LucideIcon }>;
}> = [
  {
    title: "AI FIRST",
    items: [
      { href: "/chat", navKey: "nav.chatOps", label: "Speak with Brain OS", icon: Sparkles },
      { href: "/models", navKey: "nav.models", label: "Model Intelligence", icon: BarChart3 },
      { href: "/workflows", navKey: "nav.workflows", label: "Workflow Factory", icon: Workflow },
      { href: "/mindmap", navKey: "nav.mindmap", label: "Operating Mindmap", icon: Network },
    ],
  },
  {
    title: "GOALS",
    items: [
      { href: "/goals", navKey: "nav.goals", label: "Goals", icon: Target },
      { href: "/board", navKey: "nav.board", label: "Board", icon: Kanban },
    ],
  },
  {
    title: "CEO CONTROL",
    items: [
      { href: "/dashboard", navKey: "nav.dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tasks", navKey: "nav.tasks", label: "Tasks", icon: ListChecks },
      { href: "/approvals", navKey: "nav.approvals", label: "Approvals", icon: ShieldCheck },
    ],
  },
  {
    title: "REVENUE OPS",
    items: [
      { href: "/sales", navKey: "nav.sales", label: "Sales OS", icon: TrendingUp },
      { href: "/proposals", navKey: "nav.proposals", label: "Proposal Factory", icon: FileSignature },
      { href: "/inventory", navKey: "nav.inventory", label: "Product + Inventory", icon: Boxes },
      { href: "/documents", navKey: "nav.documents", label: "Documents + Knowledge", icon: FileText },
      { href: "/integrations", navKey: "nav.integrations", label: "Slack + Drive", icon: Plug },
    ],
  },
  {
    title: "FACTORIES",
    items: [
      { href: "/products", navKey: "nav.products", label: "Product Factory", icon: Package },
      { href: "/software", navKey: "nav.software", label: "Software Factory", icon: Code2 },
    ],
  },
  {
    title: "ADMIN DATA",
    items: [
      { href: "/access", navKey: "nav.access", label: "User Access", icon: KeyRound },
      { href: "/settings", navKey: "nav.settings", label: "Settings", icon: Settings2 },
      { href: "/companies", navKey: "nav.companies", label: "Companies", icon: Building2 },
      { href: "/departments", navKey: "nav.departments", label: "Departments", icon: Landmark },
      { href: "/people", navKey: "nav.people", label: "People", icon: Users },
      { href: "/projects", navKey: "nav.projects", label: "Projects", icon: FolderKanban },
      { href: "/kpi", navKey: "nav.kpi", label: "KPI + Salary", icon: Gauge },
      { href: "/memory", navKey: "nav.memory", label: "Memory", icon: BrainCircuit },
    ],
  },
];

export function AppSidebar({
  profile,
}: {
  profile: { full_name: string; role: string } | null;
}) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useT();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <div className="mb-4 flex items-center gap-3 border-b border-sidebar-border pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground">
          Σ
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight">Brain OS</div>
          <div className="text-xs text-muted-foreground">Company Brain</div>
        </div>
      </div>

      {profile && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-sidebar-accent p-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {profile.full_name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{profile.full_name}</div>
            <div className="truncate text-xs capitalize text-muted-foreground">
              {profile.role.replace("_", " ")}
            </div>
          </div>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-4 overflow-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground/80">
              {t(`navGroup.${group.title}`, group.title)}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                    <span>{t(item.navKey, item.label)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-2 border-t border-sidebar-border pt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("shell.language", "Language")}:</span>
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
          <Button type="submit" variant="outline" size="sm" className="w-full gap-1.5">
            <LogOut className="h-3.5 w-3.5" />
            {t("shell.signOut", "Sign out")}
          </Button>
        </form>
      </div>
    </aside>
  );
}
