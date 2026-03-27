import { permissionService } from "./permissionService";
import { useAuthStore } from "../store/authStore";

export async function refreshPermissionSnapshot() {
  const data = await permissionService.me();
  const state = useAuthStore.getState();
  const activeProjectId = state.activeProject?.id || null;

  state.setPermissionSnapshot({
    user: data.user || state.user,
    memberships: data.memberships || [],
    activeWorkspace: data.activeWorkspace || null,
    projectAccesses: data.projectAccesses || [],
    activeProject: activeProjectId ? state.activeProject : null,
    resolvedAccess: data.resolvedAccess || null,
  });

  return data;
}
