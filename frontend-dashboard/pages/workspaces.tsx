import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { planService } from "../services/planService";
import { workspaceService, type Workspace } from "../services/workspaceService";
import { useAuthStore } from "../store/authStore";

const EMPTY_FORM = {
  name: "",
  planId: "starter",
  status: "active",
};

export default function WorkspacesPage() {
  const user = useAuthStore((state) => state.user);
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace);
  const { canViewPage } = useVisibility();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [plans, setPlans] = useState<Array<{ id: string; name?: string }>>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canViewWorkspacesPage = canViewPage("workspaces");
  const isPlatformOperator = user?.role === "super_admin" || user?.role === "developer";

  const loadPage = async () => {
    if (!canViewWorkspacesPage) {
      setWorkspaces([]);
      setPlans([]);
      return;
    }

    setLoading(true);
    try {
      setError("");
      const [workspaceRows, planRows] = await Promise.all([
        workspaceService.list(),
        planService.list(),
      ]);
      setWorkspaces(Array.isArray(workspaceRows) ? workspaceRows : []);
      setPlans(Array.isArray(planRows) ? planRows : []);
    } catch (err: any) {
      console.error("Failed to load workspace directory", err);
      setWorkspaces([]);
      setPlans([]);
      setError(err?.response?.data?.error || "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewWorkspacesPage) {
      setWorkspaces([]);
      setPlans([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        setError("");
        const [workspaceRows, planRows] = await Promise.all([
          workspaceService.list(),
          planService.list(),
        ]);
        if (!cancelled) {
          setWorkspaces(Array.isArray(workspaceRows) ? workspaceRows : []);
          setPlans(Array.isArray(planRows) ? planRows : []);
        }
      } catch (err: any) {
        console.error("Failed to load workspace directory", err);
        if (!cancelled) {
          setWorkspaces([]);
          setPlans([]);
          setError(err?.response?.data?.error || "Failed to load workspaces");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [canViewWorkspacesPage]);

  const stats = useMemo(
    () => ({
      total: workspaces.length,
      active: workspaces.filter((workspace) => workspace.status === "active").length,
      locked: workspaces.filter((workspace) => workspace.status === "locked").length,
    }),
    [workspaces]
  );

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError("Workspace name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await workspaceService.create({
        name: form.name.trim(),
        planId: form.planId,
        status: form.status,
      });
      setForm(EMPTY_FORM);
      setSuccess("Workspace created.");
      await loadPage();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to create workspace");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewWorkspacesPage ? (
        <PageAccessNotice
          title="Workspace controls are restricted for this role"
          description="Workspace administration is only available to platform operators and workspace managers."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  <Building2 size={13} className="text-[var(--accent)]" />
                  Workspaces
                </div>
                <h1 className="mt-4 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                  Workspace directory
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                  Keep this page focused on workspace discovery. Detailed member access, support,
                  and billing work now live inside split child pages.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Total", value: stats.total },
                  { label: "Active", value: stats.active },
                  { label: "Locked", value: stats.locked },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                      {card.label}
                    </div>
                    <div className="mt-2 text-xl font-semibold text-[var(--text)]">{card.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-white shadow-[0_18px_30px_var(--accent-glow)]">
                  <Plus size={18} />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    New Workspace
                  </div>
                  <div className="text-lg font-semibold tracking-tight text-[var(--text)]">
                    Create a workspace shell
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <input
                  className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
                  placeholder="Workspace name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
                <select
                  className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
                  value={form.planId}
                  onChange={(event) => setForm((current) => ({ ...current, planId: event.target.value }))}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name || plan.id}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="active">active</option>
                  <option value="locked">locked</option>
                </select>
                {error ? (
                  <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </div>
                ) : null}
                {success ? (
                  <div className="rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    {success}
                  </div>
                ) : null}
                {isPlatformOperator ? (
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={saving}
                    className="w-full rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {saving ? "Creating..." : "Create workspace"}
                  </button>
                ) : (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
                    Workspace creation is limited to platform operators.
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              {loading ? (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-sm text-[var(--muted)]">
                  Loading workspace directory...
                </div>
              ) : workspaces.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {workspaces.map((workspace) => (
                    <section
                      key={workspace.id}
                      className="rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold tracking-tight text-[var(--text)]">
                            {workspace.name}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                            Plan {workspace.subscription_plan_name || workspace.plan_id || "starter"}.
                            Subscription {workspace.subscription_status || "unknown"}.
                          </div>
                        </div>
                        <div className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                          {workspace.status}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[1.05rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                          Campaigns: {workspace.campaign_count || 0}
                        </div>
                        <div className="rounded-[1.05rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                          Accounts: {workspace.platform_account_count || 0}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Link
                          href="/settings"
                          onClick={() => setActiveWorkspace(workspace.id)}
                          className="rounded-[1.05rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)] transition duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
                        >
                          Overview
                        </Link>
                        <Link
                          href="/users-access/members"
                          onClick={() => setActiveWorkspace(workspace.id)}
                          className="rounded-[1.05rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)] transition duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
                        >
                          Members & Access
                        </Link>
                        {isPlatformOperator ? (
                          <>
                            <Link
                              href="/support/access"
                              onClick={() => setActiveWorkspace(workspace.id)}
                              className="rounded-[1.05rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)] transition duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
                            >
                              Support
                            </Link>
                            <Link
                              href={`/workspaces/${workspace.id}/billing`}
                              onClick={() => setActiveWorkspace(workspace.id)}
                              className="rounded-[1.05rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)] transition duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
                            >
                              Billing
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-sm text-[var(--muted)]">
                  No workspaces found yet.
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
