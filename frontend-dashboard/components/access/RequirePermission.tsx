import { ReactNode } from "react";

import { useVisibility } from "../../hooks/useVisibility";
import { useAuthStore } from "../../store/authStore";

type RequirePermissionProps = {
  children: ReactNode;
  permissionKey?: string;
  roles?: Array<"workspace_admin" | "editor" | "agent" | "viewer">;
  platformRoles?: Array<"super_admin" | "developer">;
  fallback?: ReactNode;
};

export default function RequirePermission({
  children,
  permissionKey,
  roles,
  platformRoles,
  fallback = null,
}: RequirePermissionProps) {
  const user = useAuthStore((state) => state.user);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { workspaceRole, isPlatformOperator, isReadOnly } = useVisibility();

  const currentPlatformRole = String(user?.role || "").trim().toLowerCase();
  const hasAllowedPlatformRole = Array.isArray(platformRoles) && platformRoles.length > 0
    ? platformRoles.includes(currentPlatformRole as "super_admin" | "developer")
    : false;
  const hasAllowedWorkspaceRole = Array.isArray(roles) && roles.length > 0
    ? roles.includes(String(workspaceRole || "").trim().toLowerCase() as "workspace_admin" | "editor" | "agent" | "viewer")
    : false;
  const hasRequiredPermission = permissionKey
    ? hasWorkspacePermission(activeWorkspace?.workspace_id, permissionKey)
    : false;
  const isReadOnlyWritePermission =
    Boolean(permissionKey) &&
    !String(permissionKey || "").startsWith("view_") &&
    !String(permissionKey || "").startsWith("can_view") &&
    permissionKey !== "view_workspace";

  const allowed =
    hasAllowedPlatformRole ||
    (isPlatformOperator && (!platformRoles || platformRoles.length === 0) && !roles && !permissionKey) ||
    hasAllowedWorkspaceRole ||
    (hasRequiredPermission && !(isReadOnly && isReadOnlyWritePermission)) ||
    (!permissionKey && !roles && !platformRoles);

  return allowed ? <>{children}</> : <>{fallback}</>;
}
