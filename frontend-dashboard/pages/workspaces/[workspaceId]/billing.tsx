import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import WorkspaceConsoleTabs from "../../../components/workspace/WorkspaceConsoleTabs";
import WorkspaceStatusBanner from "../../../components/workspace/WorkspaceStatusBanner";
import { useVisibility } from "../../../hooks/useVisibility";
import { planService, type Plan } from "../../../services/planService";
import { workspaceService, type Workspace, type WorkspaceWalletSummary } from "../../../services/workspaceService";

export default function WorkspaceBillingPage() {
  const router = useRouter();
  const { workspaceId } = router.query;
  const { canViewPage, isPlatformOperator, isWorkspaceAdmin, isReadOnly } = useVisibility();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [wallet, setWallet] = useState<WorkspaceWalletSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<any>({});
  const [walletForm, setWalletForm] = useState({ transactionType: "credit", amount: "", note: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canViewBillingPage = canViewPage("billing") || isPlatformOperator || isWorkspaceAdmin;
  const canEditBillingPage = isPlatformOperator && !isReadOnly;
  const currentPlanLabel = workspace?.subscription_plan_name || workspace?.effective_plan_id || workspace?.plan_id || "starter";

  const loadData = async () => {
    const id = String(workspaceId || "").trim();
    if (!id) return;
    setLoading(true);
    try {
      setError("");
      const [workspaceRow, walletRow, planRows] = await Promise.all([
        workspaceService.get(id),
        workspaceService.getWallet(id),
        isPlatformOperator ? planService.list() : Promise.resolve([]),
      ]);
      setWorkspace(workspaceRow);
      setWallet(walletRow);
      setPlans(Array.isArray(planRows) ? planRows : []);
      setForm({
        planId: workspaceRow.effective_plan_id || workspaceRow.plan_id || "starter",
        subscriptionStatus: workspaceRow.subscription_status || "active",
        billingCycle: workspaceRow.billing_cycle || "monthly",
        basePriceAmount: workspaceRow.price_amount || 0,
        seatQuantity: workspaceRow.seat_quantity || 0,
        includedSeatLimit: workspaceRow.included_seat_limit || 0,
        extraSeatUnitPrice: workspaceRow.extra_seat_unit_price || 0,
        aiReplyLimit: workspaceRow.ai_reply_limit || 0,
        aiOverageUnitPrice: workspaceRow.ai_overage_unit_price || 0,
        walletAutoTopupEnabled: workspaceRow.wallet_auto_topup_enabled || false,
        walletAutoTopupAmount: workspaceRow.wallet_auto_topup_amount || 0,
        walletLowBalanceThreshold: workspaceRow.wallet_low_balance_threshold || 0,
        externalCustomerRef: workspaceRow.external_customer_ref || "",
        externalSubscriptionRef: workspaceRow.external_subscription_ref || "",
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load workspace billing");
      setWorkspace(null);
      setWallet(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewBillingPage) return;
    loadData().catch(console.error);
  }, [workspaceId, canViewBillingPage, isPlatformOperator]);

  const handleSave = async () => {
    const id = String(workspaceId || "").trim();
    if (!id) return;
    setSaving(true);
    try {
      setError("");
      if (!canEditBillingPage) {
        return;
      }
      await workspaceService.updateBilling(id, {
        ...form,
        workspaceStatus:
          form.subscriptionStatus === "locked" || workspace?.status === "suspended"
            ? workspace?.status
            : "active",
      });
      await loadData();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save billing");
    } finally {
      setSaving(false);
    }
  };

  const handleWalletAdjustment = async () => {
    const id = String(workspaceId || "").trim();
    if (!id) return;
    setSaving(true);
    try {
      setError("");
      await workspaceService.createWalletAdjustment(id, {
        transactionType: walletForm.transactionType as "credit" | "debit" | "adjustment",
        amount: Number(walletForm.amount || 0),
        note: walletForm.note,
      });
      setWalletForm({ transactionType: "credit", amount: "", note: "" });
      await loadData();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to update wallet");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewBillingPage ? (
        <PageAccessNotice
          title="Workspace billing is restricted for this role"
          description="Billing details are visible to workspace admins and platform billing users. Only platform operators can change billing settings."
          href="/settings"
          ctaLabel="Open settings"
        />
      ) : loading || !workspace || !wallet ? (
        <div className="mx-auto max-w-6xl rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-sm text-[var(--muted)]">
          {error || "Loading workspace billing..."}
        </div>
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <WorkspaceStatusBanner workspace={workspace} />
          <WorkspaceConsoleTabs workspaceId={workspace.id} activeSlug="billing" />
          {isWorkspaceAdmin && !isPlatformOperator ? (
            <section className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
              Workspace admins can review billing, wallet balance, subscription status, and renewal timing here. Only platform operators can make billing changes.
            </section>
          ) : null}

          {error ? (
            <section className="rounded-[1.2rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </section>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Plan", value: workspace.subscription_plan_name || workspace.effective_plan_id || workspace.plan_id },
              { label: "Subscription", value: workspace.subscription_status || "unknown" },
              { label: "Wallet balance", value: `INR ${Number(wallet.balance || 0).toFixed(2)}` },
              { label: "Seat quantity", value: workspace.seat_quantity ?? 0 },
            ].map((card) => (
              <div key={card.label} className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-sm">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">{card.label}</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text)]">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Subscription controls
                </div>
                {!canEditBillingPage ? (
                  <div className="rounded-full border border-border-main bg-canvas px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    Read only
                  </div>
                ) : null}
              </div>
              <div className="mt-5 grid gap-3">
                {canEditBillingPage ? (
                  <select
                    value={form.planId || ""}
                    onChange={(event) => setForm((current: any) => ({ ...current, planId: event.target.value }))}
                    disabled={!canEditBillingPage}
                    className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name || plan.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                    {currentPlanLabel}
                  </div>
                )}
                <select
                  value={form.subscriptionStatus || "active"}
                  onChange={(event) => setForm((current: any) => ({ ...current, subscriptionStatus: event.target.value }))}
                  disabled={!canEditBillingPage}
                  className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="active">active</option>
                  <option value="trialing">trialing</option>
                  <option value="overdue">overdue</option>
                  <option value="expired">expired</option>
                  <option value="canceled">canceled</option>
                  <option value="locked">locked</option>
                </select>
                <select
                  value={form.billingCycle || "monthly"}
                  onChange={(event) => setForm((current: any) => ({ ...current, billingCycle: event.target.value }))}
                  disabled={!canEditBillingPage}
                  className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="monthly">monthly</option>
                  <option value="yearly">yearly</option>
                </select>
                {[
                  ["basePriceAmount", "Base price"],
                  ["seatQuantity", "Seat quantity"],
                  ["includedSeatLimit", "Included seat limit"],
                  ["extraSeatUnitPrice", "Extra seat unit price"],
                  ["aiReplyLimit", "AI reply limit"],
                  ["aiOverageUnitPrice", "AI overage price"],
                  ["walletAutoTopupAmount", "Auto top-up amount"],
                  ["walletLowBalanceThreshold", "Low balance threshold"],
                  ["externalCustomerRef", "External customer ref"],
                  ["externalSubscriptionRef", "External subscription ref"],
                ].map(([key, label]) =>
                  canEditBillingPage ? (
                    <input
                      key={key}
                      type={key.toLowerCase().includes("ref") ? "text" : "number"}
                      value={form[key] ?? ""}
                      onChange={(event) => setForm((current: any) => ({ ...current, [key]: event.target.value }))}
                      disabled={!canEditBillingPage}
                      className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)]"
                      placeholder={label}
                    />
                  ) : (
                    <div
                      key={key}
                      className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)]"
                    >
                      {String(form[key] ?? "0")}
                    </div>
                  )
                )}
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(form.walletAutoTopupEnabled)}
                    onChange={(event) => setForm((current: any) => ({ ...current, walletAutoTopupEnabled: event.target.checked }))}
                    disabled={!canEditBillingPage}
                  />
                  Enable wallet auto top-up
                </label>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !canEditBillingPage}
                  className="rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
                >
                  {saving ? "Saving..." : canEditBillingPage ? "Save billing" : "View only"}
                </button>
              </div>
            </section>

            <section className="space-y-6">
              <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Wallet controls</div>
                <div className="mt-5 grid gap-3">
                  {canEditBillingPage ? (
                    <>
                      <select
                        value={walletForm.transactionType}
                        onChange={(event) => setWalletForm((current) => ({ ...current, transactionType: event.target.value }))}
                        disabled={!canEditBillingPage}
                        className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <option value="credit">credit</option>
                        <option value="debit">debit</option>
                        <option value="adjustment">adjustment</option>
                      </select>
                      <input
                        value={walletForm.amount}
                        onChange={(event) => setWalletForm((current) => ({ ...current, amount: event.target.value }))}
                        disabled={!canEditBillingPage}
                        className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-70"
                        placeholder="Amount"
                      />
                      <textarea
                        value={walletForm.note}
                        onChange={(event) => setWalletForm((current) => ({ ...current, note: event.target.value }))}
                        disabled={!canEditBillingPage}
                        className="min-h-[90px] w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-70"
                        placeholder="Adjustment note"
                      />
                    </>
                  ) : (
                    <div className="rounded-2xl border border-border-main bg-canvas px-4 py-5 text-sm text-text-muted">
                      Wallet adjustments are view only for workspace admins.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleWalletAdjustment}
                    disabled={saving || !canEditBillingPage}
                    className="rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 disabled:opacity-50"
                  >
                    {canEditBillingPage ? "Apply wallet change" : "View only"}
                  </button>
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Ledger</div>
                <div className="mt-4 space-y-3">
                  {wallet.recentTransactions.length ? (
                    wallet.recentTransactions.map((tx) => (
                      <div key={tx.id} className="rounded-[1rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[var(--text)]">
                              {tx.transaction_type} / {tx.entry_kind || "wallet"}
                            </div>
                            <div className="text-xs text-[var(--muted)]">
                              {tx.pricing_category || tx.platform || "wallet"}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-[var(--text)]">
                            INR {Number(tx.amount || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1rem] border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-5 text-sm text-[var(--muted)]">
                      No wallet ledger entries yet for this workspace.
                    </div>
                  )}
                </div>
              </section>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
