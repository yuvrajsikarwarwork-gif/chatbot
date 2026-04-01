import nodemailer from "nodemailer";
import { env } from "../config/env";
import { decryptSecret } from "../utils/encryption";
import { getPlatformSettingsRecord } from "../models/platformSettingsModel";

export type EmailDeliveryProvider = "smtp" | "sendgrid" | "postmark" | "none";

export type EmailDeliveryStatus = {
  ok: boolean;
  provider: EmailDeliveryProvider;
  detail: string;
  checkedAt: string;
};

function resolveProviderPreference(): EmailDeliveryProvider[] {
  const preference = String(env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const fallbackOrder: EmailDeliveryProvider[] = ["smtp", "sendgrid", "postmark"];

  if (preference === "smtp" || preference === "sendgrid" || preference === "postmark") {
    return [preference, ...fallbackOrder.filter((item) => item !== preference)];
  }

  return fallbackOrder;
}

type EmailSettingsRecord = {
  provider?: string;
  smtpHost?: string;
  smtpPort?: number | string;
  smtpUser?: string;
  smtpPass?: unknown;
  smtpFrom?: string;
  smtpReplyTo?: string;
  testRecipient?: string;
  smtpEncryption?: string;
  smtpSenderName?: string;
};

async function readEmailSettingsRecord() {
  const record = await getPlatformSettingsRecord("email_services").catch(() => null);
  return record?.settings_json && typeof record.settings_json === "object"
    ? (record.settings_json as EmailSettingsRecord)
    : {};
}

function buildSmtpTransport(
  smtpHost: string,
  smtpUser: string,
  smtpPass: string,
  smtpPort: number,
  smtpEncryption?: string | null
) {
  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  const encryption = String(smtpEncryption || "tls").trim().toLowerCase();
  const secure = encryption === "ssl" || smtpPort === 465;
  const requireTLS = encryption === "tls";

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure,
    requireTLS,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

async function resolveMailConfig() {
  const stored = await readEmailSettingsRecord();
  const providerPreference = String(stored.provider || env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const smtpHost = String(stored.smtpHost || env.SMTP_HOST || "").trim();
  const smtpPort = Number(stored.smtpPort || env.SMTP_PORT || 587);
  const smtpUser = String(stored.smtpUser || env.SMTP_USER || "").trim();
  const smtpPass =
    decryptSecret(stored.smtpPass) || String(env.SMTP_PASS || "").trim();
  const smtpFrom = String(stored.smtpFrom || env.SMTP_FROM || smtpUser || "").trim();
  const smtpReplyTo = String(stored.smtpReplyTo || "").trim();
  const testRecipient = String(stored.testRecipient || smtpFrom || "").trim();
  const smtpEncryption = String(stored.smtpEncryption || "tls").trim().toLowerCase();
  const smtpSenderName = String(stored.smtpSenderName || "BOT.OS").trim();

  return {
    providerPreference,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpReplyTo,
    testRecipient,
    smtpEncryption,
    smtpSenderName,
  };
}

function resolveMailFrom(smtpFrom: string) {
  return String(smtpFrom || env.SENDGRID_FROM || env.POSTMARK_FROM || env.SMTP_USER || "").trim();
}

async function sendWithSendGrid(input: { to: string; subject: string; html: string; text: string }) {
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM) {
    return null;
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: env.SENDGRID_FROM },
      subject: input.subject,
      content: [
        { type: "text/plain", value: input.text },
        { type: "text/html", value: input.html },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`SendGrid responded ${response.status}: ${body || response.statusText}`);
  }

  return true;
}

async function sendWithPostmark(input: { to: string; subject: string; html: string; text: string }) {
  if (!env.POSTMARK_SERVER_TOKEN || !env.POSTMARK_FROM) {
    return null;
  }

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      From: env.POSTMARK_FROM,
      To: input.to,
      Subject: input.subject,
      HtmlBody: input.html,
      TextBody: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Postmark responded ${response.status}: ${body || response.statusText}`);
  }

  return true;
}

async function sendWithSmtp(
  input: { to: string; subject: string; html: string; text: string },
  config: {
    smtpHost: string;
    smtpUser: string;
    smtpPass: string;
    smtpPort: number;
    smtpFrom: string;
    smtpEncryption?: string | null;
    smtpSenderName?: string | null;
    smtpReplyTo?: string | null;
  }
) {
  const transporter = buildSmtpTransport(
    config.smtpHost,
    config.smtpUser,
    config.smtpPass,
    config.smtpPort,
    config.smtpEncryption
  );
  if (!transporter) {
    return null;
  }

  await transporter.sendMail({
    from: `"${String(config.smtpSenderName || "BOT.OS").trim()}" <${
      resolveMailFrom(config.smtpFrom) || config.smtpUser
    }>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: config.smtpReplyTo || undefined,
  });

  return true;
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailDeliveryStatus> {
  const checkedAt = new Date().toISOString();
  const providerOrder = resolveProviderPreference();
  const config = await resolveMailConfig();
  let lastErrorDetail = "";

  for (const provider of providerOrder) {
    try {
      if (provider === "smtp") {
        const delivered = await sendWithSmtp(input, config);
        if (delivered) {
          return {
            ok: true,
            provider,
            detail: `Email sent via SMTP${resolveMailFrom(config.smtpFrom) ? ` from ${resolveMailFrom(config.smtpFrom)}` : ""}.`,
            checkedAt,
          };
        }
      }

      if (provider === "sendgrid") {
        const delivered = await sendWithSendGrid(input);
        if (delivered) {
          return {
            ok: true,
            provider,
            detail: `Email sent via SendGrid${env.SENDGRID_FROM ? ` from ${env.SENDGRID_FROM}` : ""}.`,
            checkedAt,
          };
        }
      }

      if (provider === "postmark") {
        const delivered = await sendWithPostmark(input);
        if (delivered) {
          return {
            ok: true,
            provider,
            detail: `Email sent via Postmark${env.POSTMARK_FROM ? ` from ${env.POSTMARK_FROM}` : ""}.`,
            checkedAt,
          };
        }
      }
    } catch (error: any) {
      lastErrorDetail = `${provider.toUpperCase()}: ${error?.message || error}`;
      console.warn(`[MailService] ${provider} delivery failed:`, error?.message || error);
    }
  }

  const smtpConfigured = Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
  const detail = lastErrorDetail
    ? `Email delivery failed. ${lastErrorDetail}`
    : config.providerPreference === "smtp" && !smtpConfigured
      ? "SMTP Not Configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in backend-api/.env or configure email services in System Settings."
      : "No email provider is configured. Set SMTP settings in System Settings or SMTP_HOST/SMTP_USER/SMTP_PASS, or SENDGRID_API_KEY/SENDGRID_FROM, or POSTMARK_SERVER_TOKEN/POSTMARK_FROM.";
  console.warn(detail, { to: input.to, subject: input.subject });
  return {
    ok: false,
    provider: "none",
    detail,
    checkedAt,
  };
}

