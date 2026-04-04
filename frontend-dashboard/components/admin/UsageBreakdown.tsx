import type { OrganizationUsageBreakdown } from "../../services/adminService";

type UsageBreakdownProps = {
  breakdown: OrganizationUsageBreakdown[];
  loading?: boolean;
  timeWindowLabel?: string;
};

export default function UsageBreakdown({
  breakdown,
  loading = false,
  timeWindowLabel = "Billing Cycle",
}: UsageBreakdownProps) {
  return (
    <section className="rounded-[1.75rem] border border-border-main bg-surface shadow-sm">
      <div className="border-b border-border-main px-6 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.24em] text-text-muted">
          Internal usage breakdown
        </div>
        <div className="mt-1 text-lg font-semibold tracking-tight text-text-main">
          Workspace and credential attribution
        </div>
      </div>

      <div className="px-6 pt-4">
        <div className="inline-flex rounded-full border border-border-main bg-canvas px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
          {timeWindowLabel}
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-10 text-sm text-text-muted">Loading organization breakdown...</div>
      ) : breakdown.length === 0 ? (
        <div className="px-6 py-10 text-sm text-text-muted">No breakdown data yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="bg-canvas text-[9px] font-black uppercase tracking-[0.22em] text-text-muted">
              <tr>
                <th className="px-6 py-3">Workspace</th>
                <th className="px-6 py-3">Source / Credential</th>
                <th className="px-6 py-3 text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-main">
              {breakdown.map((item) => (
                <tr key={`${item.workspace_id}-${item.source_name}`} className="hover:bg-canvas/60">
                  <td className="px-6 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-text-main">{item.workspace_name}</span>
                      <span className="mt-1 text-[9px] font-mono text-text-muted">{item.workspace_id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          item.auth_type === "machine" ? "bg-violet-500" : "bg-sky-500"
                        }`}
                      />
                      <span className="text-sm text-text-muted">{item.source_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-sm font-bold text-text-main">
                    {Number(item.total_requests || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
