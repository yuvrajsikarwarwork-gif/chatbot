import Link from "next/link";

type TabItem = {
  label: string;
  href: string;
};

type SectionTabsProps = {
  items: TabItem[];
  currentPath: string;
  className?: string;
};

export default function SectionTabs({ items, currentPath, className = "" }: SectionTabsProps) {
  return (
    <nav className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item) => {
        const normalizedCurrentPath = currentPath.split("?")[0];
        const normalizedItemHref = item.href.split("?")[0];
        const isActive = normalizedCurrentPath === normalizedItemHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition duration-300 ${
              isActive
                ? "border-[rgba(129,140,248,0.38)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] !text-white shadow-[0_16px_28px_var(--accent-glow)]"
                : "border-[var(--glass-border)] bg-[var(--glass-surface)] text-[var(--muted)] hover:-translate-y-0.5 hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
