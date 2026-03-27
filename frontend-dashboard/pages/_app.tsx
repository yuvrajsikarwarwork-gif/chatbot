import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import UiOverlay from '../components/ui/UiOverlay';
import { permissionService } from '../services/permissionService';
import { sessionService } from '../services/sessionService';
import { useAuthStore } from '../store/authStore';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const setPermissionSnapshot = useAuthStore((state) => state.setPermissionSnapshot);
  const user = useAuthStore((state) => state.user);
  const memberships = useAuthStore((state) => state.memberships);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const resolvedAccess = useAuthStore((state) => state.resolvedAccess);

  const getHomeRoute = () => {
    const currentUser = useAuthStore.getState().user;
    return currentUser?.role === "super_admin" || currentUser?.role === "developer"
      ? "/workspaces"
      : "/";
  };

  useEffect(() => {
    const token = sessionService.getToken();
    const publicPages = ['/login', '/logout', '/register', '/accept-invite', '/forgot-password', '/reset-password'];
    
    // Redirect if trying to access dashboard without token
    if (!token && !publicPages.includes(router.pathname)) {
      sessionService.clear();
      router.push('/login');
    }
    
    // Redirect if logged in and trying to access login page
    if (token && publicPages.includes(router.pathname) && router.pathname !== "/logout") {
      router.push(getHomeRoute());
    }
  }, [router, router.pathname]);

  useEffect(() => {
    const token = sessionService.getToken();
    const publicPages = ['/login', '/logout', '/register', '/accept-invite', '/forgot-password', '/reset-password'];
    if (!token || publicPages.includes(router.pathname)) {
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
    memberships,
    resolvedAccess,
    router,
    router.pathname,
    setPermissionSnapshot,
    user,
  ]);

  return (
    <>
      <Component {...pageProps} />
      <UiOverlay />
    </>
  );
}
