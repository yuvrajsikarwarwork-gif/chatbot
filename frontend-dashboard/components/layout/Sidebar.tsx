import Link from "next/link";
import { useRouter } from "next/router";
import { ComponentType, useEffect, useRef } from "react";
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  FolderKanban,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  MessagesSquare,
  Megaphone,
  PlugZap,
  ReceiptText,
  ScrollText,
  Search,
  Settings2,
  SlidersHorizontal,
  UserCircle2,
  Workflow,
} from "lucide-react";
import type { AppSection } from "../../hooks/useVisibility";
import { useVisibility } from "../../hooks/useVisibility";
import { useAuthStore } from "../../store/authStore";

const SIDEBAR_SCROLL_KEY = "dashboard-sidebar-scroll-top";

const Icons = {
  Dashboard: LayoutDashboard,
  Projects: FolderKanban,
  Campaigns: Megaphone,
  Templates: ScrollText,
  Bots: Bot,
  Flow: Workflow,
  Platforms: PlugZap,
  Chat: MessagesSquare,
  Workspaces: BriefcaseBusiness,
  Settings: Settings2,
  Users: UserCircle2,
  Audit: History,
  Permissions: KeyRound,
  Analytics: BarChart3,
  Tickets: ClipboardList,
  Leads: Search,
  LeadForms: FileText,
  Support: LifeBuoy,
  Billing: Landmark,
  Plans: ReceiptText,
  SystemSettings: SlidersHorizontal,
};

type MenuItem = {
  label: string;
  path: string;
  Icon: ComponentType;
  section: AppSection;
  visible?: boolean;
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
      scroll={false}
      className={`group my-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? "border border-primary/20 bg-primary-fade font-medium text-primary"
          : "text-text-sidebar-muted hover:bg-surface/5 hover:text-text-sidebar"
      }`}
    >
      <Icon />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const {
    canSeeNav,
    isPlatformOperator,
    workspaceRole,
    isWorkspaceAdmin,
    canViewBilling,
    activeProjectRole,
    supportAccess,
  } = useVisibility();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const navRef = useRef<HTMLElement | null>(null);
  const workspaceBillingPath = activeWorkspace?.workspace_id
    ? `/workspaces/${activeWorkspace.workspace_id}/billing`
    : "/settings";
  const isAgent = workspaceRole === "agent";
  const isEditor = workspaceRole === "editor";
  const canOpenLeadForms =
    isWorkspaceAdmin ||
    isEditor ||
    activeProjectRole === "project_admin" ||
    activeProjectRole === "editor";
  const workspaceMenu = [
    { label: "Dashboard", path: "/", Icon: Icons.Dashboard, section: "dashboard", visible: true },
    { label: "Projects", path: "/projects", Icon: Icons.Projects, section: "projects", visible: !isAgent },
    { label: "Campaigns", path: "/campaigns", Icon: Icons.Campaigns, section: "campaigns", visible: !isAgent },
    { label: "Templates", path: "/templates", Icon: Icons.Templates, section: "templates", visible: !isAgent },
    { label: "Bots", path: "/bots", Icon: Icons.Bots, section: "bots", visible: !isAgent },
    { label: "Flows", path: "/flows", Icon: Icons.Flow, section: "flows", visible: !isAgent },
    { label: "Inbox", path: "/inbox", Icon: Icons.Chat, section: "inbox", visible: true },
    { label: "Leads", path: "/leads", Icon: Icons.Leads, section: "leads", visible: true },
    { label: "Lead Forms", path: "/lead-forms", Icon: Icons.LeadForms, section: "leads", visible: canOpenLeadForms && !isAgent },
    { label: "Analytics", path: "/analytics", Icon: Icons.Analytics, section: "analytics", visible: !isAgent },
    { label: "Users & Permissions", path: "/users-access", Icon: Icons.Permissions, section: "users_access", visible: isWorkspaceAdmin },
    { label: "Workspace Settings", path: "/settings", Icon: Icons.Settings, section: "settings", visible: isWorkspaceAdmin },
    { label: "My Profile", path: "/settings", Icon: Icons.Users, section: "dashboard", visible: !isWorkspaceAdmin },
    { label: "Support", path: "/support", Icon: Icons.Tickets, section: "support", visible: isWorkspaceAdmin },
    { label: "Audit", path: "/audit", Icon: Icons.Audit, section: "audit", visible: isWorkspaceAdmin },
    { label: "Billing", path: workspaceBillingPath, Icon: Icons.Billing, section: "billing", visible: isPlatformOperator || canViewBilling || isWorkspaceAdmin },
  ] as MenuItem[];
  const platformMenu = [
    { label: "Workspaces", path: "/workspaces", Icon: Icons.Workspaces, section: "workspaces" },
    { label: "Permissions", path: "/users-access/roles", Icon: Icons.Permissions, section: "permissions" },
    { label: "Tickets", path: "/support/tickets", Icon: Icons.Tickets, section: "tickets" },
    { label: "Plans", path: "/plans", Icon: Icons.Plans, section: "plans" },
    { label: "Logs", path: "/logs", Icon: Icons.Audit, section: "logs" },
    { label: "System Settings", path: "/system-settings", Icon: Icons.SystemSettings, section: "system_settings" },
  ] as MenuItem[];
  const menu = (isPlatformOperator ? platformMenu : workspaceMenu).filter(
    (item) => item.visible !== false && canSeeNav(item.section)
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
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col overflow-y-auto bg-sidebar border-r border-border-sidebar">
      <div className="border-b border-border-sidebar px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-sidebar bg-surface/5 text-sm font-bold text-text-sidebar">
            B
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-widest text-text-sidebar-muted">
              Bot Platform
            </div>
            <div className="truncate text-base font-semibold text-text-sidebar">BOT.OS</div>
          </div>
        </div>
      </div>

      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between gap-3 px-3 pb-3 text-xs font-bold uppercase text-text-sidebar-muted">
          <span>{isPlatformOperator ? "Platform Admin" : "Workspace"}</span>
          {isPlatformOperator && supportAccess ? (
            <span className="rounded-full border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.12)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
              Support mode active
            </span>
          ) : null}
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

      <div className="border-t border-border-sidebar px-4 py-4">
        <div className="rounded-lg border border-border-sidebar bg-surface/5 px-4 py-3 text-xs font-medium text-white/90">
          {isPlatformOperator
            ? "Platform operator tools stay isolated from workspace data."
            : "Navigation is tailored to your access."}
        </div>
      </div>
    </aside>
  );
}

