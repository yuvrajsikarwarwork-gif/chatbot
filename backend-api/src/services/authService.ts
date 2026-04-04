// src/services/authService.ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { findUserByEmail, createUser, findUserById } from "../models/userModel";
import { env } from "../config/env";
import { listUserWorkspaceMembershipsService } from "./workspaceAccessService";
import { listUserProjectAccessService } from "./projectAccessService";
import { buildResolvedAccessSnapshot } from "./appAccessService";
import {
  findOrganizationByWorkspaceIdService,
  getUserOrganizationContextService,
  resolveOrganizationMembershipService,
} from "./organizationService";
import {
  startAgentPresenceSession,
  stopAgentPresenceSession,
} from "./agentPresenceService";
import {
  createAuthToken,
  findAuthTokenByHash,
  markAuthTokenUsed,
  revokeActiveAuthTokensForUser,
} from "../models/authTokenModel";
import { sendPasswordResetOtpEmail } from "./mailService";
import { query } from "../config/db";
import {
  assertPlatformRoles,
  hasWorkspaceSupportEntryAccess,
  resolveRolePermissionMap,
} from "./workspaceAccessService";
import { findWorkspaceById } from "../models/workspaceModel";
import {
  deleteSupportAccess,
  deleteLatestActiveSupportAccessByUser,
  findLatestActiveSupportAccessByUser,
  upsertSupportAccess,
} from "../models/supportAccessModel";
import { logAuditSafe } from "./auditLogService";

async function buildSupportModeWorkspace(user: any) {
  const supportAccess = await findLatestActiveSupportAccessByUser(user.id);
  if (!supportAccess?.workspace_id) {
    return null;
  }

  const workspace = await findWorkspaceById(String(supportAccess.workspace_id), user.id);
  if (!workspace) {
    return null;
  }

  const workspacePermissions = await resolveRolePermissionMap("workspace_admin");
  return {
    workspace_id: supportAccess.workspace_id,
    workspace_name: workspace.name,
    role: "workspace_admin",
    status: workspace.status || "active",
    permissions_json: {
      support_mode: true,
      support_access_id: supportAccess.id,
      support_expires_at: supportAccess.expires_at,
    },
    effective_permissions: {
      ...workspacePermissions,
      support_access: true,
      support_mode: true,
    },
    permission_overrides: {},
  };
}

async function buildAuthContext(user: any, preferredOrganizationId?: string | null) {
  const memberships = await listUserWorkspaceMembershipsService(user.id);
  const projectAccesses = await listUserProjectAccessService(user.id).catch(() => []);
  const organizationContext = await getUserOrganizationContextService(
    user.id,
    preferredOrganizationId || user.workspace_id || null
  ).catch(() => ({
    organizations: [],
    activeOrganization: null,
    activeMembership: null,
  }));
  const isPlatformOperator =
    String(user?.role || "").trim().toLowerCase() === "super_admin" ||
    String(user?.role || "").trim().toLowerCase() === "developer";
  const recoveryMemberships = memberships.filter(
    (membership: any) => Boolean(membership?.workspace_deleted_at)
  );
  const eligibleMemberships = isPlatformOperator
    ? memberships
    : memberships.filter((membership: any) => {
        const workspaceStatus = String(membership?.workspace_status || "active").trim().toLowerCase();
        const isDeleted = Boolean(membership?.workspace_deleted_at);
        return (
          isDeleted ||
          workspaceStatus !== "suspended" &&
          workspaceStatus !== "locked" &&
          workspaceStatus !== "archived"
        );
      });

  if (
    !isPlatformOperator &&
    memberships.length > 0 &&
    eligibleMemberships.length === 0 &&
    recoveryMemberships.length === 0
  ) {
    throw {
      status: 403,
      message: "This workspace is suspended, archived, or locked. Please contact support.",
    };
  }

  const supportModeWorkspace = isPlatformOperator ? await buildSupportModeWorkspace(user) : null;
  const directActiveWorkspace =
    supportModeWorkspace
      ? null
      : eligibleMemberships.find((membership: any) => membership.workspace_id === user.workspace_id) ||
        (!isPlatformOperator ? eligibleMemberships[0] || recoveryMemberships[0] || null : null);
  const activeWorkspace = supportModeWorkspace || directActiveWorkspace || null;
  const activeOrganization = activeWorkspace?.workspace_id
    ? await findOrganizationByWorkspaceIdService(activeWorkspace.workspace_id, user.id).catch(() => null)
    : organizationContext.activeOrganization || null;

  return {
    user,
    memberships: eligibleMemberships,
    projectAccesses,
    activeWorkspace,
    organizations: organizationContext.organizations,
    activeOrganization,
    activeOrganizationMembership: activeOrganization
      ? await resolveOrganizationMembershipService(user.id, activeOrganization.id).catch(() => null)
      : null,
    resolvedAccess: buildResolvedAccessSnapshot({
      platformRole: user.role,
      activeWorkspace,
      activeProject: null,
      projectAccesses,
    }),
  };
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(email: string, otp: string) {
  return hashToken(`${String(email || "").trim().toLowerCase()}:${otp}`);
}

export async function loginService(email: string, password: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw { status: 400, message: "Invalid login" };
  }

  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    throw { status: 400, message: "Invalid login" };
  }

  const token = jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '24h' });
  const { password: _, ...userWithoutPassword } = user;
  const context = await buildAuthContext(userWithoutPassword);
  await startAgentPresenceSession(user.id, {
    workspaceId: context.activeWorkspace?.workspace_id || user.workspace_id || null,
    metadata: {
      auth: "login",
    },
  });

  return { ...context, token };
}

