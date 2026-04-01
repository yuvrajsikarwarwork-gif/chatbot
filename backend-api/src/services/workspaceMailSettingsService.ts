import { assertRecord } from "../utils/assertRecord";
import nodemailer from "nodemailer";
import { findWorkspaceById } from "../models/workspaceModel";
import { WORKSPACE_PERMISSIONS, assertWorkspacePermission } from "./workspaceAccessService";
import { decryptSecret } from "../utils/encryption";
import {
  findWorkspaceMailSettingsByWorkspaceId,
  toWorkspaceMailSettingsView,
  upsertWorkspaceMailSettings,
  type WorkspaceMailSettingsView,
} from "../models/workspaceMailSettingsModel";

function normalizePlanLabel(workspace: any) {
  return String(
    workspace?.subscription_plan_name ||
      workspace?.effective_plan_id ||
      workspace?.plan_id ||
      ""
  )
    .trim()
    .toLowerCase();
}

function canUseCustomMailServer(workspace: any) {
  const planLabel = normalizePlanLabel(workspace);
  const billingStatus = String(workspace?.billing_status || workspace?.subscription_status || "")
    .trim()
    .toLowerCase();
  return planLabel === "scale" || billingStatus === "active";
}

function buildRestrictionMessage(workspace: any) {
  return canUseCustomMailServer(workspace)
    ? null
    : "Upgrade to connect your own email server.";
}

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

function getPlatformName() {
  return "BOT.OS";
}

function normalizeSmtpError(error: any) {
  const message = String(
    error?.response || error?.responseCode || error?.message || error?.code || error || ""
  ).trim();

  if (!message) {
    return "SMTP connection failed.";
  }

  return message;
}

function augmentView(
  workspace: any,
  settings: WorkspaceMailSettingsView | null,
  workspaceId: string
) {
  const restrictionMessage = buildRestrictionMessage(workspace);
  const hasWorkspaceConfig = Boolean(
    settings?.smtpHost && settings?.smtpUser && settings?.smtpPassConfigured
  );

  return {
    workspaceId,
    smtpHost: settings?.smtpHost || "",
    smtpPort: settings?.smtpPort || 587,
    smtpUser: settings?.smtpUser || "",
    smtpFrom: settings?.smtpFrom || "",
    smtpPassConfigured: Boolean(settings?.smtpPassConfigured),
    usesSystemDefault: !hasWorkspaceConfig,
    planName: String(
      workspace?.subscription_plan_name ||
        workspace?.effective_plan_id ||
        workspace?.plan_id ||
        "Starter"
    ).trim(),
    billingStatus: String(workspace?.billing_status || workspace?.subscription_status || "unknown").trim(),
    canEdit: canUseCustomMailServer(workspace),
    restrictionMessage,
    workspaceMailConfigured: hasWorkspaceConfig,
    source: hasWorkspaceConfig ? "workspace" : "system",
    createdAt: settings?.createdAt || null,
    updatedAt: settings?.updatedAt || null,
  };
}

export async function getWorkspaceMailSettingsService(workspaceId: string, userId: string) {
  const workspace = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.manageWorkspace);

  const settings = await findWorkspaceMailSettingsByWorkspaceId(workspaceId).catch(() => null);
  return augmentView(workspace, settings ? toWorkspaceMailSettingsView(settings) : null, workspaceId);
}

