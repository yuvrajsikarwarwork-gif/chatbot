import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type BackTarget = {
  href: string;
  label: string;
};

type GlobalBackStripProps = {
  className?: string;
  labelOverride?: ReactNode;
};

function titleize(value: string) {
  return value
    .split(/[/-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getBackTarget(pathname: string, query: Record<string, any>): BackTarget | null {
  const campaignId = String(query.campaignId || "").trim();
  const projectId = String(query.projectId || "").trim();
  const workspaceId = String(query.workspaceId || "").trim();
  const source = String(query.from || "").trim();
  const returnTo = String(query.returnTo || "").trim();
  const returnLabel = String(query.returnLabel || "").trim();

  if (returnTo) {
    return {
      href: returnTo,
      label: returnLabel || "Back",
    };
  }

  switch (pathname) {
    case "/":
    case "/dashboard":
      return null;
    case "/campaigns":
    case "/projects":
    case "/templates":
    case "/bots":
    case "/flows":
    case "/leads":
    case "/integrations":
    case "/analytics":
    case "/conversations":
    case "/inbox":
    case "/settings":
    case "/users":
    case "/users-access":
    case "/agents":
    case "/logs":
    case "/permissions":
    case "/plans":
    case "/platform-accounts":
    case "/system-settings":
    case "/tickets":
    case "/audit":
    case "/billing":
    case "/support":
    case "/workspaces":
      return { href: "/dashboard", label: "Back to dashboard" };
    case "/campaigns/new":
      return { href: "/campaigns", label: "Back to campaigns" };
    case "/campaigns/[campaignId]":
      return { href: "/campaigns", label: "Back to campaigns" };
    case "/campaigns/[campaignId]/channels":
      return { href: campaignId ? `/campaigns/${campaignId}` : "/campaigns", label: "Back to campaign overview" };
    case "/campaigns/[campaignId]/entries":
      return { href: campaignId ? `/campaigns/${campaignId}/channels` : "/campaigns", label: "Back to channels" };
    case "/campaigns/[campaignId]/audience":
      return { href: campaignId ? `/campaigns/${campaignId}/entries` : "/campaigns", label: "Back to entry points" };
    case "/campaigns/[campaignId]/launch":
      return { href: campaignId ? `/campaigns/${campaignId}/audience` : "/campaigns", label: "Back to audience" };
    case "/campaigns/[campaignId]/activity":
      return { href: campaignId ? `/campaigns/${campaignId}/launch` : "/campaigns", label: "Back to launch" };
    case "/templates/new":
    case "/templates/[id]":
    case "/templates/[id]/edit":
      return { href: "/templates", label: "Back to templates" };
    case "/projects/[projectId]":
      return { href: "/projects", label: "Back to projects" };
    case "/projects/[projectId]/settings":
      return source === "project"
        ? { href: projectId ? `/projects/${projectId}` : "/projects", label: "Back to project overview" }
        : { href: "/settings", label: "Back to settings" };
    case "/projects/[projectId]/members":
      return source === "settings"
        ? { href: "/settings", label: "Back to settings" }
        : { href: projectId ? `/projects/${projectId}` : "/projects", label: "Back to project overview" };
    case "/workspaces/[workspaceId]":
      return { href: "/workspaces", label: "Back to workspaces" };
    case "/workspaces/[workspaceId]/support-access":
    case "/workspaces/[workspaceId]/billing":
      return { href: "/settings", label: "Back to settings" };
    case "/workspaces/[workspaceId]/members-access":
      return { href: workspaceId ? `/workspaces/${workspaceId}` : "/workspaces", label: "Back to workspace overview" };
    case "/support/new":
    case "/support/access":
    case "/support/tickets":
      return { href: "/support/tickets", label: "Back to support" };
    case "/users-access/roles":
    case "/users-access/platform-users":
      return { href: "/users-access/roles", label: "Back to access control" };
    case "/users-access/project-access":
    case "/users-access/members":
    case "/users-access/overrides":
    case "/users-access/agent-scope":
      return { href: "/users-access/members", label: "Back to access control" };
    default: {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length <= 1) {
        return { href: "/dashboard", label: "Back to dashboard" };
      }

      const parentParts = parts.slice(0, -1).filter((part) => !part.startsWith("["));
      const href = parentParts.length > 0 ? `/${parentParts.join("/")}` : "/dashboard";
      const lastParent = parentParts[parentParts.length - 1] || "dashboard";
      return { href, label: `Back to ${titleize(lastParent)}` };
    }
  }
}

export default function GlobalBackStrip({ className = "", labelOverride }: GlobalBackStripProps) {
  const router = useRouter();
  const target = getBackTarget(router.pathname, router.query);

  if (!target) {
    return null;
  }

  return (
    <div className={className}>
      <Link
        href={target.href}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text)] shadow-[var(--shadow-soft)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
      >
        <ArrowLeft size={14} />
        {labelOverride || target.label}
      </Link>
    </div>
  );
}
