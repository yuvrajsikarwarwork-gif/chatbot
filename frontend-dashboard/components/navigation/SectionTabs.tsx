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
                ? "border-primary bg-primary text-white shadow-sm"
                : "border-border-main bg-canvas text-text-main hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
