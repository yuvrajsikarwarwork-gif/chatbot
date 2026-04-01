import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { Activity, Archive, Bot, Briefcase, CreditCard, FileText, Layers3, LifeBuoy, Link2, Mail, MessageSquareMore, PlugZap, Trash2, Users } from "lucide-react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import WorkspaceConsoleTabs from "../../../components/workspace/WorkspaceConsoleTabs";
import WorkspaceStatusBanner from "../../../components/workspace/WorkspaceStatusBanner";
import { useVisibility } from "../../../hooks/useVisibility";
import { extractApiErrorInfo } from "../../../services/apiError";
import { authService } from "../../../services/authService";
import { workspaceService, type WorkspaceMember, type WorkspaceOverview } from "../../../services/workspaceService";
import { useAuthStore } from "../../../store/authStore";
import { confirmAction, notify } from "../../../store/uiStore";

function formatCurrency(value: number | null | undefined, currency = "INR") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "n/a";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function readBillingMetadataDate(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const candidateKeys = [
    "next_billing_date",
    "nextBillingDate",
    "renewal_date",
    "renewalDate",
    "renews_at",
    "renewsAt",
    "subscription_renewal_date",
    "subscriptionRenewalDate",
    "current_period_end",
    "currentPeriodEnd",
    "trial_ends_at",
    "trialEndsAt",
  ];

  const record = metadata as Record<string, unknown>;
  for (const key of candidateKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getNextBillingDate(workspace?: WorkspaceOverview["workspace"] | null) {
  if (!workspace) {
    return "n/a";
  }

  return formatDateTime(
    workspace.current_period_end ||
      workspace.expiry_date ||
      workspace.trial_ends_at ||
      readBillingMetadataDate((workspace as any).billing_metadata)
  );
}

function formatLimitUsage(value: number, limit: number | null) {
  if (!limit || limit <= 0) {
    return {
      label: `${value} used`,
      percent: 0,
    };
  }

  return {
    label: `${value}/${limit}`,
    percent: Math.min(100, Math.round((value / limit) * 100)),
  };
}

function getRetentionLabel(workspace?: WorkspaceOverview["workspace"] | null) {
  if (!workspace) {
    return "Retention: Unknown";
  }

  if (workspace.deleted_at) {
    return workspace.purge_after ? "Retention: Purge: 30 Days" : "Retention: No Purge";
  }

  return workspace.purge_after ? "Retention: Purge: 30 Days" : "Retention: No Purge";
}

function StatusPill({
  label,
  value,
  className,
  Icon,
}: {
  label: string;
  value: string;
  className: string;
  Icon: any;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${className}`}
    >
      <Icon size={11} className="shrink-0" />
      <span className="opacity-70">{label}</span>
      <span className="normal-case tracking-normal">{value}</span>
    </span>
  );
}

const glassPanelClass =
  "rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.22)]";
const glassCardClass =
  "rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.18)]";
const glassInsetClass =
  "rounded-[1rem] border border-slate-200 bg-slate-50";
const glassStrongCardClass =
  "rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.18)]";
const dangerPanelClass =
  "rounded-[1.5rem] border border-rose-200 bg-rose-50 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.14)]";
const notesTextareaClass =
  "h-32 w-full rounded-[1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none";
const cardEyebrowClass = "text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500";
const primaryActionButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-[1rem] border border-sky-600 bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryActionButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const warningActionButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-[1rem] border border-orange-600 bg-orange-600 px-4 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50";
const dangerActionButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-[1rem] border border-red-600 bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(220,38,38,0.15),0_14px_28px_-16px_rgba(220,38,38,0.8)] transition duration-200 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function WorkspaceOverviewPage() {
  const router = useRouter();
  const { workspaceId } = router.query;
  const {
    canViewPage,
    canViewBilling,
    isPlatformOperator,
    isWorkspaceAdmin,
    isReadOnly,
  } = useVisibility();
  const user = useAuthStore((state) => state.user);
  const memberships = useAuthStore((state) => state.memberships);
  const projectAccesses = useAuthStore((state) => state.projectAccesses);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const setPermissionSnapshot = useAuthStore((state) => state.setPermissionSnapshot);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendInviteBusyId, setResendInviteBusyId] = useState("");
  const [copyInviteBusyId, setCopyInviteBusyId] = useState("");
  const [ownerResetBusy, setOwnerResetBusy] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [adminNotesBusy, setAdminNotesBusy] = useState(false);

  const normalizedWorkspaceId = String(workspaceId || "").trim();
  const canViewWorkspaceOverview =
    isPlatformOperator ||
    canViewPage("workspaces") ||
    (activeWorkspace?.workspace_id === normalizedWorkspaceId &&
      hasWorkspacePermission(normalizedWorkspaceId, "view_workspace"));
  const canViewOperationalCards = isPlatformOperator;
  const supportAccessGranted = Boolean(
    overview?.support.accessGranted || overview?.support.support_access_granted
  );
  const canOpenBilling = isWorkspaceAdmin || canViewBilling;
  const canMutateWorkspace = isPlatformOperator && !isReadOnly;

  useEffect(() => {
    if (!isPlatformOperator) {
      return;
    }
    setAdminNotes(String(overview?.workspace?.admin_notes || ""));
  }, [isPlatformOperator, overview?.workspace?.admin_notes]);

  useEffect(() => {
    if (!normalizedWorkspaceId || !canViewWorkspaceOverview) {
      setOverview(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const [overviewData, memberRows] = await Promise.all([
          workspaceService.getOverview(normalizedWorkspaceId),
          canViewOperationalCards ? workspaceService.listMembers(normalizedWorkspaceId).catch(() => []) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setOverview(overviewData);
          setMembers(Array.isArray(memberRows) ? memberRows : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setOverview(null);
          setMembers([]);
          setError(err?.response?.data?.error || "Failed to load workspace overview.");
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
  }, [normalizedWorkspaceId, canViewWorkspaceOverview, canViewOperationalCards]);

  const handleArchiveWorkspace = async () => {
    if (!workspace) {
      return;
    }

    const confirmed = await confirmAction(
      "Archive workspace",
      `Archive ${workspace.name}? This keeps the record for recovery and audit, but blocks normal tenant access until a platform operator reactivates it.`,
      "Archive"
    );

    if (!confirmed) {
      return;
    }

    try {
      const updated = await workspaceService.archive(workspace.id);
      const currentState = useAuthStore.getState();
      if (currentState.activeWorkspace?.workspace_id === workspace.id) {
        setPermissionSnapshot({
          user: currentState.user,
          memberships: currentState.memberships,
          activeWorkspace: {
            ...currentState.activeWorkspace,
            workspace_status: String(updated.status || currentState.activeWorkspace.workspace_status || "archived"),
            workspace_deleted_at: updated.deleted_at || currentState.activeWorkspace.workspace_deleted_at || null,
            workspace_purge_after: updated.purge_after || currentState.activeWorkspace.workspace_purge_after || null,
          },
          projectAccesses: currentState.projectAccesses,
          activeProject: currentState.activeProject,
          resolvedAccess: currentState.resolvedAccess,
        });
      }
      setOverview((current) =>
        current
          ? {
              ...current,
              workspace: {
                ...current.workspace,
                ...updated,
              },
            }
          : current
      );
      notify("Workspace archived.", "success");
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to archive workspace.";
      setError(message);
      notify(message, "error");
    }
  };

  const handleSaveAdminNotes = async () => {
    if (!workspace || !isPlatformOperator) {
      return;
    }

    setAdminNotesBusy(true);
    try {
      const updated = await workspaceService.update(workspace.id, {
        adminNotes: adminNotes.trim(),
      });

      setOverview((current) =>
        current
          ? {
              ...current,
              workspace: {
                ...current.workspace,
                ...updated,
              },
            }
          : current
      );
      setAdminNotes(String(updated.admin_notes || ""));
      notify("Internal notes saved.", "success");
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to save internal notes.";
      setError(message);
      notify(message, "error");
    } finally {
      setAdminNotesBusy(false);
    }
  };

  const handleCopyInviteLink = async (member: WorkspaceMember) => {
    if (!member.invite_link) {
      notify("No invite link is available for this member.", "error");
      return;
    }

    setCopyInviteBusyId(member.user_id);
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard access is not available in this browser.");
      }
      await navigator.clipboard.writeText(member.invite_link);
      notify("Invite link copied to clipboard.", "success");
    } catch {
      notify("Failed to copy invite link.", "error");
    } finally {
      setCopyInviteBusyId("");
    }
  };

  const workspace = overview?.workspace || null;
  const metrics =
    overview?.metrics || {
      members: 0,
      openConversations: 0,
      conversations: 0,
      leads: 0,
      campaigns: 0,
      integrations: 0,
      projects: 0,
      bots: 0,
    };
  const wallet =
    overview?.wallet || {
      balance: 0,
      enabled: false,
      recentTransactions: [],
    };
  const supportOverview =
    overview?.support || {
      openRequests: 0,
      totalRequests: 0,
      activeAccess: 0,
    };
  const integrationConnected = metrics.integrations > 0;
  const integrationStatusLabel = integrationConnected ? "Connected" : "Disconnected";
  const integrationStatusClass = integrationConnected
    ? "bg-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]"
    : "bg-rose-400 shadow-[0_0_0_6px_rgba(244,63,94,0.12)]";
  const workspaceLifecycleState = workspace?.deleted_at
    ? "deleted"
    : String(workspace?.status || "").toLowerCase() === "archived"
      ? "archived"
      : String(workspace?.status || "").toLowerCase() === "suspended"
        ? "on hold"
        : String(workspace?.status || "unknown").toLowerCase();
  const holdActionLabel =
    workspace?.status === "archived"
      ? "Restore Workspace"
      : workspace?.status === "suspended"
        ? "Reactivate Workspace"
        : "Place Account Hold";
  const holdActionClass =
    workspace?.status === "archived" || workspace?.status === "suspended"
      ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
      : "border-rose-500 bg-rose-600 text-white hover:bg-rose-700 shadow-sm";
  const workspaceStatusLabel = String(workspace?.status || "unknown").toUpperCase();
  const workspaceStatusClass =
    String(workspace?.status || "").toLowerCase() === "active"
      ? "border-emerald-300 bg-emerald-100 text-emerald-700"
      : "border-rose-300 bg-rose-100 text-rose-700";
  const workspaceLogoSrc =
    (workspace as any)?.logo_url ||
    (workspace as any)?.avatar_url ||
    (workspace as any)?.logo ||
    null;
  const workspaceInitials =
    (workspace?.name || "Workspace")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "W";
  const lifecycleBadgeClass =
    workspaceLifecycleState === "active"
      ? "border-emerald-300 bg-emerald-100 text-emerald-800"
      : workspaceLifecycleState === "on hold"
        ? "border-amber-300 bg-amber-100 text-amber-800"
        : workspaceLifecycleState === "deleted"
          ? "border-rose-300 bg-rose-100 text-rose-700"
          : "border-slate-300 bg-slate-100 text-slate-700";
  const subscriptionBadgeClass = String(workspace?.subscription_status || "").toLowerCase() === "active"
    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
    : /past_due|canceled|expired|locked|suspended/.test(String(workspace?.subscription_status || "").toLowerCase())
      ? "border-amber-300 bg-amber-100 text-amber-800"
      : "border-slate-300 bg-slate-100 text-slate-700";
  const purgeBadgeClass = workspace?.deleted_at
    ? workspace?.purge_after
      ? "border-rose-300 bg-rose-100 text-rose-700"
      : "border-rose-300 bg-rose-100 text-rose-700"
    : workspace?.purge_after
      ? "border-amber-300 bg-amber-100 text-amber-800"
      : "border-slate-300 bg-slate-100 text-slate-700";
  const supportAccessStatusLabel = supportAccessGranted ? "Granted" : "Not granted";
  const supportAccessStatusClass = supportAccessGranted
    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
    : "border-slate-300 bg-slate-100 text-slate-600";
  const lifecycleLabel = workspaceLifecycleState === "active"
    ? "Active"
    : workspaceLifecycleState === "on hold"
      ? "On Hold"
      : workspaceLifecycleState === "deleted"
        ? "Deleted"
        : String(workspaceLifecycleState || "Unknown");
  const billingLabel = String(workspace?.subscription_status || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const retentionLabel = getRetentionLabel(workspace);
  const memberSinceLabel = formatDateTime(workspace?.created_at);
  const nextBillingDateLabel = getNextBillingDate(workspace);
  const usageCards = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [
      { label: "Users", value: overview.metrics.members, limit: overview.limits.users, icon: Users },
      { label: "Projects", value: overview.metrics.projects, limit: overview.limits.projects, icon: Briefcase },
      { label: "Campaigns", value: overview.metrics.campaigns, limit: overview.limits.campaigns, icon: Layers3 },
      { label: "Integrations", value: overview.metrics.integrations, limit: overview.limits.integrations, icon: PlugZap },
      { label: "Bots", value: overview.metrics.bots, limit: overview.limits.bots, icon: Bot },
    ];
  }, [overview]);
  const handleDeleteWorkspace = async () => {
    if (!workspace) {
      return;
    }

    if (
      !(await confirmAction(
        "Schedule workspace deletion",
        `This will soft-delete ${workspace.name}, hide tenant data from normal views, and schedule permanent purge after 30 days.`,
        "Schedule deletion"
      ))
    ) {
      return;
    }

    try {
      const updated = await workspaceService.delete(workspace.id);
      const currentState = useAuthStore.getState();
      if (currentState.activeWorkspace?.workspace_id === workspace.id) {
        setPermissionSnapshot({
          user: currentState.user,
          memberships: currentState.memberships,
          activeWorkspace: {
            ...currentState.activeWorkspace,
            workspace_status: String(updated.status || currentState.activeWorkspace.workspace_status || "archived"),
            workspace_deleted_at: updated.deleted_at || currentState.activeWorkspace.workspace_deleted_at || null,
            workspace_purge_after: updated.purge_after || currentState.activeWorkspace.workspace_purge_after || null,
          },
          projectAccesses: currentState.projectAccesses,
          activeProject: currentState.activeProject,
          resolvedAccess: currentState.resolvedAccess,
        });
      }
      setOverview((current) =>
        current
          ? {
              ...current,
              workspace: {
                ...current.workspace,
                ...updated,
              },
            }
          : current
      );
      notify("Workspace scheduled for deletion.", "success");
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to delete workspace.";
      setError(message);
      notify(message, "error");
    }
  };

  const handleWorkspaceHoldToggle = async () => {
    if (!workspace) {
      return;
    }

    const nextStatus =
      workspace.status === "archived"
        ? "active"
        : workspace.status === "suspended"
          ? "active"
          : "suspended";
    const confirmed = await confirmAction(
      nextStatus === "suspended" ? "Place account hold" : "Reactivate workspace",
      nextStatus === "suspended"
        ? `This will suspend ${workspace.name} and stop normal tenant access until it is reactivated.`
        : `This will restore ${workspace.name} to active status.`,
      nextStatus === "suspended" ? "Place hold" : "Reactivate"
    );

    if (!confirmed) {
      return;
    }

    try {
      const updated =
        workspace.deleted_at && nextStatus === "active"
          ? await workspaceService.restore(workspace.id)
          : await workspaceService.update(workspace.id, { status: nextStatus });
      setOverview((current) =>
        current
          ? {
              ...current,
              workspace: {
                ...current.workspace,
                ...updated,
              },
            }
          : current
      );
      notify(
        nextStatus === "suspended"
          ? "Workspace placed on hold."
          : workspace.deleted_at
            ? "Workspace restored."
            : "Workspace reactivated.",
        "success"
      );
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to update workspace status.";
      setError(message);
      notify(message, "error");
    }
  };

  const handleSupportLogin = async () => {
    if (!workspace) {
      return;
    }

    const confirmed = await confirmAction(
      "Enter workspace",
      `Switch into impersonation mode for ${workspace.name}?`,
      "Enter workspace"
    );

    if (!confirmed) {
      return;
    }

    try {
      const session = await authService.startWorkspaceImpersonation(workspace.id, {
        durationHours: 4,
        consentNote: "Admin impersonation session from workspace overview",
      });
      setPermissionSnapshot({
        user: session.user || user,
        memberships,
        activeWorkspace: session.activeWorkspace,
        projectAccesses,
        activeProject: null,
        resolvedAccess: session.resolvedAccess,
      });
      notify("Workspace impersonation started.", "success");
      router.replace(`/workspaces/${workspace.id}`).catch(() => undefined);
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to enter workspace.";
      setError(message);
      notify(message, "error");
    }
  };

  const handleResendInvite = async (member: WorkspaceMember) => {
    if (!workspace?.id || !member.user_id) {
      return;
    }

    try {
      setResendInviteBusyId(member.user_id);
      await workspaceService.resendMemberInvite(workspace.id, { userId: member.user_id });
      notify(`Invite resent to ${member.email || member.name || "workspace member"}.`, "success");
    } catch (err: any) {
      const apiError = extractApiErrorInfo(
        err,
        "Failed to resend invite.",
        "Invite Resend Failed"
      );
      setError(apiError.message);
      notify({
        tone: "error",
        title: apiError.title,
        message: apiError.message,
        details: apiError.details,
        durationMs: apiError.details.length > 0 ? 9000 : 5000,
      });
    } finally {
      setResendInviteBusyId("");
    }
  };

  const handleResetOwnerPassword = async () => {
    if (!workspace?.id) {
      return;
    }

    const confirmed = await confirmAction(
      "Reset owner password",
      `Send a password reset OTP to the owner of ${workspace.name}?`,
      "Send reset"
    );

    if (!confirmed) {
      return;
    }

    try {
      setOwnerResetBusy(true);
      await workspaceService.emergencyResetOwnerPassword(workspace.id);
      notify("Owner password reset email sent.", "success");
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to reset owner password.";
      setError(message);
      notify(message, "error");
    } finally {
      setOwnerResetBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50">
        {!canViewWorkspaceOverview ? (
        <PageAccessNotice
          title="Workspace overview is restricted for this role"
          description="Workspace overview is available to platform operators and workspace members with view access."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : loading ? (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <section className={glassCardClass + " border-dashed p-6 text-sm text-slate-500"}>
            Loading workspace overview...
          </section>
        </div>
      ) : error || !workspace || !metrics || !wallet ? (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <section className="rounded-[1.5rem] border border-rose-200 bg-white p-6 text-sm text-rose-700 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.18)]">
            {error || "Workspace overview could not be loaded."}
          </section>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <WorkspaceStatusBanner workspace={workspace} />
          <WorkspaceConsoleTabs workspaceId={workspace.id} activeSlug="" />

          <section className={`${glassPanelClass} p-6`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <div className={cardEyebrowClass}>
                    Workspace Overview
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${workspaceStatusClass}`}>
                    {workspaceStatusLabel}
                  </span>
                </div>
                <div className="mt-3 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 text-xs font-semibold text-white shadow-sm">
                    {workspaceLogoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={String(workspaceLogoSrc)}
                        alt={`${workspace.name} logo`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      workspaceInitials
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                      {workspace.name}
                    </h1>
                    <div className="mt-2 text-sm text-slate-500">
                      Member since {memberSinceLabel}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <StatusPill
                        label="Lifecycle"
                        value={lifecycleLabel}
                        className={lifecycleBadgeClass}
                        Icon={Activity}
                      />
                      <StatusPill
                        label="Billing"
                        value={billingLabel}
                        className={subscriptionBadgeClass}
                        Icon={CreditCard}
                      />
                      <StatusPill
                        label="Retention"
                        value={retentionLabel.replace(/^Retention:\s*/i, "")}
                        className={purgeBadgeClass}
                        Icon={Trash2}
                      />
                    </div>
                  </div>
                </div>
              </div>
              {isPlatformOperator ? (
                <div className="flex shrink-0">
                  <Link
                    href={`/workspaces/${workspace.id}/billing`}
                    className={primaryActionButtonClass}
                  >
                    <CreditCard size={16} />
                    Manage Billing & Wallet
                  </Link>
                </div>
              ) : null}
            </div>

            <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 items-stretch">
              <section className={glassCardClass + " h-full flex flex-col"}>
                <div className="flex items-center justify-between gap-3">
                  <div className={cardEyebrowClass}>
                    Pulse: Usage Rate
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500 ">
                    <Activity size={20} className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
                <div className="mt-4 grid flex-1 grid-cols-2 gap-4">
                  {usageCards.map((card) => {
                    const usage = formatLimitUsage(card.value, card.limit);
                    const Icon = card.icon;
                    return (
                      <section
                        key={card.label}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/[0.02] p-4"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">{card.label}</div>
                          <div className="mt-1 text-sm text-slate-500">{usage.label}</div>
                        </div>
                        <Icon size={20} className="h-5 w-5 shrink-0 text-slate-400" />
                      </section>
                    );
                  })}
                </div>
              </section>

              <section className={glassCardClass + " h-full flex flex-col"}>
                <div className="flex items-center justify-between gap-3">
                  <div className={cardEyebrowClass}>
                    Pulse: Wallet Balance
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500 ">
                    <CreditCard size={20} />
                  </div>
                </div>
                <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                  {canOpenBilling && wallet ? formatCurrency(wallet.balance, workspace.currency || "INR") : "Billing locked"}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {canOpenBilling && wallet
                    ? wallet.enabled
                      ? "Wallet enabled for this workspace."
                      : "Wallet is currently inactive."
                    : "Open billing access to review wallet state."}
                </div>
                {canOpenBilling && wallet ? (
                  <div className={glassInsetClass + " mt-4 px-4 py-3"}>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Recent movement</div>
                    <div className="mt-2 text-sm font-medium text-slate-900">
                      {wallet.recentTransactions.length
                        ? `${wallet.recentTransactions.length} transaction${wallet.recentTransactions.length === 1 ? "" : "s"} in history`
                        : "No wallet transactions recorded yet."}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className={glassCardClass + " h-full flex flex-col"}>
                <div className="flex items-center justify-between gap-3">
                  <div className={cardEyebrowClass}>
                    Pulse: Activity
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500 ">
                    <MessageSquareMore size={20} />
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div className={glassInsetClass + " px-4 py-3"}>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Open Conversations</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{metrics.openConversations}</div>
                    <div className="mt-1 text-sm text-slate-500">{metrics.conversations} total conversations</div>
                  </div>
                  <div className={glassInsetClass + " px-4 py-3"}>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Leads</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{metrics.leads}</div>
                    <div className="mt-1 text-sm text-slate-500">{metrics.campaigns} campaigns in motion</div>
                  </div>
                </div>
              </section>
            </section>

            <section className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
              <section className={glassStrongCardClass + " h-full flex flex-col"}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className={cardEyebrowClass}>
                      Support Impersonation
                    </div>
                    <div className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
                      Enter workspace with operator access
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${supportAccessStatusClass}`}>
                      Status: {supportAccessStatusLabel}
                    </span>
                    <span className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-900 `}>
                      <span className={`h-2.5 w-2.5 rounded-full ${integrationStatusClass}`} />
                      Meta: {integrationStatusLabel}
                    </span>
                  </div>
                </div>
                <p className="mt-4 max-w-xl text-sm leading-6 text-slate-500">
                  This is the fastest path for live support. It should stand out so operators can find it immediately when a client is blocked.
                </p>
                {isPlatformOperator && supportAccessGranted ? (
                  <button
                    type="button"
                    onClick={handleSupportLogin}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[1rem] border border-sky-500 bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(14,165,233,0.35),0_12px_30px_-12px_rgba(14,165,233,0.7)] transition duration-200 hover:bg-sky-700 hover:shadow-[0_0_0_1px_rgba(14,165,233,0.45),0_16px_36px_-12px_rgba(14,165,233,0.8)]"
                  >
                    Enter Workspace
                  </button>
                ) : (
                  <div className="mt-5 rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 ">
                    Support access is not currently granted.
                  </div>
                )}
              </section>

              <section className={glassCardClass + " h-full flex flex-col"}>
                <div className="flex items-center justify-between gap-3">
                  <div className={cardEyebrowClass}>
                    Support Ops
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 ">
                    {supportOverview.openRequests} open
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className={glassInsetClass + " px-4 py-3"}>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Support Requests</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{supportOverview.openRequests}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {supportOverview.totalRequests} total requests
                    </div>
                  </div>
                  <div className={glassInsetClass + " px-4 py-3"}>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Active Grants</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{supportOverview.activeAccess}</div>
                    <div className="mt-1 text-sm text-slate-500">Support access currently active</div>
                  </div>
                </div>
                <div className={glassInsetClass + " mt-4 flex items-center justify-between gap-3 px-4 py-3"}>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Primary WhatsApp / Meta integration</div>
                    <div className="text-xs text-slate-500">
                      {integrationConnected
                        ? `${metrics.integrations} integration${metrics.integrations === 1 ? "" : "s"} connected`
                        : "No active integrations linked"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      If a bot is disconnected, treat it as a support issue.
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                      integrationConnected
                        ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                        : "border-rose-300 bg-rose-100 text-rose-700"
                    }`}
                  >
                    {integrationStatusLabel}
                  </span>
                </div>
              </section>
            </section>

            {canViewOperationalCards ? (
              <section className="mt-4 grid gap-4 lg:grid-cols-2">
                <section className={glassCardClass + " flex flex-col"}>
                  <div className="flex items-center justify-between gap-3">
                    <div className={cardEyebrowClass}>
                      Team & Invites
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 ">
                      {metrics.members} active
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {members.filter((member) => String(member.status || "").toLowerCase() === "invited").length ? (
                      members
                        .filter((member) => String(member.status || "").toLowerCase() === "invited")
                        .map((member) => (
                          <div key={member.user_id} className={`flex flex-col gap-4 ${glassInsetClass} px-4 py-4 md:flex-row md:items-center md:justify-between`}>
                            <div className="min-w-0 space-y-1">
                              <div className="text-sm font-semibold text-slate-900">
                                {member.name || member.email || member.user_id}
                              </div>
                              <div className="text-xs text-slate-500">
                                {member.email || "No email"} · {String(member.role || "").replace(/_/g, " ")}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleCopyInviteLink(member)}
                                disabled={!member.invite_link || copyInviteBusyId === member.user_id}
                                className={`${secondaryActionButtonClass} px-3`}
                                aria-label="Copy Link"
                                title="Copy Link"
                              >
                                <Link2 size={14} />
                                <span className="hidden sm:inline">
                                  {copyInviteBusyId === member.user_id ? "Copying..." : "Copy Link"}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResendInvite(member)}
                                disabled={resendInviteBusyId === member.user_id}
                                className={primaryActionButtonClass}
                              >
                                <Mail size={14} />
                                {resendInviteBusyId === member.user_id ? "Resending..." : "Resend Invite"}
                              </button>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="rounded-[1rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 ">
                        No pending invites at the moment.
                      </div>
                    )}
                  </div>
                </section>

                <section className={glassCardClass + " flex flex-col"}>
                  <div className={cardEyebrowClass}>
                    Subscription Details
                  </div>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-slate-900">
                    <div>Plan: {workspace.subscription_plan_name || workspace.plan_id || "starter"}</div>
                    <div>Status: {workspace.subscription_status || "unknown"}</div>
                    <div>Workspace: {workspace.status}</div>
                    <div>Member Since: {memberSinceLabel}</div>
                    <div>Created At: {memberSinceLabel}</div>
                    <div>Next Billing Date: {nextBillingDateLabel}</div>
                    <div>Expiry: {formatDateTime(workspace.expiry_date)}</div>
                    <div>Grace End: {formatDateTime(workspace.grace_period_end)}</div>
                  </div>
                </section>
              </section>
            ) : (
              <section className={glassCardClass + " mt-4 flex flex-col"}>
                <div className={cardEyebrowClass}>
                  Subscription Details
                </div>
                <div className="mt-4 space-y-3 text-sm leading-6 text-slate-900">
                  <div>Plan: {workspace.subscription_plan_name || workspace.plan_id || "starter"}</div>
                  <div>Status: {workspace.subscription_status || "unknown"}</div>
                  <div>Workspace: {workspace.status}</div>
                  <div>Member Since: {memberSinceLabel}</div>
                  <div>Created At: {memberSinceLabel}</div>
                  <div>Next Billing Date: {nextBillingDateLabel}</div>
                  <div>Expiry: {formatDateTime(workspace.expiry_date)}</div>
                  <div>Grace End: {formatDateTime(workspace.grace_period_end)}</div>
                </div>
              </section>
            )}

            {canOpenBilling ? (
              <section className={glassCardClass + " mt-4 flex flex-col"}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Recent Wallet Activity
                </div>
                <div className="mt-4 space-y-3">
                  {wallet.recentTransactions.length ? (
                    wallet.recentTransactions.map((row) => (
                      <div
                        key={row.id}
                        className={glassInsetClass + " px-4 py-3"}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900">{row.transaction_type}</div>
                          <div className="text-sm text-slate-900">{formatCurrency(row.amount, workspace.currency || "INR")}</div>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.created_at ? new Date(row.created_at).toLocaleString() : "Unknown time"}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 ">
                      No wallet transactions recorded yet.
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {isPlatformOperator ? (
              <section className={glassCardClass + " mt-4 pb-4"}>
                <div className="flex items-center justify-between gap-3">
                  <div className={cardEyebrowClass}>
                    Internal Notes
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 ">
                    Super Admin Only
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Private context for platform operators. This is never shown to tenant users.
                </p>
                <div className="mt-3">
                  <textarea
                    className={notesTextareaClass}
                    value={adminNotes}
                    onChange={(event) => setAdminNotes(event.target.value)}
                    placeholder="VIP client - extra support needed."
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveAdminNotes}
                    disabled={adminNotesBusy}
                    className={primaryActionButtonClass}
                  >
                    <FileText size={14} />
                    {adminNotesBusy ? "Saving..." : "Save Notes"}
                  </button>
                </div>
              </section>
            ) : null}

            {isPlatformOperator ? (
              <section className={`${dangerPanelClass} mt-4 p-6`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-600">
                    Danger Zone
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${workspaceStatusClass}`}>
                    {workspaceStatusLabel}
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex flex-col gap-3 rounded-[1rem] border border-slate-200 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Temporarily suspend access and billing.</div>
                      <div className="mt-1 text-sm text-slate-500">This will place the workspace on hold until reactivated.</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleWorkspaceHoldToggle}
                      disabled={!canMutateWorkspace}
                      className={`rounded-[1rem] px-4 py-3 text-sm font-semibold transition duration-200 ${holdActionClass} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {holdActionLabel}
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 rounded-[1rem] border border-rose-500/20 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Archive workspace and lock data.</div>
                      <div className="mt-1 text-sm text-slate-500">Archive keeps the record for recovery and audit.</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleArchiveWorkspace}
                      disabled={!canMutateWorkspace}
                      className={dangerActionButtonClass}
                    >
                      <Archive size={14} />
                      Archive Workspace
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 rounded-[1rem] border border-rose-500/20 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Permanently destroy this workspace.</div>
                      <div className="mt-1 text-sm text-slate-500">This action is destructive and cannot be undone.</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDeleteWorkspace}
                      disabled={!canMutateWorkspace}
                      className={dangerActionButtonClass}
                    >
                      <Trash2 size={14} />
                      Delete Workspace
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {isPlatformOperator ? (
              <section className="mt-4 rounded-[1.5rem] border border-slate-200 border-l-4 border-l-orange-500 bg-white p-6 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.18)]">
                <div className={cardEyebrowClass}>Reset Owner Password</div>
                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-sm text-slate-500">
                    Send a password reset OTP to the workspace owner.
                  </div>
                  <button
                    type="button"
                    onClick={handleResetOwnerPassword}
                    disabled={ownerResetBusy}
                    className={warningActionButtonClass}
                  >
                    {ownerResetBusy ? "Sending..." : "Reset Owner Password"}
                  </button>
                </div>
              </section>
            ) : null}

          </section>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
