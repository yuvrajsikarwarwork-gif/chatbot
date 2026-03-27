import Link from "next/link";
import { useRouter } from "next/router";
import { ComponentType, useEffect, useRef } from "react";
import type { AppSection } from "../../hooks/useVisibility";
import { useVisibility } from "../../hooks/useVisibility";
import { useAuthStore } from "../../store/authStore";

const SIDEBAR_SCROLL_KEY = "dashboard-sidebar-scroll-top";

const Icons = {
  Dashboard: () => <div className="h-4 w-4 rounded-sm border border-current" />,
  Bots: () => <div className="h-4 w-4 rounded-full border border-current" />,
  Flow: () => (
    <div className="flex h-4 w-4 items-end gap-[3px]">
      <div className="h-4 w-[3px] rounded-full bg-current" />
      <div className="h-2 w-[3px] rounded-full bg-current" />
      <div className="h-3 w-[3px] rounded-full bg-current" />
    </div>
  ),
  Leads: () => <div className="h-4 w-4 rounded-md border border-current" />,
  Campaigns: () => (
    <div className="relative h-4 w-4 rounded-full border border-current">
      <div className="absolute inset-x-[2px] top-1/2 h-px -translate-y-1/2 bg-current" />
    </div>
  ),
  Templates: () => (
    <div className="relative h-4 w-4 rounded-md border border-current">
      <div className="absolute left-1 top-1 h-[2px] w-2 bg-current" />
      <div className="absolute left-1 top-2 h-[2px] w-2 bg-current" />
      <div className="absolute left-1 top-3 h-[2px] w-1.5 bg-current" />
    </div>
  ),
  Projects: () => (
    <div className="grid h-4 w-4 grid-cols-2 gap-[2px]">
      <div className="rounded-sm border border-current" />
      <div className="rounded-sm border border-current" />
      <div className="rounded-sm border border-current" />
      <div className="rounded-sm border border-current" />
    </div>
  ),
  Platforms: () => (
    <div className="relative h-4 w-4 rounded-md border border-current">
      <div className="absolute inset-[3px] rounded-sm border border-current" />
    </div>
  ),
  Chat: () => (
    <div className="relative h-3.5 w-4 rounded-md border border-current">
      <div className="absolute -bottom-1 left-1 h-1.5 w-1.5 rotate-45 border-b border-r border-current bg-transparent" />
    </div>
  ),
  Workspaces: () => (
    <div className="relative h-4 w-4 rounded-sm border border-current">
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-current" />
    </div>
  ),
  Settings: () => <div className="h-4 w-4 rounded-full border border-dashed border-current" />,
  Users: () => (
    <div className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-bold">
      U
    </div>
  ),
  Audit: () => (
    <div className="relative h-4 w-4 rounded-md border border-current">
      <div className="absolute left-1 top-1 h-2 w-2 rounded-sm border border-current" />
    </div>
  ),
  Permissions: () => (
    <div className="relative h-4 w-4 rounded-md border border-current">
      <div className="absolute inset-x-1 top-1 h-[2px] bg-current" />
      <div className="absolute left-1 top-2.5 h-[2px] w-2 bg-current" />
      <div className="absolute left-1 top-4 h-[2px] w-1.5 bg-current" />
    </div>
  ),
  Analytics: () => (
    <div className="relative h-4 w-4 rounded-md border border-current">
      <div className="absolute bottom-1 left-1 h-1.5 w-[2px] bg-current" />
      <div className="absolute bottom-1 left-2.5 h-2.5 w-[2px] bg-current" />
      <div className="absolute bottom-1 left-4 h-3 w-[2px] bg-current" />
    </div>
  ),
  Tickets: () => (
    <div className="relative h-4 w-4 rounded-md border border-current">
      <div className="absolute inset-x-1 top-1.5 h-[2px] bg-current" />
      <div className="absolute inset-x-1 top-3 h-[2px] bg-current" />
    </div>
  ),
};

type MenuItem = {
  label: string;
  path: string;
  Icon: ComponentType;
  section: AppSection;
};

