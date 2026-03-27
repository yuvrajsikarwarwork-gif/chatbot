import DashboardLayout from "../components/layout/DashboardLayout";

export default function AgentSystem() {
  return (
    <DashboardLayout title="Agent Workspace">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
            Agent Workspace
          </div>
          <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
            Human handoff queue
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            No fake tickets are shown here anymore. Connect the real ticket feed before using this page for live agent work.
          </p>
        </section>

        <section className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-10 text-center shadow-sm">
          <div className="text-sm font-medium text-[var(--text)]">No live agent tickets loaded</div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            This page is now intentionally empty until the real agent queue API is wired in.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}
