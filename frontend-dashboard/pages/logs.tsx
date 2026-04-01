import Link from "next/link";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";

export default function LogsPage() {
  const { canViewPage } = useVisibility();
  const canViewLogsPage = canViewPage("logs");

  return (
    <DashboardLayout>
      {!canViewLogsPage ? (
        <PageAccessNotice
          title="Platform logs are restricted for this role"
          description="Only platform operators can review cross-workspace operational trails."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                System Logs
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-text-main">
                Platform operational visibility
              </h1>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                The backend does not yet expose a dedicated cross-workspace log stream. Use the linked consoles below for the current supported audit and support trail.
              </p>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Link
              href="/audit"
              className="rounded-[1.4rem] border border-border-main bg-surface p-5 shadow-sm transition duration-200 hover:border-primary/30 hover:bg-canvas"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Audit Trail
              </div>
              <div className="mt-2 text-lg font-semibold text-text-main">Workspace audit logs</div>
              <div className="mt-2 text-sm text-text-muted">
                Review workspace-scoped audit events for permissions, assignments, and operational changes.
              </div>
            </Link>

            <Link
              href="/support/tickets"
              className="rounded-[1.4rem] border border-border-main bg-surface p-5 shadow-sm transition duration-200 hover:border-primary/30 hover:bg-canvas"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Support Ops
              </div>
              <div className="mt-2 text-lg font-semibold text-text-main">Support requests and grants</div>
              <div className="mt-2 text-sm text-text-muted">
                Review temporary support-access history and pending support requests.
              </div>
            </Link>
          </div>

          <section className="rounded-[1.5rem] border border-dashed border-border-main bg-surface px-5 py-8 text-sm text-text-muted">
            Missing backend capability: centralized platform log aggregation. When we add that API, this page should become the real cross-workspace log console instead of a routing hub.
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}

