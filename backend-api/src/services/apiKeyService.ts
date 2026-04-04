import crypto from "crypto";

import { query } from "../config/db";
import { createAuditLog } from "../models/auditLogModel";
import { findBotById } from "../models/botModel";
import { findOrganizationByWorkspaceIdService } from "./organizationService";

export type ApiKeyPrefix = "live" | "test";

export type OrganizationApiKeyRecord = {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  name: string;
  key_prefix: ApiKeyPrefix;
  key_hash: string;
  key_last_four: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  created_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
  organization_name?: string | null;
  workspace_name?: string | null;
};

export type CreateApiKeyInput = {
  organizationId: string;
  workspaceId?: string | null;
  name: string;
  prefix?: ApiKeyPrefix;
  scopes?: string[];
  createdBy?: string | null;
};

function isRecoverableApiKeyQueryError(err: any) {
  return ["42P01", "42703"].includes(String(err?.code || ""));
}

function normalizePrefix(prefix?: string | null): ApiKeyPrefix {
  const normalized = String(prefix || "test").trim().toLowerCase();
  if (normalized === "live" || normalized === "test") {
    return normalized;
  }
  throw { status: 400, message: "keyPrefix must be 'live' or 'test'" };
}

function normalizeScopes(scopes?: unknown) {
  const values = Array.isArray(scopes) ? scopes : [];
  const normalized = Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
  return normalized.length > 0 ? normalized : ["flow:execute", "analytics:read"];
}

function generateSecret() {
  return crypto.randomBytes(32).toString("base64url").replace(/[^a-zA-Z0-9]/g, "");
}

function hashApiKey(rawKey: string) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function toApiKeyRecord(row: any): OrganizationApiKeyRecord {
  return {
    id: String(row?.id || "").trim(),
    organization_id: String(row?.organization_id || "").trim(),
    workspace_id: row?.workspace_id ? String(row.workspace_id).trim() : null,
    name: String(row?.name || "").trim(),
    key_prefix: normalizePrefix(row?.key_prefix),
    key_hash: String(row?.key_hash || "").trim(),
    key_last_four: String(row?.key_last_four || "").trim(),
    scopes: Array.isArray(row?.scopes) ? row.scopes.map((item: any) => String(item || "").trim()).filter(Boolean) : [],
    last_used_at: row?.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    created_at: row?.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    created_by: row?.created_by ? String(row.created_by).trim() : null,
    revoked_at: row?.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    revoked_by: row?.revoked_by ? String(row.revoked_by).trim() : null,
    revoked_reason: row?.revoked_reason ? String(row.revoked_reason).trim() : null,
    organization_name: row?.organization_name ? String(row.organization_name).trim() : null,
    workspace_name: row?.workspace_name ? String(row.workspace_name).trim() : null,
  };
}

export async function listOrganizationApiKeysService(organizationId: string) {
  const targetOrganizationId = String(organizationId || "").trim();
  if (!targetOrganizationId) {
    throw { status: 400, message: "Organization id is required" };
  }

  try {
    const res = await query(
      `
        SELECT
          ak.*,
          o.name AS organization_name,
          w.name AS workspace_name
        FROM organization_api_keys ak
        LEFT JOIN organizations o
          ON o.id = ak.organization_id
        LEFT JOIN workspaces w
          ON w.id = ak.workspace_id
        WHERE ak.organization_id = $1
        ORDER BY ak.created_at DESC
      `,
      [targetOrganizationId]
    );

    return (res.rows || []).map(toApiKeyRecord);
  } catch (err: any) {
    if (isRecoverableApiKeyQueryError(err)) {
      return [];
    }
    throw err;
  }
}

export async function createOrganizationApiKeyService(input: CreateApiKeyInput) {
  const organizationId = String(input.organizationId || "").trim();
  const name = String(input.name || "").trim();
  if (!organizationId) {
    throw { status: 400, message: "Organization id is required" };
  }
  if (!name) {
    throw { status: 400, message: "API key name is required" };
  }

  const prefix = normalizePrefix(input.prefix || "test");
  const scopes = normalizeScopes(input.scopes);
  const workspaceId = String(input.workspaceId || "").trim() || null;

  if (workspaceId) {
    const workspaceOrg = await findOrganizationByWorkspaceIdService(workspaceId, null).catch(() => null);
    if (!workspaceOrg || String(workspaceOrg.id || "") !== organizationId) {
      throw { status: 400, message: "Selected workspace does not belong to this organization" };
    }
  }

  const secret = generateSecret();
  const fullKey = `${prefix}_${secret}`;
  const keyHash = hashApiKey(fullKey);
  const keyLastFour = fullKey.slice(-4);

  const res = await query(
    `
      INSERT INTO organization_api_keys (
        organization_id,
        workspace_id,
        name,
        key_prefix,
        key_hash,
        key_last_four,
        scopes,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8)
      RETURNING id, organization_id, workspace_id, name, key_prefix, key_hash, key_last_four, scopes, last_used_at, created_at, created_by, revoked_at, revoked_by, revoked_reason
    `,
    [organizationId, workspaceId, name, prefix, keyHash, keyLastFour, scopes, input.createdBy || null]
  );

  const row = res.rows[0];
  if (!row) {
    throw { status: 500, message: "Failed to create API key" };
  }

  await createAuditLog({
    userId: input.createdBy || null,
    actorUserId: input.createdBy || null,
    workspaceId: workspaceId || null,
    action: "create",
    entity: "organization_api_key",
    entityId: String(row.id),
    newData: {
      organization_id: organizationId,
      workspace_id: workspaceId,
      name,
      key_prefix: prefix,
      scopes,
      key_last_four: keyLastFour,
    },
    metadata: {
      organizationId,
      workspaceId,
      scopes,
    },
  }).catch(() => null);

  return {
    record: toApiKeyRecord(row),
    fullKey,
  };
}

