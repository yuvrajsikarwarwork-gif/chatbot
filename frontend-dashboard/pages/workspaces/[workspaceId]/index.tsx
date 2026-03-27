import { useEffect } from "react";
import { useRouter } from "next/router";

import DashboardLayout from "../../../components/layout/DashboardLayout";

export default function WorkspaceOverviewPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    router.replace("/settings").catch(() => undefined);
  }, [router]);

  return (
    <DashboardLayout>
      <div />
    </DashboardLayout>
  );
}
