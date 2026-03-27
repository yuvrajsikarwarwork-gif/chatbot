import { useEffect } from "react";
import { useRouter } from "next/router";

import DashboardLayout from "../../../components/layout/DashboardLayout";

export default function ProjectMembersPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    router.replace("/users-access/members").catch(() => undefined);
  }, [router]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl">
        <section className="rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] px-4 py-3 text-sm text-[var(--muted)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
          Redirecting to users and access...
        </section>
      </div>
    </DashboardLayout>
  );
}
