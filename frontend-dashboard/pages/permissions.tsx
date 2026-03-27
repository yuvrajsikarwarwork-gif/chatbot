import { useRouter } from "next/router";
import { useEffect } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";

export default function PermissionsPage() {
  const router = useRouter();
  const { isPlatformOperator } = useVisibility();
  const canViewPermissionsPage = isPlatformOperator;

  useEffect(() => {
    if (!canViewPermissionsPage) {
      return;
    }
    router.replace("/users-access/roles").catch(() => undefined);
  }, [canViewPermissionsPage, router]);

  return (
    <DashboardLayout>
      {!canViewPermissionsPage ? (
        <PageAccessNotice
          title="Global permissions are restricted for this role"
          description="Workspace admins should use workspace-level access screens. Global role baselines stay platform-only."
          href="/users-access"
          ctaLabel="Open users and access"
        />
      ) : (
        <div className="mx-auto max-w-7xl">
          <section className="rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] px-4 py-3 text-sm text-[var(--muted)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
            Redirecting to role permissions...
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