export async function updateWorkspaceMailSettingsService(
  workspaceId: string,
  userId: string,
  payload: {
    smtpHost?: string | null;
    smtpPort?: number | string | null;
    smtpUser?: string | null;
    smtpPass?: string | null;
    smtpFrom?: string | null;
  }
) {
  const workspace = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.manageWorkspace);

  if (!canUseCustomMailServer(workspace)) {
    throw { status: 403, message: "Upgrade to connect your own email server." };
  }

  const current = await findWorkspaceMailSettingsByWorkspaceId(workspaceId).catch(() => null);
  const existing = current ? toWorkspaceMailSettingsView(current) : null;
  const smtpHost = String(payload.smtpHost ?? "").trim() || null;
  const smtpUser = String(payload.smtpUser ?? "").trim() || null;
  const smtpFrom = String(payload.smtpFrom ?? "").trim() || null;
  const nextPortValue = payload.smtpPort === undefined || payload.smtpPort === null || payload.smtpPort === ""
    ? existing?.smtpPort || 587
    : Number(payload.smtpPort);
  const smtpPort = Number.isFinite(Number(nextPortValue)) ? Number(nextPortValue) : 587;
  const nextPass = String(payload.smtpPass ?? "").trim();
  const smtpPass = nextPass || decryptSecret(current?.smtp_pass || null) || null;

  const saved = await upsertWorkspaceMailSettings({
    workspaceId,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    userId,
  });

  const nextSettings = toWorkspaceMailSettingsView(saved);
  return augmentView(workspace, nextSettings, workspaceId);
}

export async function testWorkspaceMailSettingsService(
  workspaceId: string,
  userId: string,
  payload: {
    smtpHost?: string | null;
    smtpPort?: number | string | null;
    smtpUser?: string | null;
    smtpPass?: string | null;
    smtpFrom?: string | null;
    recipientEmail?: string | null;
  }
) {
  const workspace = assertRecord(await findWorkspaceById(workspaceId, userId), "Workspace not found");
  await assertWorkspacePermission(userId, workspaceId, WORKSPACE_PERMISSIONS.manageWorkspace);

  if (!canUseCustomMailServer(workspace)) {
    throw { status: 403, message: "Upgrade to connect your own email server." };
  }

  const current = await findWorkspaceMailSettingsByWorkspaceId(workspaceId).catch(() => null);
  const smtpHost = String(payload.smtpHost ?? "").trim() || decryptSecret(current?.smtp_host || null) || "";
  const smtpUser = String(payload.smtpUser ?? "").trim() || decryptSecret(current?.smtp_user || null) || "";
  const smtpFrom = String(payload.smtpFrom ?? "").trim() || decryptSecret(current?.smtp_from || null) || smtpUser;
  const smtpPortValue =
    payload.smtpPort === undefined || payload.smtpPort === null || payload.smtpPort === ""
      ? current?.smtp_port || 587
      : Number(payload.smtpPort);
  const smtpPort = Number.isFinite(Number(smtpPortValue)) ? Number(smtpPortValue) : 587;
  const smtpPass =
    String(payload.smtpPass ?? "").trim() ||
    decryptSecret(current?.smtp_pass || null) ||
    "";
  const recipientEmail = String(payload.recipientEmail || "").trim();

  if (!recipientEmail) {
    throw { status: 400, message: "recipientEmail is required" };
  }
  if (!smtpHost || !smtpUser || !smtpPass) {
    throw { status: 400, message: "SMTP host, user, and password are required" };
  }

  const transporter = buildSmtpTransport(smtpHost, smtpUser, smtpPass, smtpPort);
  if (!transporter) {
    throw { status: 400, message: "SMTP host, user, and password are required" };
  }

  try {
    await transporter.verify();
    await transporter.sendMail({
      from: `"${getPlatformName()}" <${smtpFrom}>`,
      to: recipientEmail,
      subject: `Hello from ${getPlatformName()}`,
      text: `Hello from ${getPlatformName()}.\n\nThis is a test message sent from your workspace SMTP configuration.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="margin:0 0 12px">Hello from ${getPlatformName()}</h2>
        <p>This is a test message sent from your workspace SMTP configuration.</p>
      </div>`,
    });

    return {
      ok: true,
      detail: `Test email sent to ${recipientEmail} successfully.`,
      checkedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw {
      status: 502,
      message: normalizeSmtpError(error),
    };
  }
}

export async function resolveWorkspaceMailSettings(workspaceId: string) {
  const settings = await findWorkspaceMailSettingsByWorkspaceId(workspaceId).catch(() => null);
  return settings ? toWorkspaceMailSettingsView(settings) : null;
}
