"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
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
  ClipboardList,
  Bot,
  BookOpenCheck,
  Coins,
  Search,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/i18n-context";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(app)/actions";

const NAV_GROUPS: Array<{
  title: string;
  defaultOpen?: boolean;
  items: Array<{ href: string; navKey: string; label: string; icon: LucideIcon }>;
}> = [
  {
    title: "BRAIN",
    defaultOpen: true,
    items: [
      { href: "/chat", navKey: "nav.chatOps", label: "Brain Chat", icon: Sparkles },
      { href: "/mindmap", navKey: "nav.mindmap", label: "Strategic Control Map", icon: Network },
      { href: "/goals", navKey: "nav.goals", label: "Goals", icon: Target },
      { href: "/board", navKey: "nav.board", label: "Board", icon: Kanban },
    ],
  },
  {
    title: "WORK",
    defaultOpen: true,
    items: [
      { href: "/dashboard", navKey: "nav.dashboard", label: "CEO Dashboard", icon: LayoutDashboard },
      { href: "/tasks", navKey: "nav.tasks", label: "Tasks", icon: ListChecks },
      { href: "/approvals", navKey: "nav.approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/workflows", navKey: "nav.workflows", label: "Workflow Factory", icon: Workflow },
    ],
  },
  {
    title: "REVENUE",
    defaultOpen: true,
    items: [
      { href: "/sales", navKey: "nav.sales", label: "Sales OS", icon: TrendingUp },
      { href: "/proposals", navKey: "nav.proposals", label: "Proposal Factory", icon: FileSignature },
      { href: "/inventory", navKey: "nav.inventory", label: "Product + Inventory", icon: Boxes },
      { href: "/billing", navKey: "nav.billing", label: "Billing & AI Economics", icon: Coins },
    ],
  },
  {
    title: "BUILD",
    defaultOpen: true,
    items: [
      { href: "/products", navKey: "nav.products", label: "Product Factory", icon: Package },
      { href: "/software", navKey: "nav.software", label: "Software Factory", icon: Code2 },
    ],
  },
  {
    title: "PEOPLE",
    defaultOpen: true,
    items: [
      { href: "/people", navKey: "nav.people", label: "People", icon: Users },
      { href: "/kpi", navKey: "nav.kpi", label: "KPI + Bonus", icon: Gauge },
      { href: "/people/cases", navKey: "nav.performanceCases", label: "Leadership Cases", icon: ClipboardList },
      { href: "/assistants", navKey: "nav.assistants", label: "Employee AI Assistants", icon: Bot },
      { href: "/role-knowledge", navKey: "nav.roleKnowledge", label: "Role Knowledge", icon: BookOpenCheck },
    ],
  },
  {
    title: "KNOWLEDGE",
    items: [
      { href: "/documents", navKey: "nav.documents", label: "Artifacts & Documents", icon: FileText },
      { href: "/memory", navKey: "nav.memory", label: "Memory", icon: BrainCircuit },
    ],
  },
  {
    title: "ADMIN",
    items: [
      { href: "/workspaces", navKey: "nav.workspaces", label: "Workspaces & Organizations", icon: Building2 },
      { href: "/companies", navKey: "nav.companies", label: "Companies", icon: Building2 },
      { href: "/departments", navKey: "nav.departments", label: "Departments", icon: Landmark },
      { href: "/projects", navKey: "nav.projects", label: "Projects", icon: FolderKanban },
      { href: "/access", navKey: "nav.access", label: "User Access", icon: KeyRound },
      { href: "/models", navKey: "nav.models", label: "Model Intelligence", icon: BarChart3 },
      { href: "/integrations", navKey: "nav.integrations", label: "Integrations", icon: Plug },
      { href: "/settings", navKey: "nav.settings", label: "Settings", icon: Settings2 },
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
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => `${item.label} ${group.title}`.toLowerCase().includes(q)),
      }))
      .filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <div className="mb-3 flex items-center gap-3 border-b border-sidebar-border pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground">Σ</div>
        <div>
          <div className="text-[15px] font-semibold leading-tight">Brain OS</div>
          <div className="text-xs text-muted-foreground">Founder operating system</div>
        </div>
      </div>

      {profile && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-sidebar-accent p-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{profile.full_name.slice(0, 1)}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{profile.full_name}</div>
            <div className="truncate text-xs capitalize text-muted-foreground">{profile.role.replace("_", " ")}</div>
          </div>
        </div>
      )}

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find anything…"
          className="h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/60 pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/40"
        />
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-auto pr-1">
        {groups.map((group) => {
          const containsActive = group.items.some((item) => pathname.startsWith(item.href));
          return (
            <details key={group.title} className="group/nav" open={Boolean(query) || group.defaultOpen || containsActive}>
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground/80 hover:bg-sidebar-accent">
                <span>{t(`navGroup.${group.title}`, group.title)}</span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/nav:rotate-180" />
              </summary>
              <div className="mb-1 flex flex-col gap-0.5 pt-0.5">
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
                      <span className="truncate">{t(item.navKey, item.label)}</span>
                    </Link>
                  );
                })}
              </div>
            </details>
          );
        })}
        {groups.length === 0 && <div className="px-3 py-4 text-xs text-muted-foreground">No menu matches “{query}”.</div>}
      </nav>

      <div className="mt-3 flex flex-col gap-2 border-t border-sidebar-border pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("shell.language", "Language")}:</span>
          <Button size="sm" variant={locale === "en" ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => setLocale("en")}>EN</Button>
          <Button size="sm" variant={locale === "mn" ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => setLocale("mn")}>MN</Button>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm" className="w-full gap-1.5">
            <LogOut className="h-3.5 w-3.5" />{t("shell.signOut", "Sign out")}
          </Button>
        </form>
      </div>
    </aside>
  );
}
