import Link from "next/link";
import { useVisibility } from "../../hooks/useVisibility";

const TABS = [
  { label: "Members", href: "/users-access/members" },
  { label: "Roles", href: "/users-access/roles", platformOnly: true },
  { label: "Overrides", href: "/users-access/overrides" },
  { label: "Project Access", href: "/users-access/project-access" },
  { label: "Agent Scope", href: "/users-access/agent-scope" },
  { label: "Platform Users", href: "/users-access/platform-users", platformOnly: true },
];

export default function UsersAccessTabs({ activeHref }: { activeHref: string }) {
  const { isPlatformOperator, supportAccess } = useVisibility();
  const visibleTabs = TABS.filter((tab) => {
    if (isPlatformOperator && !supportAccess) {
      return tab.href === "/users-access/roles" || tab.href === "/users-access/platform-users";
    }

    return !tab.platformOnly || isPlatformOperator;
  });

  return (
    <section className="rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((tab) => {
          const isActive = activeHref === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] transition duration-300 ${
                isActive
                  ? "border-[rgba(129,140,248,0.38)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] !text-white shadow-[0_16px_28px_var(--accent-glow)]"
                  : "border-[var(--glass-border)] bg-[var(--glass-surface-strong)] text-[var(--text)] hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
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
