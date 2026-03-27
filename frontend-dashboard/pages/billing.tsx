import { useEffect } from "react";
import { useRouter } from "next/router";

import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { useAuthStore } from "../store/authStore";

export default function BillingPage() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const { canViewPage, isPlatformOperator } = useVisibility();
  const canViewBillingPage = canViewPage("billing") || canViewPage("settings") || isPlatformOperator;

  useEffect(() => {
    if (!router.isReady || !canViewBillingPage) {
      return;
    }

    if (activeWorkspace?.workspace_id) {
      router.replace(`/workspaces/${activeWorkspace.workspace_id}/billing`).catch(() => undefined);
      return;
    }

    router.replace(isPlatformOperator ? "/workspaces" : "/settings").catch(() => undefined);
  }, [activeWorkspace?.workspace_id, canViewBillingPage, isPlatformOperator, router]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl">
        <section className="rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] px-4 py-3 text-sm text-[var(--muted)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
          Redirecting to workspace billing...
        </section>
      </div>
    </DashboardLayout>
  );
}