export async function revokeOrganizationApiKeyService(
  organizationId: string,
  keyId: string,
  actorUserId?: string | null,
  reason?: string | null
) {
  const targetOrganizationId = String(organizationId || "").trim();
  const targetKeyId = String(keyId || "").trim();
  if (!targetOrganizationId) {
    throw { status: 400, message: "Organization id is required" };
  }
  if (!targetKeyId) {
    throw { status: 400, message: "Key id is required" };
  }

  const revokeReason = String(reason || "").trim();
  if (!revokeReason || revokeReason.length < 5) {
    throw { status: 400, message: "A revocation reason is required" };
  }

  const currentRes = await query(
    `
      SELECT *
      FROM organization_api_keys
      WHERE id = $1
        AND organization_id = $2
      LIMIT 1
    `,
    [targetKeyId, targetOrganizationId]
  );

  const current = currentRes.rows[0];
  if (!current) {
    throw { status: 404, message: "API key not found" };
  }

  const res = await query(
    `
      UPDATE organization_api_keys
      SET revoked_at = NOW(),
          revoked_by = $3,
          revoked_reason = $4
      WHERE id = $1
        AND organization_id = $2
      RETURNING *
    `,
    [targetKeyId, targetOrganizationId, actorUserId || null, revokeReason]
  );

  const revoked = res.rows[0];
  if (!revoked) {
    throw { status: 500, message: "Failed to revoke API key" };
  }

  await createAuditLog({
    userId: actorUserId || null,
    actorUserId: actorUserId || null,
    workspaceId: current.workspace_id || null,
    action: "revoke",
    entity: "organization_api_key",
    entityId: targetKeyId,
    oldData: {
      revoked_at: current.revoked_at,
      revoked_by: current.revoked_by,
      revoked_reason: current.revoked_reason,
    },
    newData: {
      revoked_at: revoked.revoked_at,
      revoked_by: revoked.revoked_by,
      revoked_reason: revoked.revoked_reason,
    },
    metadata: {
      organizationId: targetOrganizationId,
      reason: revokeReason,
    },
  }).catch(() => null);

  return toApiKeyRecord(revoked);
}

export async function validateApiKeyService(rawKey: string) {
  const key = String(rawKey || "").trim();
  if (!key) {
    return null;
  }

  const keyHash = hashApiKey(key);
  const res = await query(
    `
      SELECT
        ak.*,
        o.name AS organization_name,
        o.is_active AS org_active,
        w.name AS workspace_name
      FROM organization_api_keys ak
      JOIN organizations o
        ON o.id = ak.organization_id
      LEFT JOIN workspaces w
        ON w.id = ak.workspace_id
      WHERE ak.key_hash = $1
        AND ak.revoked_at IS NULL
      LIMIT 1
    `,
    [keyHash]
  ).catch((err: any) => {
    if (isRecoverableApiKeyQueryError(err)) {
      return { rows: [] };
    }
    throw err;
  });

  const row = res.rows[0];
  if (!row || !Boolean(row.org_active)) {
    return null;
  }

  void query(`UPDATE organization_api_keys SET last_used_at = NOW() WHERE id = $1`, [row.id]).catch(() => null);

  return toApiKeyRecord(row);
}

export async function validateApiKeyForBotService(rawKey: string, botId: string) {
  const apiKey = await validateApiKeyService(rawKey);
  if (!apiKey) {
    return null;
  }

  const bot = await findBotById(botId);
  if (!bot || !bot.workspace_id) {
    return null;
  }

  const botOrganization = await findOrganizationByWorkspaceIdService(String(bot.workspace_id), null).catch(() => null);
  if (!botOrganization) {
    return null;
  }

  if (String(botOrganization.id || "") !== String(apiKey.organization_id || "")) {
    return null;
  }

  if (apiKey.workspace_id && String(apiKey.workspace_id) !== String(bot.workspace_id)) {
    return null;
  }

  const scopes = new Set((apiKey.scopes || []).map((item) => String(item || "").trim()));
  if (!scopes.has("flow:execute")) {
    return null;
  }

  return {
    apiKey,
    bot,
    organization: botOrganization,
  };
}
