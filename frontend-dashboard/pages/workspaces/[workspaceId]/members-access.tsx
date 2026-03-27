import { useEffect } from "react";
import { useRouter } from "next/router";

import DashboardLayout from "../../../components/layout/DashboardLayout";

export default function WorkspaceMembersAccessPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    router.replace("/users-access/members").catch(() => undefined);
  }, [router]);

  return (
    <DashboardLayout>
      <div />
    </DashboardLayout>
  );
}
