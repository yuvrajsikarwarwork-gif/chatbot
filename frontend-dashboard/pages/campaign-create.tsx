import { useRouter } from "next/router";
import { useEffect } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";

export default function CampaignCreateCompatibilityPage() {
  const router = useRouter();
  const { canViewPage } = useVisibility();
  const canViewCampaignsPage = canViewPage("campaigns");

  useEffect(() => {
    if (!canViewCampaignsPage) {
      return;
    }
    router.replace("/campaigns/new").catch(() => undefined);
  }, [canViewCampaignsPage, router]);

  return (
    <DashboardLayout>
      {!canViewCampaignsPage ? (
        <PageAccessNotice
          title="Campaign creation is restricted for this role"
          description="Campaign creation follows workspace and project scope. Open the new campaigns flow if your access allows it."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 text-sm text-[var(--muted)] shadow-[var(--shadow-glass)] backdrop-blur-2xl">
            Redirecting to campaign creation...
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
