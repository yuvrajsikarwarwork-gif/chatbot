import React from "react";

interface FlowToolbarProps {
  onAdd: (type: string) => void;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDirty: boolean;
}

// Categorized for UI/UX clean grouping
const NODE_CATEGORIES = [
  {
    title: "Basic",
    items: [
      { type: "message", label: "Message" },
      { type: "button", label: "Buttons" },
      { type: "list", label: "Menu List" },
      { type: "media", label: "Media" },
    ]
  },
  {
    title: "Logic & Data",
    items: [
      { type: "input", label: "User Input" },
      { type: "condition", label: "Condition" },
      { type: "api", label: "API/Webhook" },
      { type: "delay", label: "Delay" },
    ]
  },
  {
    title: "Advanced",
    items: [
      { type: "wa_flow", label: "WA Form" },
      { type: "product", label: "Product" },
      { type: "handoff", label: "Human Agent" },
    ]
  }
];

export default function FlowToolbar({ onAdd, onSave, onDelete, isSaving, isDirty }: FlowToolbarProps) {
  return (
    <div className="bg-[var(--surface)] text-[var(--text)] p-4 flex items-center justify-between shadow-md z-10 relative rounded-t-md border-b border-[var(--line)]">
      <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
        {NODE_CATEGORIES.map((category) => (
          <div key={category.title} className="flex items-center gap-2 border-r border-[var(--line)] pr-6 last:border-0">
            <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
              {category.title}
            </span>
            <div className="flex gap-2">
              {category.items.map((item) => (
                <button
                  key={item.type}
                  onClick={() => onAdd(item.type)}
                  className="px-3 py-1.5 bg-[var(--surface-strong)] hover:bg-[var(--surface)] text-[var(--text)] rounded text-xs font-semibold transition-colors border border-[var(--line)] whitespace-nowrap"
                >
                  + {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 ml-4 pl-4 border-l border-[var(--line)]">
        <div className="text-xs text-[var(--muted)] whitespace-nowrap hidden lg:block">
          <span className="font-bold text-[var(--text)]">Hint:</span> Hold <kbd className="bg-[var(--surface-strong)] px-1 py-0.5 rounded border border-[var(--line)] text-[10px]">Shift</kbd> to multi-select
        </div>
        <button
          onClick={onDelete}
          className="px-4 py-2 bg-red-700 text-white rounded text-xs font-bold transition-colors hover:bg-red-600"
        >
          Delete Selected
        </button>
        <button
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className={`px-6 py-2 rounded text-xs font-bold transition-all shadow-lg ${
            isSaving 
            ? "bg-primary text-white cursor-wait" 
            : isDirty 
              ? "bg-primary text-white hover:bg-emerald-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.18)]" 
              : "bg-[var(--surface-strong)] text-[var(--muted)] cursor-not-allowed border border-[var(--line)]"
          }`}
        >
          {isSaving ? "SAVING..." : isDirty ? "SAVE FLOW" : "SAVED"}
        </button>
      </div>
    </div>
  );
}