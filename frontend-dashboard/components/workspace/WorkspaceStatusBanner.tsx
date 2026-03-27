interface WorkspaceStatusBannerProps {
  workspace?: {
    name?: string;
    status?: string | null;
    subscription_status?: string | null;
    expiry_date?: string | null;
    grace_period_end?: string | null;
    lock_reason?: string | null;
  } | null;
}

export default function WorkspaceStatusBanner({
  workspace,
}: WorkspaceStatusBannerProps) {
  if (!workspace) {
    return null;
  }

  const workspaceStatus = String(workspace.status || "").toLowerCase();
  const subscriptionStatus = String(workspace.subscription_status || "").toLowerCase();

  const formatDate = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString();
  };

  let tone = "";
  let message = "";

  if (workspaceStatus === "locked") {
    tone = "border-red-200 bg-red-50 text-red-700";
    message = workspace.lock_reason || "This workspace is locked.";
  } else if (subscriptionStatus === "expired" || subscriptionStatus === "canceled") {
    tone = "border-red-200 bg-red-50 text-red-700";
    message = "Subscription is inactive. New changes are unavailable.";
  } else if (subscriptionStatus === "overdue") {
    tone = "border-amber-200 bg-amber-50 text-amber-700";
    message = `Subscription is overdue${workspace.grace_period_end ? ` until ${formatDate(workspace.grace_period_end)}` : ""}.`;
  } else if (workspace.expiry_date) {
    const expiry = new Date(workspace.expiry_date);
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    if (expiry.getTime() <= soon.getTime()) {
      tone = "border-blue-200 bg-blue-50 text-blue-700";
      message = `Subscription expires on ${formatDate(workspace.expiry_date)}.`;
    }
  }

  if (!message) {
    return null;
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${tone}`}>
      <span className="font-semibold">{workspace.name || "Workspace"}:</span> {message}
    </div>
  );
}
