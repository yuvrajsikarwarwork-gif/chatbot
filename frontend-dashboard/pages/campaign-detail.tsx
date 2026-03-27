import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";

const SECTION_LINKS = [
  { key: "overview", label: "Overview", suffix: "" },
  { key: "channels", label: "Channels", suffix: "/channels" },
  { key: "entries", label: "Entries", suffix: "/entries" },
  { key: "audience", label: "Audience", suffix: "/audience" },
  { key: "launch", label: "Launch", suffix: "/launch" },
  { key: "activity", label: "Activity", suffix: "/activity" },
];

export default function CampaignDetailCompatibilityPage() {
  const router = useRouter();
  const { canViewPage } = useVisibility();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const canViewCampaignsPage = canViewPage("campaigns");

  useEffect(() => {
    if (canViewCampaignsPage && id) {
      router.replace(`/campaigns/${id}`).catch(() => undefined);
    }
  }, [canViewCampaignsPage, id, router]);

  return (
    <DashboardLayout>
      {!canViewCampaignsPage ? (
        <PageAccessNotice
          title="Campaign details are restricted for this role"
          description="Campaign pages are only available to users with campaign or assigned project access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : !id ? (
        <PageAccessNotice
          title="Campaign not selected"
          description="Choose a campaign from the campaign directory to open the new split management flow."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : !id ? (
        <PageAccessNotice
          title="Campaign not selected"
          description="Choose a campaign from the directory to continue with the current split campaign flow."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 text-sm text-[var(--muted)] shadow-[var(--shadow-glass)] backdrop-blur-2xl">
            Redirecting to campaign overview...
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
