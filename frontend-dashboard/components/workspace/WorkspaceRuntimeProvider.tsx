import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

import { workspaceService, type WorkspaceOverview } from "../../services/workspaceService";
import { useAuthStore } from "../../store/authStore";

type WorkspaceOperationalState = {
  workspace: WorkspaceOverview["workspace"] | null;
  loading: boolean;
  status: "active" | "read_only" | "archived";
  isReadOnly: boolean;
  banner: {
    title: string;
    description: string;
    tone: "warning" | "danger";
    actionHref?: string;
    actionLabel?: string;
  } | null;
};

const DEFAULT_STATE: WorkspaceOperationalState = {
  workspace: null,
  loading: false,
  status: "active",
  isReadOnly: false,
  banner: null,
};

const WorkspaceRuntimeContext = createContext<WorkspaceOperationalState>(DEFAULT_STATE);

function resolveOperationalState(workspace: WorkspaceOverview["workspace"] | null): WorkspaceOperationalState {
  if (!workspace) {
    return DEFAULT_STATE;
  }

  const workspaceStatus = String(workspace.status || "").trim().toLowerCase();
  const subscriptionStatus = String(workspace.subscription_status || "").trim().toLowerCase();
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

  if (isArchived) {
    return {
      workspace,
      loading: false,
      status: "archived",
      isReadOnly: true,
      banner: {
        title: "Workspace Archived",
        description:
          "This workspace has been archived. You have read-only access to your leads and history.",
        tone: "danger",
      },
    };
  }

  if (isOnHold) {
    return {
      workspace,
      loading: false,
      status: "read_only",
      isReadOnly: true,
      banner: {
        title:
          subscriptionStatus === "past_due" || subscriptionStatus === "expired" || subscriptionStatus === "canceled"
            ? "Subscription Expired - Read Only Mode"
            : "Workspace Read Only Mode",
        description:
          "Editing is disabled for everyone until the workspace returns to an active billing state.",
        tone: "warning",
        actionHref: workspace.id ? `/workspaces/${workspace.id}/billing` : undefined,
        actionLabel: "Update Billing",
      },
    };
  }

  return {
    workspace,
    loading: false,
    status: "active",
    isReadOnly: false,
    banner: null,
  };
}

export function WorkspaceRuntimeProvider({ children }: { children: ReactNode }) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const userRole = useAuthStore((state) => state.user?.role);
  const resolvedAccess = useAuthStore((state) => state.resolvedAccess);
  const supportAccess = Boolean(resolvedAccess?.support_access) || Boolean(activeWorkspace?.permissions_json?.support_mode);
  const [workspace, setWorkspace] = useState<WorkspaceOverview["workspace"] | null>(null);
  const [loading, setLoading] = useState(false);
  const isPlatformOperator =
    userRole === "super_admin" || userRole === "developer";

  useEffect(() => {
    const workspaceId = activeWorkspace?.workspace_id;
    if (isPlatformOperator && !supportAccess) {
      setWorkspace(null);
      setLoading(false);
      return;
    }

    if (!workspaceId) {
      setWorkspace(null);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    workspaceService
      .getOverview(workspaceId)
      .then((data) => {
        if (!alive) return;
        setWorkspace(data?.workspace || null);
      })
      .catch((err) => {
        console.error("Failed to load workspace runtime state", err);
        if (!alive) return;
        setWorkspace(null);
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [activeWorkspace?.workspace_id, isPlatformOperator, supportAccess]);

  const value = useMemo<WorkspaceOperationalState>(() => {
    const resolved = resolveOperationalState(workspace);
    return {
      ...resolved,
      loading,
    };
  }, [loading, workspace]);

  return <WorkspaceRuntimeContext.Provider value={value}>{children}</WorkspaceRuntimeContext.Provider>;
}

export function useWorkspaceRuntime() {
  return useContext(WorkspaceRuntimeContext);
}
