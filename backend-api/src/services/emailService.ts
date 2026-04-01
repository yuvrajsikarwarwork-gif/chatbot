import nodemailer from "nodemailer";

import { decryptSecret } from "../utils/encryption";
import { findWorkspaceMailSettingsByWorkspaceId, toWorkspaceMailSettingsView } from "../models/workspaceMailSettingsModel";
import { sendTransactionalEmail } from "./mailService";

export type EmailDeliveryProvider = "smtp" | "sendgrid" | "postmark" | "none";

export type EmailDeliveryStatus = {
  ok: boolean;
  provider: EmailDeliveryProvider;
  detail: string;
  checkedAt: string;
};

function buildSmtpTransport(smtpHost: string, smtpUser: string, smtpPass: string, smtpPort: number) {
  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

function normalizeSmtpPort(value: number | string | null | undefined, fallback = 587) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

export async function sendWorkspaceEmail(input: {
  workspaceId: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string | null;
  replyTo?: string | null;
}): Promise<EmailDeliveryStatus> {
  const checkedAt = new Date().toISOString();
  const rawWorkspaceConfig = input.workspaceId
    ? await findWorkspaceMailSettingsByWorkspaceId(input.workspaceId).catch(() => null)
    : null;
  const workspaceConfig = toWorkspaceMailSettingsView(rawWorkspaceConfig);

  if (workspaceConfig?.smtpHost && workspaceConfig.smtpUser && rawWorkspaceConfig?.smtp_pass) {
    const smtpPass = decryptSecret(rawWorkspaceConfig.smtp_pass);
    const smtpPort = normalizeSmtpPort(workspaceConfig.smtpPort, 587);
    const transporter = buildSmtpTransport(
      String(workspaceConfig.smtpHost || "").trim(),
      String(workspaceConfig.smtpUser || "").trim(),
      smtpPass || "",
      smtpPort
    );

    if (transporter) {
      await transporter.sendMail({
        from: input.fromName
          ? `"${input.fromName}" <${String(workspaceConfig.smtpFrom || workspaceConfig.smtpUser || "").trim()}>`
          : String(workspaceConfig.smtpFrom || workspaceConfig.smtpUser || "").trim(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo || undefined,
      });

      return {
        ok: true,
        provider: "smtp",
        detail: `Email sent via workspace SMTP${workspaceConfig.smtpFrom ? ` from ${workspaceConfig.smtpFrom}` : ""}.`,
        checkedAt,
      };
    }
  }

  const systemDelivery = await sendTransactionalEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (!systemDelivery.ok) {
    throw {
      status: 502,
      message: systemDelivery.detail || "SMTP delivery failed",
    };
  }

  return systemDelivery;
}
