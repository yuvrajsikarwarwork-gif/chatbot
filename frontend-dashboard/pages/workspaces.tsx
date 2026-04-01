import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import GlobalRecoveryModal from "../components/workspace/GlobalRecoveryModal";
import { useVisibility } from "../hooks/useVisibility";
import { authService } from "../services/authService";
import { planService } from "../services/planService";
import {
  workspaceService,
  type Workspace,
  type WorkspaceHistoryRow,
} from "../services/workspaceService";
import { useAuthStore } from "../store/authStore";
import { notify } from "../store/uiStore";

const EMPTY_FORM = {
  companyName: "",
  companyWebsite: "",
  industry: "",
  gstin: "",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  planId: "starter",
  billingCycle: "monthly",
  initialWalletTopup: "",
  status: "active",
};

type PendingInvite = {
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string;
  ownerName: string;
  ownerPhone: string;
  inviteLink: string | null;
  inviteExpiresAt: string | null;
  inviteFailed: boolean;
  inviteDelivery: {
    ok: boolean;
    provider: string;
    detail: string;
    checkedAt: string;
  } | null;
};

export default function WorkspacesPage() {
  const router = useRouter();
  const { canViewPage, isPlatformOperator } = useVisibility();
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace);
  const setPermissionSnapshot = useAuthStore((state) => state.setPermissionSnapshot);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [historyWorkspaces, setHistoryWorkspaces] = useState<WorkspaceHistoryRow[]>([]);
  const [plans, setPlans] = useState<Array<{ id: string; name?: string }>>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [inviteEmailDraft, setInviteEmailDraft] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopyState, setInviteCopyState] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [directoryView, setDirectoryView] = useState<"active" | "history">("active");
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const canViewWorkspacesPage = canViewPage("workspaces");
  const canCreateWorkspace = isPlatformOperator;
  const accessPending = !hasHydrated;

  const uniqueRows = (rows: Array<Workspace | WorkspaceHistoryRow>) => {
    const seen = new Set<string>();
    return rows.filter((row) => {
      const id = String(row?.id || "").trim();
      if (!id || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  };

  useEffect(() => {
    const requestedView = String(router.query.view || "").toLowerCase();
    if (requestedView === "history") {
      setDirectoryView("history");
    }
  }, [router.query.view]);

  const loadPage = async () => {
    setLoading(true);
    try {
      setError("");
      const [workspaceRows, historyRows, planRows] = await Promise.all([
        directoryView === "history" ? Promise.resolve([]) : workspaceService.list(),
        isPlatformOperator ? workspaceService.listHistory() : Promise.resolve([]),
        isPlatformOperator ? planService.list() : Promise.resolve([]),
      ]);
      setWorkspaces(Array.isArray(workspaceRows) ? workspaceRows : []);
      setHistoryWorkspaces(Array.isArray(historyRows) ? historyRows : []);
      setPlans(Array.isArray(planRows) ? planRows : []);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load workspaces");
      setWorkspaces([]);
      setHistoryWorkspaces([]);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewWorkspacesPage) return;
    loadPage().catch(console.error);
  }, [canViewWorkspacesPage, isPlatformOperator, directoryView]);

  const stats = useMemo(
    () => ({
      total: uniqueRows(directoryView === "history" ? historyWorkspaces : workspaces).length,
      active: uniqueRows(directoryView === "history" ? historyWorkspaces : workspaces).filter(
        (workspace) => workspace.status === "active"
      ).length,
      suspended: uniqueRows(directoryView === "history" ? historyWorkspaces : workspaces).filter(
        (workspace) => workspace.status === "suspended"
      ).length,
    }),
    [directoryView, historyWorkspaces, workspaces]
  );

  const directoryRows = directoryView === "history" ? historyWorkspaces : workspaces;

  const handleRestoreWorkspace = async (workspaceId: string) => {
    try {
      setLoading(true);
      await workspaceService.restore(workspaceId);
      notify("Workspace restored.", "success");
      setDirectoryView("active");
      await loadPage();
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to restore workspace.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!canCreateWorkspace || !form.companyName.trim() || !form.ownerName.trim() || !form.ownerEmail.trim()) {
      setError("Company name, owner name, and owner email are required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const created = await workspaceService.create({
        companyName: form.companyName,
        companyWebsite: form.companyWebsite || null,
        industry: form.industry || null,
        gstin: form.gstin || null,
        ownerName: form.ownerName,
        ownerEmail: form.ownerEmail,
        ownerPhone: form.ownerPhone || null,
        planId: form.planId,
        billingCycle: form.billingCycle,
        initialWalletTopup: Number(form.initialWalletTopup || 0),
        status: form.status,
      });
      setPendingInvite({
        workspaceId: created.id,
        workspaceName: created.name || form.companyName,
        ownerEmail: form.ownerEmail,
        ownerName: form.ownerName,
        ownerPhone: form.ownerPhone,
        inviteLink: created.invite_link || null,
        inviteExpiresAt: created.invite_expires_at || null,
        inviteFailed: Boolean(created.invite_failed),
        inviteDelivery: created.invite_delivery || null,
      });
      setInviteEmailDraft(form.ownerEmail);
      notify("Workspace created. Invite waiting room opened.", "success");
      setForm(EMPTY_FORM);
      await loadPage();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to create workspace");
    } finally {
      setSaving(false);
    }
  };

  const copyInviteLink = async () => {
    if (!pendingInvite?.inviteLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(pendingInvite.inviteLink);
      setInviteCopyState("Invite link copied.");
      notify("Invite link copied.", "success");
    } catch {
      setInviteCopyState("Could not copy invite link.");
    }
  };

  const resendInvite = async () => {
    if (!pendingInvite?.workspaceId) {
      return;
    }
    try {
      setInviteBusy(true);
      setInviteCopyState("");
      const data = await workspaceService.resendOwnerInvite(pendingInvite.workspaceId);
      setPendingInvite((current) =>
        current
          ? {
              ...current,
              ownerEmail: data.ownerEmail || current.ownerEmail,
              inviteLink: data.inviteLink || null,
              inviteExpiresAt: data.inviteExpiresAt || null,
              inviteFailed: false,
              inviteDelivery: data.emailDelivery || current.inviteDelivery,
            }
          : current
      );
      notify("Invite resent.", "success");
    } catch (err: any) {
      setInviteCopyState(err?.response?.data?.error || "Failed to resend invite");
    } finally {
      setInviteBusy(false);
    }
  };

  const updateInviteEmail = async () => {
    if (!pendingInvite?.workspaceId || !inviteEmailDraft.trim()) {
      return;
    }
    try {
      setInviteBusy(true);
      setInviteCopyState("");
      const data = await workspaceService.updateOwnerEmailAndResendInvite(
        pendingInvite.workspaceId,
        { ownerEmail: inviteEmailDraft.trim() }
      );
      setPendingInvite((current) =>
        current
          ? {
              ...current,
              ownerEmail: data.ownerEmail || inviteEmailDraft.trim(),
              inviteLink: data.inviteLink || null,
              inviteExpiresAt: data.inviteExpiresAt || null,
              inviteFailed: false,
              inviteDelivery: data.emailDelivery || current.inviteDelivery,
            }
          : current
      );
      notify("Email updated and invite resent.", "success");
    } catch (err: any) {
      setInviteCopyState(err?.response?.data?.error || "Failed to update invite email");
    } finally {
      setInviteBusy(false);
    }
  };

  const handleEnterWorkspace = async (workspace: Workspace | WorkspaceHistoryRow) => {
    if (!workspace?.id || !isPlatformOperator) {
      return;
    }

    try {
      setLoading(true);
      const session = await authService.startWorkspaceImpersonation(workspace.id, {
        durationHours: 4,
        consentNote: "Admin impersonation session",
      });
      setPermissionSnapshot({
        user: session.user || user,
        memberships: Array.isArray(session.memberships) ? session.memberships : [],
        activeWorkspace: session.activeWorkspace || null,
        projectAccesses: Array.isArray(session.projectAccesses) ? session.projectAccesses : [],
        activeProject: null,
        resolvedAccess: session.resolvedAccess || null,
      });
      notify("Workspace impersonation started.", "success");
      router.push(`/workspaces/${workspace.id}`).catch(() => undefined);
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to enter workspace.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {accessPending ? (
        <section className="mx-auto max-w-4xl rounded-[1.5rem] border border-dashed border-border-main bg-canvas px-6 py-10 text-sm text-text-muted shadow-sm">
          Loading workspace controls...
        </section>
      ) : !canViewWorkspacesPage ? (
        <PageAccessNotice
          title="Workspace controls are restricted for this role"
          description="Workspace administration is only available to platform operators."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                  Workspace Onboarding
                </div>
                <h1 className="mt-3 text-[1.7rem] font-semibold tracking-tight text-text-main">
                  Create verified client workspaces
                </h1>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Total", value: stats.total },
                  { label: "Active", value: stats.active },
                  { label: "Suspended", value: stats.suspended },
                ].map((card) => (
                <div key={card.label} className="rounded-[1.1rem] border border-border-main bg-canvas px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted">{card.label}</div>
                  <div className="mt-1 text-xl font-semibold text-text-main">{card.value}</div>
                </div>
                ))}
              </div>
            </div>
            {isPlatformOperator ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setRecoveryOpen(true)}
                  className="rounded-full border border-rose-300 bg-rose-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-rose-800 transition hover:bg-rose-200"
                >
                  Recently Deleted / Archived
                </button>
              </div>
            ) : null}
          </section>

          {pendingInvite ? (
            <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                Waiting Room
              </div>
              <h2 className="mt-2 text-xl font-semibold text-emerald-950">
                Check your email to finish setup
              </h2>
              <p className="mt-2 text-sm text-emerald-900/80">
                We sent an activation link to <span className="font-semibold">{pendingInvite.ownerEmail}</span>.
                Use it to create the permanent password for <span className="font-semibold">{pendingInvite.workspaceName}</span>.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Invite link</div>
                  <div className="mt-1 break-all font-medium">
                    {pendingInvite.inviteLink || "Invite email not delivered yet. Use resend or update email below."}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Expires</div>
                  <div className="mt-1 font-medium">
                    {pendingInvite.inviteExpiresAt ? new Date(pendingInvite.inviteExpiresAt).toLocaleString() : "Pending new invite"}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950">
                <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Email delivery</div>
                <div className="mt-1 font-medium">
                  {pendingInvite.inviteDelivery
                    ? `${pendingInvite.inviteDelivery.ok ? "Sent" : "Blocked"} via ${pendingInvite.inviteDelivery.provider.toUpperCase()}`
                    : "No delivery status yet"}
                </div>
                <div className="mt-1 text-xs text-emerald-800/80">
                  {pendingInvite.inviteDelivery?.detail || "Configure SMTP, SendGrid, or Postmark to enable delivery."}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={resendInvite}
                  disabled={inviteBusy}
                  className="rounded-2xl border border-emerald-400 bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white disabled:opacity-50"
                >
                  {inviteBusy ? "Resending..." : "Resend email"}
                </button>
                <button
                  type="button"
                  onClick={copyInviteLink}
                  disabled={!pendingInvite.inviteLink}
                  className="rounded-2xl border border-border-main bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-text-main disabled:opacity-50"
                >
                  Copy invite link
                </button>
                <button
                  type="button"
                  onClick={() => setPendingInvite(null)}
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-text-main"
                >
                  Continue to list
                </button>
              </div>
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-white p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Typo fix
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main"
                    placeholder="Correct owner email"
                    value={inviteEmailDraft}
                    onChange={(event) => setInviteEmailDraft(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={updateInviteEmail}
                    disabled={inviteBusy || !inviteEmailDraft.trim()}
                    className="rounded-2xl border border-primary bg-primary px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white disabled:opacity-50"
                  >
                    Update & resend
                  </button>
                </div>
                {inviteCopyState ? (
                  <div className="mt-3 text-sm text-emerald-800">{inviteCopyState}</div>
                ) : null}
              </div>
            </section>
          ) : null}

          {error ? (
            <section className="rounded-[1.2rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </section>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[430px_1fr]">
            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Create Workspace</div>
              <div className="mt-5 space-y-5">
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Company details</div>
                  <input className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" placeholder="Company name" value={form.companyName} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))} />
                  <input className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" placeholder="Company website" value={form.companyWebsite} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, companyWebsite: event.target.value }))} />
                  <input className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" placeholder="Industry / category" value={form.industry} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))} />
                  <input className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" placeholder="GSTIN / tax id" value={form.gstin} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, gstin: event.target.value }))} />
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Primary account owner</div>
                  <input className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" placeholder="Full name" value={form.ownerName} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))} />
                  <input className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" placeholder="Email address" value={form.ownerEmail} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, ownerEmail: event.target.value }))} />
                  <input className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" placeholder="Phone number" value={form.ownerPhone} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, ownerPhone: event.target.value }))} />
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Plan & billing</div>
                  <select className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" value={form.planId} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, planId: event.target.value }))}>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name || plan.id}
                      </option>
                    ))}
                  </select>
                  <select className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" value={form.billingCycle} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, billingCycle: event.target.value }))}>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <input className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" placeholder="Initial wallet top-up (optional)" value={form.initialWalletTopup} disabled={!canCreateWorkspace} onChange={(event) => setForm((current) => ({ ...current, initialWalletTopup: event.target.value }))} />
                  <button type="button" onClick={handleCreate} disabled={saving || !canCreateWorkspace} className="w-full rounded-2xl border border-primary bg-primary px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50">
                    {saving ? "Creating..." : "Create workspace"}
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-border-main bg-surface px-4 py-3 shadow-sm">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Workspace Directory
                  </div>
                  <div className="mt-1 text-sm text-text-muted">
                    {directoryView === "history"
                      ? "Archived and deleted workspaces stay visible here until the 30-day retention window expires."
                      : "Active workspaces only. Switch to History to inspect archived or deleted workspaces."}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDirectoryView("active")}
                    className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                      directoryView === "active"
                        ? "border-primary bg-primary text-white"
                        : "border-border-main bg-canvas text-text-main"
                    }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectoryView("history")}
                    className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                      directoryView === "history"
                        ? "border-primary bg-primary text-white"
                        : "border-border-main bg-canvas text-text-main"
                    }`}
                  >
                    History
                  </button>
                </div>
              </div>
              {directoryView === "history" ? (
                <div className="flex flex-wrap items-center gap-2 rounded-[1.15rem] border border-border-main bg-canvas px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-amber-800">
                    Archived
                  </span>
                  <span className="rounded-full border border-rose-300 bg-rose-100 px-3 py-1 text-rose-700">
                    Deleted
                  </span>
                  <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-slate-700">
                    Purge expired
                  </span>
                  <span className="ml-auto normal-case tracking-normal text-text-muted">
                    Deleted workspaces can be restored for 30 days. Archived workspaces can be reactivated, but billing does not restart automatically.
                  </span>
                </div>
              ) : null}
              {loading ? (
                <section className="rounded-[1.5rem] border border-dashed border-border-main bg-canvas px-5 py-8 text-sm text-text-muted">
                  Loading {directoryView === "history" ? "workspace history" : "workspace directory"}...
                </section>
              ) : directoryRows.length ? (
                directoryRows.map((workspace) => (
                  <section key={workspace.id} className="rounded-[1.4rem] border border-border-main bg-surface p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-base font-semibold text-text-main">{workspace.name}</div>
                        <div className="mt-2 text-sm text-text-muted">
                          {workspace.industry || "Uncategorized"} • {workspace.subscription_plan_name || workspace.effective_plan_id || workspace.plan_id}
                        </div>
                        <div className="mt-2 text-xs text-text-muted">
                          {workspace.company_website || "No website"} {workspace.tax_id ? `• GSTIN ${workspace.tax_id}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div
                          className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                            directoryView === "history" && workspace.deleted_at
                              ? (workspace as WorkspaceHistoryRow).purge_expired
                                ? "border-slate-300 bg-slate-100 text-slate-700"
                                : "border-rose-300 bg-rose-100 text-rose-700"
                              : directoryView === "history"
                                ? "border-amber-300 bg-amber-100 text-amber-800"
                                : String(workspace.status || "").toLowerCase() === "active"
                                  ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                                  : "border-rose-300 bg-rose-100 text-rose-700"
                          }`}
                        >
                          {directoryView === "history"
                            ? workspace.deleted_at
                              ? (workspace as WorkspaceHistoryRow).purge_expired
                                ? "purge expired"
                                : "deleted"
                              : "archived"
                            : workspace.status}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm text-text-main">
                        Billing: {workspace.subscription_status || "unknown"}
                      </div>
                      <div className="rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm text-text-main">
                        Seats: {workspace.seat_quantity ?? 0}
                      </div>
                      <div className="rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm text-text-main">
                        Wallet top-up: {workspace.wallet_auto_topup_enabled ? "On" : "Off"}
                      </div>
                    </div>

                    {directoryView === "history" ? (
                      <div className="mt-4 rounded-[1rem] border border-dashed border-border-main bg-canvas px-4 py-3 text-sm text-text-muted">
                        {workspace.deleted_at ? (
                          <>
                            Deleted at{" "}
                            <span className="font-semibold text-text-main">
                              {new Date(workspace.deleted_at).toLocaleString()}
                            </span>
                            {workspace.purge_after ? (
                              <>
                                {" "}
                                Purge after{" "}
                                <span className="font-semibold text-text-main">
                                  {new Date(workspace.purge_after).toLocaleString()}
                                </span>
                              </>
                            ) : null}
                            {(workspace as WorkspaceHistoryRow).restore_available === false ||
                            (workspace as WorkspaceHistoryRow).purge_expired
                              ? " Retention has expired, so this workspace must be recreated from scratch."
                              : ` Restore is available for ${
                                  (workspace as WorkspaceHistoryRow).purge_days_remaining ?? 30
                                } more day(s).`}
                          </>
                        ) : (
                          <>
                            Archived workspace. Restoring reopens access, but billing does not restart automatically.
                          </>
                        )}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-3">
                      {isPlatformOperator ? (
                        Boolean(
                          (workspace as Workspace & {
                            accessGranted?: boolean | null;
                            support_access_granted?: boolean | null;
                          }).accessGranted ||
                            (workspace as Workspace & {
                              accessGranted?: boolean | null;
                              support_access_granted?: boolean | null;
                            }).support_access_granted
                        ) ? (
                          <button
                            type="button"
                            onClick={() => handleEnterWorkspace(workspace)}
                            className="rounded-[1rem] border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-200"
                          >
                            Enter Workspace
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="cursor-not-allowed rounded-[1rem] border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500 shadow-sm"
                          >
                            No Support Access
                          </button>
                        )
                      ) : null}
                      <Link
                        href={`/workspaces/${workspace.id}`}
                        onClick={() => setActiveWorkspace(workspace.id)}
                        className="rounded-[1rem] border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                      >
                        Overview
                      </Link>
                      {directoryView === "history" &&
                      (workspace as WorkspaceHistoryRow).restore_available !== false &&
                      !(workspace as WorkspaceHistoryRow).purge_expired ? (
                        <button
                          type="button"
                          onClick={() => handleRestoreWorkspace(workspace.id)}
                          className="rounded-[1rem] border border-primary bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                        >
                          Restore workspace
                        </button>
                      ) : null}
                      {directoryView === "history" &&
                      ((workspace as WorkspaceHistoryRow).restore_available === false ||
                        (workspace as WorkspaceHistoryRow).purge_expired) ? (
                        <span className="rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-muted">
                          Create a new workspace to continue
                        </span>
                      ) : null}
                    </div>
                  </section>
                ))
              ) : (
                <section className="rounded-[1.5rem] border border-dashed border-border-main bg-canvas px-5 py-8 text-sm text-text-muted">
                  {directoryView === "history"
                    ? "No archived or deleted workspaces yet."
                    : "No active workspaces yet."}
                </section>
              )}
            </section>
          </div>
          {isPlatformOperator ? (
            <GlobalRecoveryModal
              open={recoveryOpen}
              items={historyWorkspaces}
              onClose={() => setRecoveryOpen(false)}
              onRestore={handleRestoreWorkspace}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

(WorkspacesPage as any).getLayout = (page: any) => <DashboardLayout>{page}</DashboardLayout>;
