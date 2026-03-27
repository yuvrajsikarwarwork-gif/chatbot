import { useRouter } from "next/router";
import { useEffect } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";

export default function TicketsPage() {
  const router = useRouter();
  const { canViewPage } = useVisibility();
  const canViewTicketsPage = canViewPage("tickets") || canViewPage("support");

  useEffect(() => {
    if (!canViewTicketsPage) {
      return;
    }
    router.replace("/support/tickets").catch(() => undefined);
  }, [canViewTicketsPage, router]);

  return (
    <DashboardLayout>
      {!canViewTicketsPage ? (
        <PageAccessNotice
          title="Support is restricted for this role"
          description="Support requests are only available to workspace operators and platform support users."
          href="/support"
          ctaLabel="Open support"
        />
      ) : (
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 text-sm text-[var(--muted)] shadow-[var(--shadow-glass)] backdrop-blur-2xl">
            Redirecting to support tickets...
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
