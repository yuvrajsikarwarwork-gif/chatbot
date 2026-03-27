import { useEffect } from "react";
import { useRouter } from "next/router";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";

export default function SupportHomePage() {
  const router = useRouter();
  const { canViewPage } = useVisibility();
  const canViewSupportPage = canViewPage("support");

  useEffect(() => {
    if (!router.isReady || !canViewSupportPage) {
      return;
    }
    router.replace("/support/tickets").catch(() => undefined);
  }, [canViewSupportPage, router]);

  return (
    <DashboardLayout>
      {!canViewSupportPage ? (
        <PageAccessNotice
          title="Support is restricted for this role"
          description="Support requests and temporary support access are only available to workspace operators and platform support users."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] px-4 py-3 text-sm text-[var(--muted)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
            Redirecting to support tickets...
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
