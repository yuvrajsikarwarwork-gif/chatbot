import DashboardLayout from "../components/layout/DashboardLayout";

export default function QueuePage() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
            Runtime
          </div>
          <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
            Queue dashboard
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            The old queue monitoring screen depended on `/queue/jobs`, but that backend API is not exposed in the current build. This page is intentionally kept minimal until queue inspection and retry routes are restored.
          </p>
        </header>

        <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900 shadow-[var(--shadow-soft)]">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
            Current Status
          </div>
          <p className="mt-3">
            Background queue processing is active in the backend for flow wait reminders and timeouts, but there is no supported frontend read API for job listing or manual retry right now.
          </p>
          <p className="mt-3">
            If you want this page live again, the next step is to add authenticated backend endpoints for queue listing and retry, then reconnect this page to those routes.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}
