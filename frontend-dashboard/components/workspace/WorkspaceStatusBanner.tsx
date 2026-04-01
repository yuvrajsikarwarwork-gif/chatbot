import { useVisibility } from "../../hooks/useVisibility";

interface WorkspaceStatusBannerProps {
  workspace?: {
    id?: string;
    name?: string;
    status?: string | null;
    deleted_at?: string | null;
    purge_after?: string | null;
    subscription_status?: string | null;
    expiry_date?: string | null;
    grace_period_end?: string | null;
    lock_reason?: string | null;
  } | null;
}

export default function WorkspaceStatusBanner({
  workspace,
}: WorkspaceStatusBannerProps) {
  const { isPlatformOperator } = useVisibility();

  if (!workspace) {
    return null;
  }

  if (isPlatformOperator) {
    return null;
  }

  const workspaceStatus = String(workspace.status || "").toLowerCase();
  const subscriptionStatus = String(workspace.subscription_status || "").toLowerCase();

  const isArchived = workspaceStatus === "archived" || Boolean(workspace.deleted_at);
  const isOnHold =
    !isArchived &&
    (workspaceStatus === "suspended" ||
      workspaceStatus === "locked" ||
      workspaceStatus === "paused" ||
      workspaceStatus === "inactive" ||
      subscriptionStatus === "past_due" ||
      subscriptionStatus === "overdue" ||
      subscriptionStatus === "expired" ||
      subscriptionStatus === "canceled");

  if (!isArchived && !isOnHold) {
    return null;
  }

  const tone = isArchived
    ? "border-rose-300 bg-rose-50 text-rose-700"
    : "border-amber-300 bg-amber-50 text-amber-700";
  const title = isArchived
    ? "Workspace Archived"
    : subscriptionStatus === "past_due" || subscriptionStatus === "expired" || subscriptionStatus === "canceled"
      ? "Subscription Expired - Read Only Mode"
      : "Workspace Read Only Mode";
  const message = isArchived
    ? "This workspace has been archived. You have read-only access to your leads and history."
    : "Editing, saves, and writes are disabled for everyone until the workspace returns to an active billing state.";

  return (
    <section className={`rounded-[1.5rem] border px-5 py-4 shadow-sm ${tone}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] opacity-80">
        {workspace.name || "Workspace"}
      </div>
      <div className="mt-2 text-[1.1rem] font-black tracking-[-0.02em]">
        {title}
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 opacity-90">{message}</p>
      {!isArchived && workspace.id ? (
        <div className="mt-4">
          <a
            href={`/workspaces/${workspace.id}/billing`}
            className="inline-flex items-center rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 transition hover:bg-amber-100"
            data-allow-workspace-action="true"
          >
            Update Billing
          </a>
        </div>
      ) : null}
    </section>
  );
}