export async function registerService(email: string, password: string, name: string, role?: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw { status: 400, message: "Email is required" };
  }
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    throw { status: 400, message: "User exists" };
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await createUser(normalizedEmail, hash, name, role || "user");
  const token = jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '24h' });
  const context = await buildAuthContext(user);

  return { ...context, token };
}

export async function getUserService(id: string, preferredOrganizationId?: string | null) {
  const user = await findUserById(id);
  if(user) {
    const { password: _, ...userWithoutPassword } = user;
    return buildAuthContext(userWithoutPassword, preferredOrganizationId);
  }
  return null;
}

export async function previewInviteTokenService(token: string) {
  const record = await findAuthTokenByHash(hashToken(token), "workspace_invite");
  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    throw { status: 404, message: "Invite link is invalid or expired" };
  }

  return {
    email: record.email,
    workspaceId: record.workspace_id || null,
    workspaceName: String(record.metadata?.workspaceName || ""),
    role: String(record.metadata?.role || "user"),
    expiresAt: record.expires_at,
  };
}

export async function acceptInviteService(input: {
  token: string;
  password: string;
  name?: string;
}) {
  if (!input.password || String(input.password).trim().length < 8) {
    throw { status: 400, message: "Password must be at least 8 characters" };
  }

  const record = await findAuthTokenByHash(hashToken(input.token), "workspace_invite");
  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    throw { status: 404, message: "Invite link is invalid or expired" };
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const updateRes = await query(
    `UPDATE users
     SET password_hash = $1,
         name = COALESCE($2, name)
     WHERE id = $3
     RETURNING id, email, name, workspace_id, role`,
    [passwordHash, input.name?.trim() || null, record.user_id]
  );
  const user = updateRes.rows[0];

  await query(
    `UPDATE workspace_memberships
     SET status = 'active',
         updated_at = NOW()
     WHERE workspace_id = $1
       AND user_id = $2`,
    [record.workspace_id, record.user_id]
  );

  await markAuthTokenUsed(record.id);

  const token = jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: "24h" });
  const context = await buildAuthContext(user);
  await startAgentPresenceSession(user.id, {
    workspaceId: context.activeWorkspace?.workspace_id || user.workspace_id || null,
    metadata: {
      auth: "invite_accept",
    },
  });

  return { ...context, token };
}

export async function logoutService(userId: string) {
  await stopAgentPresenceSession(userId);
  return { success: true };
}

export async function requestPasswordResetService(email: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);
  if (!user) {
    return { success: true };
  }

  const otp = generateOtpCode();
  const tokenHash = hashOtp(normalizedEmail, otp);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString();

  await revokeActiveAuthTokensForUser(user.id, "password_reset_otp");
  await createAuthToken({
    userId: user.id,
    workspaceId: user.workspace_id || null,
    email: user.email,
    tokenHash,
    purpose: "password_reset_otp",
    expiresAt,
    metadata: {
      channel: "email",
    },
    createdBy: user.id,
  });

  await sendPasswordResetOtpEmail({
    to: user.email,
    otp,
    name: user.name || null,
  });

  return {
    success: true,
    ...(env.NODE_ENV !== "production" ? { previewOtp: otp } : {}),
  };
}

export async function verifyPasswordResetOtpService(email: string, otp: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedOtp = String(otp || "").trim();
  if (!normalizedEmail || !normalizedOtp) {
    throw { status: 400, message: "Email and OTP are required" };
  }

  const record = await findAuthTokenByHash(hashOtp(normalizedEmail, normalizedOtp), "password_reset_otp");
  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    throw { status: 404, message: "OTP is invalid or expired" };
  }

  return { success: true };
}

