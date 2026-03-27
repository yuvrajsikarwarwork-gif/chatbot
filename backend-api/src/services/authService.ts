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

async function buildAuthContext(user: any) {
  const memberships = await listUserWorkspaceMembershipsService(user.id);
  const projectAccesses = await listUserProjectAccessService(user.id).catch(() => []);
  const activeWorkspace =
    memberships.find((membership: any) => membership.workspace_id === user.workspace_id) ||
    memberships[0] ||
    null;

  return {
    user,
    memberships,
    projectAccesses,
    activeWorkspace,
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
  const user = await findUserByEmail(email);

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
  const existing = await findUserByEmail(email);
  if (existing) {
    throw { status: 400, message: "User exists" };
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await createUser(email, hash, name, role || 'user');
  const token = jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '24h' });
  const context = await buildAuthContext(user);

  return { ...context, token };
}

export async function getUserService(id: string) {
  const user = await findUserById(id);
  if(user) {
    const { password: _, ...userWithoutPassword } = user;
    return buildAuthContext(userWithoutPassword);
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
