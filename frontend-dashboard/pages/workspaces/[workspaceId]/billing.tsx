import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import SectionTabs from "../../../components/navigation/SectionTabs";
import WorkspaceStatusBanner from "../../../components/workspace/WorkspaceStatusBanner";
import { useVisibility } from "../../../hooks/useVisibility";
import { planService, type Plan } from "../../../services/planService";
import { workspaceService } from "../../../services/workspaceService";
import { useAuthStore } from "../../../store/authStore";

const EMPTY_BILLING_FORM = {
  subscriptionStatus: "active",
  expiryDate: "",
  gracePeriodEnd: "",
  lockReason: "",
};

export default function WorkspaceBillingPage() {
  const router = useRouter();
  const { workspaceId } = router.query;
  const user = useAuthStore((state) => state.user);
  const activeProject = useAuthStore((state) => state.activeProject);
  const { canViewPage } = useVisibility();
  const [workspace, setWorkspace] = useState<any>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingForm, setBillingForm] = useState(EMPTY_BILLING_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canViewWorkspacesPage = canViewPage("workspaces");
  const canViewSettingsPage = canViewPage("settings");
  const canViewBillingPage = canViewPage("billing");
  const isPlatformOperator = user?.role === "super_admin" || user?.role === "developer";
  const canManageWorkspace = isPlatformOperator;
  const canViewBillingShell = canViewBillingPage || canViewSettingsPage || canViewWorkspacesPage;

  const tabs = useMemo(
    () => [
      { label: "Workspace Settings", href: "/settings" },
      ...(activeProject?.id
        ? [{ label: "Project Settings", href: `/projects/${activeProject.id}/settings?from=settings` }]
        : []),
      { label: "Billing", href: `/workspaces/${workspaceId}/billing` },
    ],
    [activeProject?.id, workspaceId]
  );

  const activePlan = useMemo(
    () =>
      plans.find((plan) => plan.id === workspace?.plan_id) ||
      plans.find((plan) => plan.id === "starter") ||
      null,
    [plans, workspace?.plan_id]
  );

  const loadWorkspace = async () => {
    if (!workspaceId || !canViewBillingShell) {
      setWorkspace(null);
      return;
    }

    setLoading(true);
    try {
      setError("");
      const nextWorkspace = await workspaceService.get(String(workspaceId));
      setWorkspace(nextWorkspace);
      setBillingForm({
        subscriptionStatus: nextWorkspace?.subscription_status || "active",
        expiryDate: nextWorkspace?.expiry_date?.slice(0, 10) || "",
        gracePeriodEnd: nextWorkspace?.grace_period_end?.slice(0, 10) || "",
        lockReason: nextWorkspace?.lock_reason || "",
      });
    } catch (err: any) {
      console.error("Failed to load workspace billing", err);
      setError(err?.response?.data?.error || "Failed to load workspace billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace().catch(console.error);
  }, [workspaceId, canViewBillingShell]);

  useEffect(() => {
    if (!canManageWorkspace) {
      setPlans([]);
      return;
    }

    planService
      .list()
      .then((rows) => setPlans(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        console.error("Failed to load billing plans", err);
        setPlans([]);
      });
  }, [canManageWorkspace]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await workspaceService.updateBilling(String(workspaceId), {
        subscriptionStatus: billingForm.subscriptionStatus,
        workspaceStatus: billingForm.subscriptionStatus === "locked" ? "locked" : workspace?.status || "active",
        expiryDate: billingForm.expiryDate || null,
        gracePeriodEnd: billingForm.gracePeriodEnd || null,
        lockReason: billingForm.lockReason || "",
      });
      setWorkspace(saved);
      setSuccess("Billing state updated.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to update billing state");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewBillingShell ? (
        <PageAccessNotice
          title="Workspace billing is restricted for this role"
          description="Billing details are only available through workspace settings and platform billing access."
          href="/settings"
          ctaLabel="Open settings"
        />
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          {workspace ? <WorkspaceStatusBanner workspace={workspace} /> : null}

          <section className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Settings
            </div>
            <h1 className="mt-2 text-[1.35rem] font-semibold tracking-tight text-[var(--text)]">
              Workspace and project controls
            </h1>
            <SectionTabs items={tabs} currentPath={router.asPath.split("?")[0] || ""} className="mt-4" />
          </section>

          {error ? <section className="rounded-[1.5rem] border border-rose-300/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</section> : null}
          {success ? <section className="rounded-[1.5rem] border border-emerald-300/35 bg-emerald-500/10 p-4 text-sm text-emerald-200">{success}</section> : null}
          {!canManageWorkspace ? (
            <section className="rounded-[1.5rem] border border-sky-300/40 bg-[linear-gradient(135deg,#2563eb,#1d4ed8)] p-4 text-sm text-white shadow-[0_18px_30px_rgba(37,99,235,0.22)]">
              Billing details are visible here, but changing subscription status, lock state, or renewal settings is limited to platform operators.
            </section>
          ) : null}

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Billing</div>
            <h2 className="mt-3 text-[1.5rem] font-semibold tracking-tight text-[var(--text)]">Workspace subscription details</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Review subscription state, workspace dates, current usage, and plan limits from one place.
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Workspace", value: workspace?.name || "Unknown" },
              { label: "Subscription", value: workspace?.subscription_status || "unknown" },
              { label: "Plan", value: workspace?.subscription_plan_name || activePlan?.name || workspace?.plan_id || "starter" },
              { label: "Workspace status", value: workspace?.status || "active" },
              { label: "Billing cycle", value: workspace?.billing_cycle || "Not set" },
              { label: "Auto renew", value: workspace?.auto_renew ? "Enabled" : "Disabled" },
            ].map((card) => (
              <div key={card.label} className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{card.label}</div>
                <div className="mt-3 text-lg font-semibold text-[var(--text)]">{loading ? "Loading..." : card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Workspace Timeline</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {[
                  { label: "Created", value: workspace?.created_at ? new Date(workspace.created_at).toLocaleString() : "Not available" },
                  { label: "Updated", value: workspace?.updated_at ? new Date(workspace.updated_at).toLocaleString() : "Not available" },
                  { label: "Expiry date", value: workspace?.expiry_date ? new Date(workspace.expiry_date).toLocaleString() : "Not set" },
                  { label: "Grace period end", value: workspace?.grace_period_end ? new Date(workspace.grace_period_end).toLocaleString() : "Not set" },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{item.label}</div>
                    <div className="mt-2 text-sm text-[var(--text)]">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Usage And Limits</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {[
                  { label: "Campaigns", value: workspace?.campaign_count ?? 0 },
                  { label: "Platform accounts", value: workspace?.platform_account_count ?? 0 },
                  { label: "Max campaigns", value: activePlan?.max_campaigns ?? "Not set" },
                  { label: "Max users", value: activePlan?.max_users ?? "Not set" },
                  { label: "Max projects", value: activePlan?.max_projects ?? "Not set" },
                  { label: "Max bots", value: activePlan?.max_bots ?? "Not set" },
                  { label: "Max integrations", value: activePlan?.max_integrations ?? "Not set" },
                  { label: "Max numbers", value: activePlan?.max_numbers ?? "Not set" },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{item.label}</div>
                    <div className="mt-2 text-lg font-semibold text-[var(--text)]">{item.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Billing Controls</div>
              <div className="mt-4 space-y-4">
                <select disabled={!canManageWorkspace} className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none disabled:opacity-60" value={billingForm.subscriptionStatus} onChange={(event) => setBillingForm((current) => ({ ...current, subscriptionStatus: event.target.value }))}>
                  <option value="active">active</option>
                  <option value="overdue">overdue</option>
                  <option value="expired">expired</option>
                  <option value="canceled">canceled</option>
                  <option value="locked">locked</option>
                </select>
                <input disabled={!canManageWorkspace} type="date" className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none disabled:opacity-60" value={billingForm.expiryDate} onChange={(event) => setBillingForm((current) => ({ ...current, expiryDate: event.target.value }))} />
                <input disabled={!canManageWorkspace} type="date" className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none disabled:opacity-60" value={billingForm.gracePeriodEnd} onChange={(event) => setBillingForm((current) => ({ ...current, gracePeriodEnd: event.target.value }))} />
                <textarea disabled={!canManageWorkspace} className="min-h-[100px] w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none disabled:opacity-60" placeholder="Lock reason or billing note" value={billingForm.lockReason} onChange={(event) => setBillingForm((current) => ({ ...current, lockReason: event.target.value }))} />
                <div className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-sm text-[var(--muted)]">
                  Allowed platforms: {(activePlan?.allowed_platforms || []).join(", ") || "Not set"}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={handleSave} disabled={!canManageWorkspace || saving || loading} className="rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-[0_18px_30px_var(--accent-glow)] disabled:opacity-50">
                    {saving ? "Saving..." : "Save billing state"}
                  </button>
                  <button type="button" onClick={async () => {
                    await workspaceService.lock(String(workspaceId), { reason: billingForm.lockReason || "Locked by workspace admin" });
                    await loadWorkspace();
                  }} disabled={!canManageWorkspace} className="rounded-2xl border border-rose-300/35 bg-rose-500/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-rose-200 disabled:opacity-50">
                    Lock workspace
                  </button>
                  <button type="button" onClick={async () => {
                    await workspaceService.unlock(String(workspaceId), { subscriptionStatus: "active" });
                    await loadWorkspace();
                  }} disabled={!canManageWorkspace} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)] disabled:opacity-50">
                    Unlock workspace
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
