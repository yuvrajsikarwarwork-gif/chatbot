import { useEffect, type ReactNode } from "react";
import { ChevronRight, Search, Shield } from "lucide-react";

interface ControlTowerShellProps {
  children: ReactNode;
  orgCount?: number;
  title?: string;
  breadcrumb?: ReactNode;
  searchSlot?: ReactNode;
  headerActions?: ReactNode;
  utilitySlot?: ReactNode;
  safetyBanner?: ReactNode;
  onSearchActivate?: () => void;
}

export default function ControlTowerShell({
  children,
  orgCount = 0,
  title = "Control Tower",
  breadcrumb,
  searchSlot,
  headerActions,
  utilitySlot,
  safetyBanner,
  onSearchActivate,
}: ControlTowerShellProps) {
  useEffect(() => {
    if (!onSearchActivate) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isShortcut = (event.metaKey || event.ctrlKey) && key === "k";
      if (!isShortcut) {
        return;
      }

      event.preventDefault();
      onSearchActivate();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSearchActivate]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg-main font-sans text-text-main">
      {safetyBanner ? (
        <div className="sticky top-0 z-[70] w-full">{safetyBanner}</div>
      ) : null}

      <header className="sticky top-0 z-50 h-[var(--control-header-h)] border-b border-border-main bg-bg-card shadow-card backdrop-blur">
        <div className="mx-auto flex h-full max-w-shell items-center gap-4 px-outer">
          <div className="min-w-0 flex items-center gap-3">
            <div className="flex flex-col">
              <div className="text-[10px] font-black uppercase tracking-[0.32em] text-text-muted">
                {title}
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-text-muted">
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-text-soft">
                  {breadcrumb || "Operational Console"}
                </span>
              </div>
            </div>
            <span className="rounded-xs border border-border-main bg-bg-muted px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-text-main">
              {orgCount} Orgs
            </span>
          </div>

          <div className="flex flex-1 justify-center px-2">
            {searchSlot ?? (
              <button
                type="button"
                onClick={onSearchActivate}
                className="flex w-full max-w-[600px] items-center gap-3 rounded-full border border-border-main bg-bg-muted px-4 py-2 text-left text-[13px] text-text-muted transition hover:border-primary/30 hover:bg-primary-fade hover:text-text-main"
              >
                <Search size={16} className="shrink-0 text-text-soft" />
                <span className="min-w-0 flex-1 truncate">Search organizations, workspaces, or keys...</span>
                <kbd className="rounded-xs border border-border-main bg-bg-card px-1.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-text-soft">
                  Cmd+K
                </kbd>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {headerActions}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-bg-card px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
            >
              <Shield size={14} />
              Audit Trail
            </button>
          </div>
        </div>
      </header>

      <div className="sticky top-[var(--control-header-h)] z-40 h-[var(--control-utility-h)] border-b border-border-main bg-bg-main backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-shell items-center justify-between gap-4 px-outer">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-text-muted">
            <span>Admin</span>
            <ChevronRight size={12} />
            <span className="text-text-secondary">Control Tower</span>
          </div>
          <div className="flex items-center gap-3">{utilitySlot}</div>
        </div>
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-shell flex-1 flex-col px-outer py-8 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
