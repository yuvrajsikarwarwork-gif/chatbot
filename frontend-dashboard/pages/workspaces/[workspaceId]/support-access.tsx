import { useEffect } from "react";
import { useRouter } from "next/router";

import DashboardLayout from "../../../components/layout/DashboardLayout";

export default function WorkspaceSupportAccessPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    router.replace("/support/access").catch(() => undefined);
  }, [router]);

  return <DashboardLayout><div /></DashboardLayout>;
}
