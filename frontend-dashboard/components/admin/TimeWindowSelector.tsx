import type { AdminTimeWindow } from "../../store/adminAnalyticsStore";

type TimeWindowSelectorProps = {
  value: AdminTimeWindow;
  onChange: (value: AdminTimeWindow) => void;
};

const OPTIONS: Array<{ label: string; value: AdminTimeWindow }> = [
  { label: "Last 24h", value: "24 hours" },
  { label: "Last 7d", value: "7 days" },
  { label: "Billing Cycle", value: "30 days" },
];

export default function TimeWindowSelector({ value, onChange }: TimeWindowSelectorProps) {
  return (
    <div className="inline-flex rounded-2xl border border-border-main bg-canvas p-1 shadow-sm">
      {OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition ${
              active
                ? "bg-white text-primary shadow-sm"
                : "text-text-muted hover:text-text-main"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
