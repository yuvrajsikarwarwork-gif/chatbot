import { useRouter } from "next/router";
import { useEffect } from "react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import UsersAccessTabs from "../../components/access/UsersAccessTabs";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";

export default function UsersAccessHomePage() {
  const router = useRouter();
  const { canViewPage, isPlatformOperator, supportAccess } = useVisibility();
  const canViewUsersAccessPage = canViewPage("users_access") || isPlatformOperator;

  useEffect(() => {
    if (isPlatformOperator && !supportAccess) {
      router.replace("/users-access/roles").catch(() => undefined);
      return;
    }
    if (canViewUsersAccessPage) {
      router.replace("/users-access/members").catch(() => undefined);
    }
  }, [canViewUsersAccessPage, isPlatformOperator, router, supportAccess]);

  return (
    <DashboardLayout>
      {!canViewUsersAccessPage ? (
        <PageAccessNotice
          title="Users and permissions are restricted for this role"
          description="Open this area with workspace management access, permission access, or a platform operator account."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-4">
          {isPlatformOperator && !supportAccess ? (
            <section className="rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] px-4 py-3 text-sm text-[var(--muted)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
              Redirecting to global role baselines...
            </section>
          ) : null}
          <UsersAccessTabs activeHref="/users-access/members" />
        </div>
      )}
    </DashboardLayout>
  );
}
