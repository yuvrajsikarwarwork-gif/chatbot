import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";

export type CommandPaletteItem = {
  id: string;
  kind: string;
  title: string;
  description?: string;
  keywords?: string[];
};

type CommandPaletteProps = {
  open: boolean;
  items: CommandPaletteItem[];
  onSelect: (item: CommandPaletteItem) => void;
  onClose: () => void;
  placeholder?: string;
  title?: string;
};

export default function CommandPalette({
  open,
  items,
  onSelect,
  onClose,
  placeholder = "Search organizations, workspaces, or keys...",
  title = "Command Palette",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }

    return items.filter((item) => {
      const haystack = [
        item.title,
        item.description || "",
        item.kind,
        ...(item.keywords || []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [items, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveIndex(0);
    setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, Math.max(filteredItems.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const item = filteredItems[activeIndex];
        if (item) {
          onSelect(item);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, filteredItems, onClose, onSelect, open]);

  useEffect(() => {
    if (activeIndex > filteredItems.length - 1) {
      setActiveIndex(Math.max(filteredItems.length - 1, 0));
    }
  }, [activeIndex, filteredItems.length]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh]">
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 bg-bg-overlay backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-[101] w-full max-w-[640px] overflow-hidden rounded-[1.5rem] border border-border-main bg-bg-card shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-center gap-3 border-b border-border-main px-4 py-4">
          <Search size={16} className="shrink-0 text-text-soft" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-text-main outline-none placeholder:text-text-soft"
          />
          <span className="rounded-xs border border-border-main bg-canvas px-2 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-text-soft">
            {title}
          </span>
          <kbd className="rounded-xs border border-border-main bg-canvas px-1.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-text-soft">
            Esc
          </kbd>
        </div>

        <div className="max-h-[420px] overflow-y-auto py-2">
          <div className="px-4 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.24em] text-text-muted">
            {filteredItems.length === 0 ? "No matches" : `${filteredItems.length} results`}
          </div>
          {filteredItems.map((item, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onSelect(item)}
                className={`flex w-full items-start gap-3 border-l-4 px-4 py-3 text-left transition ${
                  active
                    ? "border-l-primary bg-primary-fade"
                    : "border-l-transparent hover:bg-surface-hover"
                }`}
              >
                <div className="mt-0.5 rounded-lg border border-border-main bg-canvas px-2 py-1 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-text-soft">
                  {item.kind}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text-main">{item.title}</div>
                  {item.description ? (
                    <div className="mt-1 truncate font-mono text-[10px] text-text-muted">
                      {item.description}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-text-soft">
                  {active ? <ArrowDown size={12} /> : <ArrowUp size={12} className="opacity-30" />}
                  Enter
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border-main bg-canvas px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
          <span>Cmd+K to jump anywhere</span>
          <span>Arrow keys to navigate</span>
        </div>
      </div>
    </div>
  );
}
