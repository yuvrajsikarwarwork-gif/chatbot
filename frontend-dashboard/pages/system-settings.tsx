import Link from "next/link";

import DashboardLayout from "../components/layout/DashboardLayout";

export default function SystemSettingsPage() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 shadow-[var(--shadow-glass)] backdrop-blur-2xl">
          <div className="max-w-3xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
              System Settings
            </div>
            <h1 className="mt-3 bg-[linear-gradient(180deg,var(--text),color-mix(in_srgb,var(--text)_72%,var(--accent)_28%))] bg-clip-text text-[1.7rem] font-black tracking-[-0.03em] text-transparent">
              Platform defaults and system controls
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              System-wide settings are still being separated from workspace settings. This route keeps the target platform layout stable while that split is completed.
            </p>
          </div>
        </section>
        <Link href="/settings" className="inline-flex rounded-xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5">
          Open settings
        </Link>
      </div>
    </DashboardLayout>
  );
}
