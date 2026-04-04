import Link from "next/link";

import type { TopConsumer } from "../../services/adminService";

type TopConsumersTableProps = {
  consumers: TopConsumer[];
  loading?: boolean;
  timeWindowLabel?: string;
};

export default function TopConsumersTable({
  consumers,
  loading = false,
  timeWindowLabel = "Last 24h",
}: TopConsumersTableProps) {
  return (
    <section className="rounded-[1.75rem] border border-border-main bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border-main px-6 py-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-text-muted">
            Attribution
          </div>
          <div className="mt-1 text-lg font-semibold tracking-tight text-text-main">
            Top consumers
          </div>
        </div>
        <div className="rounded-full border border-border-main bg-canvas px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
          {timeWindowLabel}
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-10 text-sm text-text-muted">Loading tenant attribution...</div>
      ) : consumers.length === 0 ? (
        <div className="px-6 py-10 text-sm text-text-muted">No consumer data yet.</div>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full border-collapse text-left">
            <tbody className="divide-y divide-border-main">
              {consumers.map((org, index) => (
                <tr key={org.org_id} className="group hover:bg-canvas/60">
                  <td className="w-10 px-6 py-4 align-top text-[10px] font-black text-text-muted">
                    #{index + 1}
                  </td>
                  <td className="px-0 py-4">
                    <div className="flex flex-col">
                      <Link
                        href={`/admin/organizations/${org.org_id}`}
                        className="text-sm font-bold text-text-main transition group-hover:text-primary"
                      >
                        {org.org_name}
                      </Link>
                      <span className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                        {String(org.plan_tier || "free").replace(/_/g, " ")}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right align-top">
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-mono font-bold text-text-main">
                        {Number(org.total_count || 0).toLocaleString()}
                      </span>
                      <div className="mt-1 flex gap-2 text-[8px] font-black uppercase tracking-[0.16em]">
                        <span className="text-sky-500">H: {Number(org.human_count || 0).toLocaleString()}</span>
                        <span className="text-violet-500">M: {Number(org.machine_count || 0).toLocaleString()}</span>
                      </div>
                    </div>
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