export async function getEmailDeliveryHealth(): Promise<EmailDeliveryStatus> {
  const checkedAt = new Date().toISOString();
  const config = await resolveMailConfig();

  if (config.providerPreference === "smtp" && config.smtpHost && config.smtpUser && config.smtpPass) {
    return {
      ok: true,
      provider: "smtp",
      detail: `SMTP is configured for ${resolveMailFrom(config.smtpFrom) || config.smtpUser}.`,
      checkedAt,
    };
  }

  if (config.providerPreference === "sendgrid" && env.SENDGRID_API_KEY && env.SENDGRID_FROM) {
    return {
      ok: true,
      provider: "sendgrid",
      detail: `SendGrid is configured for ${env.SENDGRID_FROM}.`,
      checkedAt,
    };
  }

  if (config.providerPreference === "postmark" && env.POSTMARK_SERVER_TOKEN && env.POSTMARK_FROM) {
    return {
      ok: true,
      provider: "postmark",
      detail: `Postmark is configured for ${env.POSTMARK_FROM}.`,
      checkedAt,
    };
  }

  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    return {
      ok: true,
      provider: "smtp",
      detail: `SMTP is configured for ${resolveMailFrom(config.smtpFrom) || config.smtpUser}.`,
      checkedAt,
    };
  }

  if (env.SENDGRID_API_KEY && env.SENDGRID_FROM) {
    return {
      ok: true,
      provider: "sendgrid",
      detail: `SendGrid is configured for ${env.SENDGRID_FROM}.`,
      checkedAt,
    };
  }

  if (env.POSTMARK_SERVER_TOKEN && env.POSTMARK_FROM) {
    return {
      ok: true,
      provider: "postmark",
      detail: `Postmark is configured for ${env.POSTMARK_FROM}.`,
      checkedAt,
    };
  }

  return {
    ok: false,
    provider: "none",
    detail: "No email provider is configured.",
    checkedAt,
  };
}

export async function sendPasswordResetOtpEmail(input: {
  to: string;
  otp: string;
  name?: string | null;
}) {
  const greeting = input.name ? `Hi ${input.name},` : "Hi,";
  const subject = "Your BOT.OS password reset OTP";
  const text = `${greeting}\n\nUse this OTP to reset your password: ${input.otp}\n\nThis code expires in 10 minutes.\nIf you did not request this, you can ignore this email.`;
  const html = `
    <div style="font-family:Arial,sans-serif;padding:24px;max-width:480px">
      <p>${greeting}</p>
      <p>Use this OTP to reset your BOT.OS password:</p>
      <div style="margin:24px 0;padding:16px;border-radius:12px;background:#0f172a;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:0.4em;text-align:center;">
        ${input.otp}
      </div>
      <p>This code expires in 10 minutes.</p>
      <p style="color:#64748b;font-size:13px">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return sendTransactionalEmail({
    to: input.to,
    subject,
    text,
    html,
  });
}
