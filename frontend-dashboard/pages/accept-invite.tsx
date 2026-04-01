import { useRouter } from "next/router";

import InviteAcceptScreen from "../components/invite/InviteAcceptScreen";

export default function AcceptInvitePage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";

  return <InviteAcceptScreen token={token} sourceLabel="Workspace Invite" />;
}