function SidebarLink({
  item,
  isActive,
}: {
  item: MenuItem;
  isActive: boolean;
}) {
  const { label, path, Icon } = item;

  return (
    <Link
      href={path}
      className={`group relative my-1 flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 transition duration-300 ${
        isActive
          ? "bg-[var(--sidebar-active-bg)] text-white shadow-[0_14px_34px_rgba(79,70,229,0.22)]"
          : "text-[var(--sidebar-text)] hover:-translate-y-0.5 hover:bg-[var(--sidebar-hover)] hover:text-white"
      }`}
    >
      <span
        className={`absolute inset-y-2 left-0 w-1 rounded-full bg-gradient-to-b from-cyan-300 to-indigo-400 transition ${
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-70"
        }`}
      />
      <span
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition ${
          isActive
            ? "border-[rgba(165,180,252,0.24)] bg-[rgba(255,255,255,0.1)] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_14px_28px_rgba(59,130,246,0.16)]"
            : "border-transparent bg-transparent group-hover:border-[var(--sidebar-line)] group-hover:bg-[var(--sidebar-chip)]"
        }`}
      >
        <Icon />
      </span>
      <span className="truncate text-sm font-medium">{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const { canSeeNav, isPlatformOperator } = useVisibility();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const navRef = useRef<HTMLElement | null>(null);
  const workspaceBillingPath = activeWorkspace?.workspace_id
    ? `/workspaces/${activeWorkspace.workspace_id}/billing`
    : "/settings";
  const workspaceMenu = [
    { label: "Dashboard", path: "/", Icon: Icons.Dashboard, section: "dashboard" },
    { label: "Projects", path: "/projects", Icon: Icons.Projects, section: "projects" },
    { label: "Campaigns", path: "/campaigns", Icon: Icons.Campaigns, section: "campaigns" },
    { label: "Templates", path: "/templates", Icon: Icons.Templates, section: "templates" },
    { label: "Bots", path: "/bots", Icon: Icons.Bots, section: "bots" },
    { label: "Flows", path: "/flows", Icon: Icons.Flow, section: "flows" },
    { label: "Integrations", path: "/integrations", Icon: Icons.Platforms, section: "integrations" },
    { label: "Inbox", path: "/inbox", Icon: Icons.Chat, section: "inbox" },
    { label: "Leads", path: "/leads", Icon: Icons.Leads, section: "leads" },
    { label: "Analytics", path: "/analytics", Icon: Icons.Analytics, section: "analytics" },
    { label: "Users & Permissions", path: "/users-access", Icon: Icons.Permissions, section: "users_access" },
    { label: "Settings", path: "/settings", Icon: Icons.Settings, section: "settings" },
    { label: "Support", path: "/support", Icon: Icons.Tickets, section: "support" },
    { label: "Audit", path: "/audit", Icon: Icons.Audit, section: "audit" },
    { label: "Billing", path: workspaceBillingPath, Icon: Icons.Workspaces, section: "billing" },
  ] as MenuItem[];
  const platformMenu = [
    { label: "Workspaces", path: "/workspaces", Icon: Icons.Workspaces, section: "workspaces" },
    { label: "Permissions", path: "/users-access/roles", Icon: Icons.Permissions, section: "permissions" },
    { label: "Tickets", path: "/support/tickets", Icon: Icons.Tickets, section: "tickets" },
    { label: "Plans", path: "/plans", Icon: Icons.Workspaces, section: "plans" },
    { label: "Logs", path: "/logs", Icon: Icons.Audit, section: "logs" },
    { label: "System Settings", path: "/system-settings", Icon: Icons.Settings, section: "system_settings" },
  ] as MenuItem[];
  const menu = (isPlatformOperator ? platformMenu : workspaceMenu).filter((item) =>
    canSeeNav(item.section)
  );

  useEffect(() => {
    if (!navRef.current || typeof window === "undefined") return;

    const savedScrollTop = window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (!savedScrollTop) return;

    navRef.current.scrollTop = Number(savedScrollTop) || 0;
  }, []);

  useEffect(() => {
    if (!navRef.current || typeof window === "undefined") return;

    const element = navRef.current;
    const handleScroll = () => {
      window.sessionStorage.setItem(
        SIDEBAR_SCROLL_KEY,
        String(element.scrollTop)
      );
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => element.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <aside className="m-3 flex h-[calc(100vh-1.5rem)] w-[16rem] flex-col rounded-[2rem] border border-[var(--sidebar-line)] bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] shadow-[0_24px_80px_rgba(2,8,23,0.34)] backdrop-blur-2xl">
      <div className="border-b border-[var(--sidebar-line)] px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.16)] bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(224,231,255,0.86))] text-sm font-bold text-[var(--sidebar-bg)] shadow-[0_20px_50px_rgba(79,70,229,0.24)]">
            B
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sidebar-muted)]">
              Bot Platform
            </div>
            <div className="truncate text-base font-semibold text-white">BOT.OS</div>
          </div>
        </div>
      </div>

      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--sidebar-muted)]">
          Navigation
        </div>

        {menu.map((item) => {
          const isActive =
            router.pathname === item.path ||
            (item.path !== "/" && router.pathname.startsWith(`${item.path}/`)) ||
            (item.section === "billing" &&
              (router.pathname === "/billing" || router.pathname === "/workspaces/[workspaceId]/billing")) ||
            (item.section === "support" &&
              (router.pathname === "/support" || router.pathname.startsWith("/support/")));
          return <SidebarLink key={item.path} item={item} isActive={isActive} />;
        })}
      </nav>

      <div className="border-t border-[var(--sidebar-line)] px-4 py-4">
        <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] px-4 py-3 text-[11px] font-medium text-[var(--sidebar-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {isPlatformOperator
            ? "Platform operator tools stay isolated from workspace data."
            : "Navigation is tailored to your access."}
        </div>
      </div>
    </aside>
  );
}
