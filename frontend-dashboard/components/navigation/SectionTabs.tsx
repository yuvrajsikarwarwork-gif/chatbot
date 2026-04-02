import Link from "next/link";
import { HelpCircle } from "lucide-react";

type TabItem = {
  label: string;
  href: string;
  hint?: string;
};

type SectionTabsProps = {
  items: TabItem[];
  currentPath: string;
  className?: string;
};

export default function SectionTabs({ items, currentPath, className = "" }: SectionTabsProps) {
  const hintByLabel: Record<string, string> = {
    Overview: "Manage high-level details like name, description, and active dates.",
    Channels: "Connect WhatsApp or other platform accounts to this campaign.",
    Entries: "Define how users enter this campaign (e.g., keywords or API triggers).",
    Audience: "Manage the contact lists and segments targeted by this campaign.",
    Automation: "Set up rules, bot flows, and automated responses.",
    Launch: "Review settings and officially start or pause the campaign.",
    Activity: "Monitor real-time metrics, delivery, and user engagement.",
  };

  return (
    <nav className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item) => {
        const normalizedCurrentPath = currentPath.split("?")[0];
        const normalizedItemHref = item.href.split("?")[0];
        const isActive = normalizedCurrentPath === normalizedItemHref;
        const hint = item.hint || hintByLabel[item.label] || "";
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition duration-300 ${
              isActive
                ? "border-primary bg-primary text-white shadow-sm"
                : "border-border-main bg-canvas text-text-main hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
            }`}
          >
            <span>{item.label}</span>
            {hint ? (
              <span className="relative inline-flex">
                <HelpCircle size={12} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-[100] mb-2 w-52 -translate-x-1/2 rounded-xl border border-border-main bg-surface px-3 py-2 text-[10px] font-semibold leading-relaxed tracking-wide text-text-main opacity-0 shadow-xl transition-all duration-200 group-hover:-translate-y-1 group-hover:opacity-100">
                  {hint}
                </span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
