"use client";

import { useEffect, useState } from "react";
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
  Wallet,
  BarChart3,
  Settings2,
  HelpCircle,
  Ruler,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  CreditCard,
  Factory,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/i18n-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { signOut } from "@/app/(app)/actions";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import type { OrganizationContext } from "@/lib/data/organizations-types";

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
      { href: "/finance", navKey: "nav.finance", label: "Finance", icon: Wallet },
      { href: "/billing", navKey: "nav.billing", label: "Billing", icon: CreditCard },
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
      { href: "/software", navKey: "nav.software", label: "Software Specs", icon: Code2 },
      {
        href: "/software-factory",
        navKey: "nav.softwareFactory",
        label: "Agent Control Center",
        icon: Factory,
      },
      { href: "/engineering", navKey: "nav.engineering", label: "Engineering Factory", icon: Ruler },
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
      { href: "/ai-assistants", navKey: "nav.aiAssistants", label: "AI Assistants", icon: Bot },
      { href: "/memory", navKey: "nav.memory", label: "Memory", icon: BrainCircuit },
    ],
  },
];

const COLLAPSE_STORAGE_KEY = "brainos:sidebar-collapsed";

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-auto">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          {!collapsed && (
            <div className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground/80">
              {t(`navGroup.${group.title}`, group.title)}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? t(item.navKey, item.label) : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    collapsed ? "justify-center" : ""
                  } ${
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {!collapsed && <span>{t(item.navKey, item.label)}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppSidebar({
  profile,
  organizations,
}: {
  profile: { full_name: string; role: string } | null;
  organizations: OrganizationContext;
}) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Desktop collapse state is a per-device display preference, not app data —
  // localStorage is the right home for it, not a DB column. Must start false and flip
  // post-mount via effect, not a lazy useState initializer, to avoid a server/client
  // hydration mismatch (server has no localStorage) — same pattern as chat-client.tsx's
  // speechSupported.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    if (localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1") setCollapsed(true);
  }, []);

  // A route change means a nav link was just followed — close the mobile drawer so it
  // doesn't stay covering the page just navigated to. Derive-during-render, not
  // useEffect+setState, per this project's react-hooks/set-state-in-effect lint rule
  // (same pattern as chat-client.tsx's syncedChannelId).
  const [syncedPathname, setSyncedPathname] = useState(pathname);
  if (pathname !== syncedPathname) {
    setSyncedPathname(pathname);
    setMobileOpen(false);
  }

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const brandMark = (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground">
      Σ
    </div>
  );

  const orgSwitcherBlock = <OrganizationSwitcher context={organizations} />;

  const profileBlock = profile && (
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
  );

  const footer = (
    <div className="mt-4 flex flex-col gap-2 border-t border-sidebar-border pt-4">
      <Link
        href="/help"
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
          pathname.startsWith("/help")
            ? "bg-sidebar-accent font-medium text-sidebar-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        }`}
      >
        <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span>{t("nav.help", "Help & FAQ")}</span>
      </Link>
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
  );

  return (
    <>
      {/* Mobile top bar: the only thing rendered on small screens besides the drawer. */}
      <div className="flex h-14 w-full shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          Σ
        </div>
        <div className="text-sm font-semibold">Brain OS</div>
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex w-72 max-w-[85vw] flex-col gap-0 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only p-0">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="mb-4 flex items-center gap-3 border-b border-sidebar-border pb-4">
            {brandMark}
            <div>
              <div className="text-[15px] font-semibold leading-tight">Brain OS</div>
              <div className="text-xs text-muted-foreground">Company Brain</div>
            </div>
          </div>
          {orgSwitcherBlock}
          {profileBlock}
          <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          {footer}
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside
        className={`hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground transition-[width] duration-150 md:flex ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <div
          className={`mb-4 flex items-center gap-3 border-b border-sidebar-border pb-4 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {brandMark}
          {!collapsed && (
            <div>
              <div className="text-[15px] font-semibold leading-tight">Brain OS</div>
              <div className="text-xs text-muted-foreground">Company Brain</div>
            </div>
          )}
        </div>

        {!collapsed && orgSwitcherBlock}
        {!collapsed && profileBlock}

        <SidebarNav collapsed={collapsed} />

        <div className="mt-2 border-t border-sidebar-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            className={`w-full gap-1.5 text-muted-foreground ${collapsed ? "justify-center px-0" : "justify-start"}`}
            onClick={toggleCollapsed}
            title={collapsed ? t("shell.expand", "Expand sidebar") : t("shell.collapse", "Collapse sidebar")}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" /> {t("shell.collapse", "Collapse")}
              </>
            )}
          </Button>
        </div>

        {!collapsed && footer}
        {collapsed && (
          <form action={signOut} className="mt-2">
            <Button type="submit" variant="outline" size="icon-sm" className="w-full" title={t("shell.signOut", "Sign out")}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </form>
        )}
      </aside>
    </>
  );
}
