import { useRouter } from "next/router";
import { useEffect } from "react";

import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { useAuthStore } from "../store/authStore";

export default function UsersPage() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const { canViewPage, supportAccess } = useVisibility();
  const canViewUsersPage = canViewPage("users") || canViewPage("users_access") || supportAccess;
  const targetRoute = activeWorkspace?.workspace_id ? "/users-access/members" : "/workspaces";

  useEffect(() => {
    router.replace(canViewUsersPage ? targetRoute : "/").catch(() => undefined);
  }, [canViewUsersPage, router, targetRoute]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl">
        <section className="rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 text-sm text-[var(--muted)] shadow-[var(--shadow-glass)] backdrop-blur-2xl">
          Redirecting to workspace users...
        </section>
      </div>
    </DashboardLayout>
  );
}
