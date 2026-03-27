import bcrypt from "bcryptjs";

import {
  createUser,
  findUserByEmail,
  listUsers,
  findUserById,
  updateUserById,
} from "../models/userModel";
import { assertPlatformRoles } from "./workspaceAccessService";
import { logAuditSafe } from "./auditLogService";

const PLATFORM_ROLES = ["user", "admin", "developer", "super_admin"] as const;

function normalizePlatformRole(role?: string) {
  const normalized = String(role || "user").trim().toLowerCase();
  if (!PLATFORM_ROLES.includes(normalized as (typeof PLATFORM_ROLES)[number])) {
    throw { status: 400, message: `Unsupported platform role '${role}'` };
  }

  return normalized;
}

export async function listPlatformUsersService(actorUserId: string) {
  await assertPlatformRoles(actorUserId, ["super_admin", "developer"]);
  return listUsers();
}

export async function createPlatformUserService(
  actorUserId: string,
  payload: {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
  }
) {
  await assertPlatformRoles(actorUserId, ["super_admin", "developer"]);

  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const name = String(payload.name || "").trim();
  const role = normalizePlatformRole(payload.role);

  if (!email || !password || !name) {
    throw { status: 400, message: "email, password, and name are required" };
  }

  if (password.length < 8) {
    throw { status: 400, message: "Password must be at least 8 characters" };
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    throw { status: 409, message: "User already exists" };
  }

  const hash = await bcrypt.hash(password, 10);
  const created = await createUser(email, hash, name, role);
  await logAuditSafe({
    userId: actorUserId,
    action: "create",
    entity: "platform_user",
    entityId: created.id,
    newData: created as unknown as Record<string, unknown>,
  });
  return created;
}

export async function updatePlatformUserService(
  actorUserId: string,
  userId: string,
  payload: {
    name?: string;
    email?: string;
    role?: string;
  }
) {
  await assertPlatformRoles(actorUserId, ["super_admin", "developer"]);
  const existing = await findUserById(userId);

  const nextRole = payload.role !== undefined ? normalizePlatformRole(payload.role) : undefined;
  const updatePayload: {
    name?: string;
    email?: string;
    role?: string;
  } = {};

  if (payload.name !== undefined) {
    updatePayload.name = String(payload.name || "").trim();
  }
  if (payload.email !== undefined) {
    updatePayload.email = String(payload.email || "").trim().toLowerCase();
  }
  if (nextRole !== undefined) {
    updatePayload.role = nextRole;
  }

  const updated = await updateUserById(userId, updatePayload);

  if (!updated) {
    throw { status: 404, message: "User not found" };
  }

  await logAuditSafe({
    userId: actorUserId,
    action: "update",
    entity: "platform_user",
    entityId: userId,
    oldData: (existing || {}) as Record<string, unknown>,
    newData: updated as unknown as Record<string, unknown>,
  });

  return updated;
}
