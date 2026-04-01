import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { permissionService } from '../services/permissionService';
import { sessionService } from '../services/sessionService';
import { useAuthStore } from '../store/authStore';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const setPermissionSnapshot = useAuthStore((state) => state.setPermissionSnapshot);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const memberships = useAuthStore((state) => state.memberships);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const resolvedAccess = useAuthStore((state) => state.resolvedAccess);
  const isPlatformOperator =
    user?.role === "super_admin" || user?.role === "developer";
  const supportModeActive =
    Boolean(resolvedAccess?.support_access) || Boolean(activeWorkspace?.permissions_json?.support_mode);
  const publicNoAuthPages = [
    "/pricing/custom",
  ];
  const workspaceZoneSpecialRoutes = [
    "/users-access/overrides",
    "/workspaces/[workspaceId]/members-access",
    "/workspaces/[workspaceId]/members-access/overrides",
  ];
  const platformShellRoutes = [
    "/workspaces",
    "/permissions",
    "/plans",
    "/logs",
    "/tickets",
    "/support/tickets",
    "/system-settings",
    "/users-access",
    "/platform-accounts",
  ];
  const nativeSuperAdminAllowedWorkspaceRoutes = [
    /^\/workspaces$/,
    /^\/workspaces\/[^/]+$/,
    /^\/workspaces\/[^/]+\/billing$/,
  ];
  const isNativeSuperAdminAllowedWorkspaceRoute = nativeSuperAdminAllowedWorkspaceRoutes.some((pattern) =>
    pattern.test(router.pathname)
  );
  const workspaceZoneExactRoutes = [
    "/agents",
    "/analytics",
    "/audit",
    "/billing",
    "/bots",
    "/campaign-create",
    "/campaign-detail",
    "/campaigns",
    "/conversations",
    "/dashboard",
    "/flow-builder",
    "/flows",
    "/lead-forms",
    "/leads",
    "/queue",
    "/segments",
    "/settings",
    "/templates",
    "/users",
    "/support",
    "/support/new",
    "/support/access",
    ...workspaceZoneSpecialRoutes,
  ];
  const isWorkspaceZoneRoute =
    workspaceZoneExactRoutes.some((route) => router.pathname === route) ||
    (/^\/workspaces\/\[[^/]+\]\/(?!billing$|members-access$|overrides$|support-access$).+/.test(router.pathname));
  const isPlatformRoute = platformShellRoutes.some((route) =>
    route === "/workspaces"
      ? router.pathname === route
      : router.pathname === route || router.pathname.startsWith(`${route}/`)
  ) && !isWorkspaceZoneRoute;
  const isPlatformShellOnlyRoute = isPlatformRoute || isNativeSuperAdminAllowedWorkspaceRoute;
  const authRedirectPages = [
    '/login',
    '/logout',
    '/register',
    '/accept-invite',
    '/invite/[token]',
    '/forgot-password',
    '/reset-password',
  ];
  const getLayout = (Component as any).getLayout ?? ((page: any) => page);

  const getHomeRoute = () => {
    const currentUser = useAuthStore.getState().user;
    return currentUser?.role === "super_admin" || currentUser?.role === "developer"
      ? "/workspaces"
      : "/projects";
  };

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!isPlatformOperator) {
      return;
    }

    if (supportModeActive) {
      if (isPlatformRoute) {
        const targetWorkspaceId = activeWorkspace?.workspace_id || null;
        const targetRoute = targetWorkspaceId ? `/workspaces/${targetWorkspaceId}` : "/workspaces";
        if (router.pathname !== targetRoute) {
          router.replace(targetRoute).catch(() => undefined);
        }
      }
      return;
    }

    if (isPlatformRoute || isNativeSuperAdminAllowedWorkspaceRoute) {
      return;
    }

    if (isWorkspaceZoneRoute) {
      router.replace("/workspaces").catch(() => undefined);
    }
  }, [
    hasHydrated,
    isNativeSuperAdminAllowedWorkspaceRoute,
    isPlatformRoute,
    isWorkspaceZoneRoute,
    router,
    supportModeActive,
    user?.role,
    activeWorkspace?.workspace_id,
  ]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const token = sessionService.getToken();
    const publicPages = [...authRedirectPages, ...publicNoAuthPages];
    
    // Redirect if trying to access dashboard without token
    if (!token && !publicPages.includes(router.pathname)) {
      sessionService.clear();
      router.push('/login');
    }
    
    // Redirect if logged in and trying to access login page
    if (token && authRedirectPages.includes(router.pathname) && router.pathname !== "/logout") {
      router.push(getHomeRoute());
    }
  }, [hasHydrated, router, router.pathname]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const token = sessionService.getToken();
    const isPlatformOperator =
      user?.role === "super_admin" || user?.role === "developer";
    const recoveryRoute = "/account-deletion";
    const workspaceScheduledForDeletion = Boolean(activeWorkspace?.workspace_deleted_at);

    if (!token || isPlatformOperator) {
      return;
    }

    if (workspaceScheduledForDeletion && router.pathname !== recoveryRoute) {
      router.replace(recoveryRoute).catch(() => undefined);
      return;
    }

    if (!workspaceScheduledForDeletion && router.pathname === recoveryRoute) {
      router.replace(getHomeRoute()).catch(() => undefined);
    }
  }, [
    activeWorkspace?.workspace_deleted_at,
    hasHydrated,
    router,
    router.pathname,
    user?.role,
  ]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const token = sessionService.getToken();
    const publicPages = [...authRedirectPages, ...publicNoAuthPages];
    if (!token || publicPages.includes(router.pathname)) {
      return;
    }

    if (isPlatformOperator && !supportModeActive && isPlatformShellOnlyRoute) {
      return;
    }

    const activeWorkspaceId = activeWorkspace?.workspace_id || null;
    const activeProjectId = activeProject?.id || null;
    const needsRefresh =
      !user ||
      !resolvedAccess ||
      resolvedAccess.workspace_id !== activeWorkspaceId ||
      resolvedAccess.project_id !== activeProjectId ||
      memberships.some(
        (membership) =>
          membership.status === 'active' &&
          (!membership.effective_permissions ||
            Object.keys(membership.effective_permissions).length === 0)
      );

    if (!needsRefresh) {
      return;
    }

    permissionService
      .me()
      .then((data) => {
        const resolvedUser = data.user || user || useAuthStore.getState().user;
        if (!resolvedUser) {
          throw new Error('Unable to resolve authenticated user context');
        }

        setPermissionSnapshot({
          user: resolvedUser,
          memberships: data.memberships || [],
          activeWorkspace: data.activeWorkspace || null,
          projectAccesses: data.projectAccesses || [],
          activeProject: activeProjectId
            ? useAuthStore.getState().activeProject
            : null,
          resolvedAccess: data.resolvedAccess || null,
        });
      })
      .catch(() => {
        sessionService.clear();
        if (router.pathname !== '/login' && router.pathname !== "/logout") {
          router.push('/login');
        }
      });
  }, [
    activeProject?.id,
    activeWorkspace?.workspace_id,
    hasHydrated,
    memberships,
    isPlatformRoute,
    resolvedAccess,
    router,
    router.pathname,
    setPermissionSnapshot,
    supportModeActive,
    user,
    isPlatformOperator,
  ]);

  if (!hasHydrated) {
    return null;
  }

  return getLayout(<Component {...pageProps} />);
}
