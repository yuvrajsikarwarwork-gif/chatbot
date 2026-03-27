import { useRouter } from "next/router";
import { useEffect } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";

export default function PlatformAccountsCompatibilityPage() {
  const router = useRouter();
  const { canViewPage } = useVisibility();
  const canViewIntegrationsPage = canViewPage("integrations");

  useEffect(() => {
    if (!canViewIntegrationsPage) {
      return;
    }
    router.replace("/integrations").catch(() => undefined);
  }, [canViewIntegrationsPage, router]);

  return (
    <DashboardLayout>
      {!canViewIntegrationsPage ? (
        <PageAccessNotice
          title="Integrations are restricted for this role"
          description="Project integrations stay inside scoped workspace and project access."
          href="/integrations"
          ctaLabel="Open integrations"
        />
      ) : (
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 text-sm text-[var(--muted)] shadow-[var(--shadow-glass)] backdrop-blur-2xl">
            Redirecting to integrations...
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
