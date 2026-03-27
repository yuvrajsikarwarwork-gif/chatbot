import nodemailer from "nodemailer";
import { env } from "../config/env";

function buildTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: Number(env.SMTP_PORT || 587) === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const transporter = buildTransport();
  if (!transporter) {
    console.warn("SMTP not configured. Email skipped.", {
      to: input.to,
      subject: input.subject,
    });
    return false;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  return true;
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