export async function resetPasswordService(email: string, otp: string, password: string) {
  if (!password || String(password).trim().length < 8) {
    throw { status: 400, message: "Password must be at least 8 characters" };
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedOtp = String(otp || "").trim();
  const record = await findAuthTokenByHash(
    hashOtp(normalizedEmail, normalizedOtp),
    "password_reset_otp"
  );
  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    throw { status: 404, message: "OTP is invalid or expired" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await query(
    `UPDATE users
     SET password_hash = $1
     WHERE id = $2`,
    [passwordHash, record.user_id]
  );
  await markAuthTokenUsed(record.id);
  await revokeActiveAuthTokensForUser(record.user_id, "password_reset_otp");

  return { success: true };
}

export async function createSupportWorkspaceSessionService(input: {
  actorUserId: string;
  workspaceId: string;
  durationHours?: number;
  consentConfirmed?: boolean;
  consentNote?: string | null;
}) {
  await assertPlatformRoles(input.actorUserId, ["super_admin", "developer"]);

  const user = await findUserById(input.actorUserId);
  if (!user) {
    throw { status: 404, message: "User not found" };
  }

  const workspace = await findWorkspaceById(input.workspaceId, input.actorUserId);
  if (!workspace) {
    throw { status: 404, message: "Workspace not found" };
  }
  const hasEntryAccess = await hasWorkspaceSupportEntryAccess(input.actorUserId, input.workspaceId);
  if (input.consentConfirmed !== true && !hasEntryAccess) {
    throw { status: 400, message: "Explicit client-consent confirmation is required before entering support mode." };
  }

  const durationHours = Math.max(1, Number(input.durationHours || 2));
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  const consentNote = String(input.consentNote || "").trim();
  const supportAccess = await upsertSupportAccess({
    workspaceId: input.workspaceId,
    userId: input.actorUserId,
    grantedBy: input.actorUserId,
    reason: consentNote || "Workspace impersonation support session with client consent confirmed",
    expiresAt,
  });

  const memberships = await listUserWorkspaceMembershipsService(user.id);
  const projectAccesses = await listUserProjectAccessService(user.id).catch(() => []);
  const workspacePermissions = await resolveRolePermissionMap("workspace_admin");
  const activeWorkspace = {
    workspace_id: input.workspaceId,
    workspace_name: workspace.name,
    role: "workspace_admin",
    status: "active",
    permissions_json: {
      support_mode: true,
      support_access_id: supportAccess.id,
      support_expires_at: supportAccess.expires_at,
    },
    effective_permissions: {
      ...workspacePermissions,
      support_access: true,
      support_mode: true,
    },
    permission_overrides: {},
  };

  const { password: _, ...userWithoutPassword } = user;
  const response = {
    user: userWithoutPassword,
    memberships,
    projectAccesses,
    activeWorkspace,
    resolvedAccess: buildResolvedAccessSnapshot({
      platformRole: user.role,
      activeWorkspace,
      activeProject: null,
      projectAccesses,
    }),
    expiresAt,
  };

  await logAuditSafe({
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
    action: "enter_support_mode",
    entity: "support_session",
    entityId: supportAccess.id,
    newData: {
      workspaceId: input.workspaceId,
      expiresAt,
      consentConfirmed: true,
      consentNote: consentNote || null,
    },
  });

  return response;
}

export async function endSupportWorkspaceSessionService(input: {
  actorUserId: string;
  workspaceId?: string | null;
}) {
  await assertPlatformRoles(input.actorUserId, ["super_admin", "developer"]);

  const user = await findUserById(input.actorUserId);
  if (!user) {
    throw { status: 404, message: "User not found" };
  }

  const targetWorkspaceId = String(input.workspaceId || "").trim() || null;
  let supportAccess =
    targetWorkspaceId
      ? await query(
          `SELECT *
           FROM support_access
           WHERE workspace_id = $1
             AND user_id = $2
             AND expires_at > NOW()
           LIMIT 1`,
          [targetWorkspaceId, input.actorUserId]
        ).then((res) => res.rows[0] || null)
      : await findLatestActiveSupportAccessByUser(input.actorUserId);

  if (targetWorkspaceId) {
    const deleted = await deleteSupportAccess(targetWorkspaceId, input.actorUserId);
    supportAccess = deleted || supportAccess;
  } else if (supportAccess?.workspace_id) {
    const deleted = await deleteSupportAccess(String(supportAccess.workspace_id), input.actorUserId);
    supportAccess = deleted || supportAccess;
  } else {
    supportAccess = await deleteLatestActiveSupportAccessByUser(input.actorUserId);
  }

  if (supportAccess?.workspace_id) {
    await logAuditSafe({
      userId: input.actorUserId,
      workspaceId: String(supportAccess.workspace_id),
      action: "exit_support_mode",
      entity: "support_session",
      entityId: String(supportAccess.id),
      oldData: {
        workspaceId: String(supportAccess.workspace_id),
        expiresAt: supportAccess.expires_at,
      },
    });
  }

  const { password: _, ...userWithoutPassword } = user;
  return buildAuthContext(userWithoutPassword);
}
