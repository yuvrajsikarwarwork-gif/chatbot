import Link from "next/link";

import { useVisibility } from "../../hooks/useVisibility";

type ActiveSlug = "" | "billing" | "overrides" | "members-access" | "support-access";

export default function WorkspaceConsoleTabs({
  workspaceId,
  activeSlug,
}: {
  workspaceId: string;
  activeSlug: ActiveSlug;
}) {
  const {
    canManagePermissions,
    canManageUsers,
    canViewBilling,
    isPlatformOperator,
    isWorkspaceAdmin,
    supportAccess,
  } = useVisibility();
  const canOpenWorkspaceInterior = !isPlatformOperator || supportAccess;

  const tabs = [
    { label: "Overview", slug: "" as const, visible: true },
    {
      label: "Billing & Wallet",
      slug: "billing" as const,
      visible: canOpenWorkspaceInterior && (canViewBilling || isWorkspaceAdmin),
    },
    {
      label: "Limits & Overrides",
      slug: "overrides" as const,
      visible: canOpenWorkspaceInterior && (canViewBilling || isWorkspaceAdmin),
    },
    {
      label: "Team & Members",
      slug: "members-access" as const,
      visible: canOpenWorkspaceInterior && (canManageUsers || canManagePermissions),
    },
    {
      label: "Support Access",
      slug: "support-access" as const,
      visible: canOpenWorkspaceInterior && isWorkspaceAdmin,
    },
  ].filter((tab) => tab.visible || tab.slug === activeSlug);

  return (
    <section className="rounded-[1.25rem] border border-border-main bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const href = tab.slug
            ? `/workspaces/${workspaceId}/${tab.slug}`
            : `/workspaces/${workspaceId}`;
          const active = tab.slug === activeSlug;

          return (
            <Link
            key={tab.label}
            href={href}
            className={`rounded-[1rem] px-4 py-2 text-sm font-semibold transition duration-200 ${
              active
                  ? "border border-emerald-500 bg-emerald-500 text-white shadow-[0_12px_30px_rgba(16,185,129,0.25)] ring-1 ring-emerald-300"
                  : "border border-border-main bg-canvas text-text-main hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            }`}
          >
            {tab.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
