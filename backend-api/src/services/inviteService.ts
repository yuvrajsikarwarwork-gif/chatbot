import crypto from "crypto";
import { env } from "../config/env";
import { createAuthToken, revokeActiveAuthTokensForUser } from "../models/authTokenModel";
import { sendTransactionalEmail } from "./mailService";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildAuthActionLink(path: string, token: string) {
  const base = env.PUBLIC_APP_BASE_URL.replace(/\/$/, "");
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

export async function createWorkspaceInviteService(input: {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  createdBy?: string | null;
}) {
  const rawToken = crypto.randomBytes(24).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString();

  await revokeActiveAuthTokensForUser(input.userId, "workspace_invite");
  await createAuthToken({
    userId: input.userId,
    workspaceId: input.workspaceId,
    email: input.email,
    tokenHash,
    purpose: "workspace_invite",
    metadata: {
      role: input.role,
      workspaceName: input.workspaceName,
    },
    expiresAt,
    createdBy: input.createdBy || null,
  });

  const inviteLink = buildAuthActionLink("/accept-invite", rawToken);
  const text = [
    `You have been invited to ${input.workspaceName} on BOT.OS.`,
    `Role: ${input.role}`,
    `Set your password here: ${inviteLink}`,
    `This link expires on ${new Date(expiresAt).toLocaleString()}.`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">
      <h2 style="margin:0 0 12px">Workspace Invite</h2>
      <p>You have been invited to <strong>${input.workspaceName}</strong> on BOT.OS.</p>
      <p><strong>Role:</strong> ${input.role}</p>
      <p>
        <a href="${inviteLink}" style="display:inline-block;background:#111827;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">
          Set Password And Join
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280">If the button does not work, open this link: ${inviteLink}</p>
    </div>
  `;

  const emailDelivery = await sendTransactionalEmail({
    to: input.email,
    subject: `You have been invited to ${input.workspaceName}`,
    html,
    text,
  });

  return {
    inviteLink,
    expiresAt,
    emailDelivery,
  };
}
