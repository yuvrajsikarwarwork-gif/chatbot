import { query } from "../config/db";
import { normalizePlatform } from "../utils/platform";

type UpsertContactWithIdentityInput = {
  botId: string;
  workspaceId?: string | null;
  platform: string;
  platformUserId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[^\d+]/g, "");
  if (!normalized) return null;
  if (normalized.startsWith("00")) {
    return `+${normalized.slice(2)}`;
  }
  return normalized;
}

function normalizeIdentityValue(
  identityType: "platform_user_id" | "email" | "phone",
  value: string | null | undefined
) {
  if (identityType === "email") return normalizeEmail(value);
  if (identityType === "phone") return normalizePhone(value);
  const normalized = String(value || "").trim();
  return normalized || null;
}

function isMissingContactIdentityTable(error: any) {
  return String(error?.code || "") === "42P01";
}

async function findContactByIdentity(input: {
  workspaceId?: string | null;
  platform: string;
  identityType: "platform_user_id" | "email" | "phone";
  identityValue?: string | null;
}) {
  const workspaceId = String(input.workspaceId || "").trim();
  const identityValue = normalizeIdentityValue(input.identityType, input.identityValue);
  if (!workspaceId || !identityValue) {
    return null;
  }

  try {
    const res = await query(
      `SELECT c.*
       FROM contact_identities ci
       JOIN contacts c ON c.id = ci.contact_id
       WHERE ci.workspace_id = $1
         AND ci.platform = $2
         AND ci.identity_type = $3
         AND ci.identity_value = $4
       ORDER BY ci.updated_at DESC, ci.created_at DESC
       LIMIT 1`,
      [workspaceId, normalizePlatform(input.platform), input.identityType, identityValue]
    );

    return res.rows[0] || null;
  } catch (error: any) {
    if (isMissingContactIdentityTable(error)) {
      return null;
    }
    throw error;
  }
}

export async function linkContactIdentity(input: {
  contactId: string;
  workspaceId?: string | null;
  botId?: string | null;
  platform: string;
  identityType: "platform_user_id" | "email" | "phone";
  identityValue?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const workspaceId = String(input.workspaceId || "").trim();
  const identityValue = normalizeIdentityValue(input.identityType, input.identityValue);
  if (!workspaceId || !identityValue) {
    return null;
  }

  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};

  try {
    const res = await query(
      `INSERT INTO contact_identities
         (contact_id, workspace_id, bot_id, platform, identity_type, identity_value, metadata)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (workspace_id, platform, identity_type, identity_value)
       DO UPDATE SET
         contact_id = EXCLUDED.contact_id,
         bot_id = COALESCE(EXCLUDED.bot_id, contact_identities.bot_id),
         metadata = contact_identities.metadata || EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING *`,
      [
        input.contactId,
        workspaceId,
        input.botId || null,
        normalizePlatform(input.platform),
        input.identityType,
        identityValue,
        JSON.stringify(metadata),
      ]
    );

    return res.rows[0] || null;
  } catch (error: any) {
    if (isMissingContactIdentityTable(error)) {
      return null;
    }
    throw error;
  }
}

export async function upsertContactWithIdentity(input: UpsertContactWithIdentityInput) {
  const normalizedPlatform = normalizePlatform(input.platform);
  const workspaceId = String(input.workspaceId || "").trim() || null;
  const platformUserId = normalizeIdentityValue("platform_user_id", input.platformUserId);
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const name = String(input.name || "").trim() || "User";

  if (!platformUserId) {
    throw new Error("platformUserId is required");
  }

  let contact =
    (await findContactByIdentity({
      workspaceId,
      platform: normalizedPlatform,
      identityType: "platform_user_id",
      identityValue: platformUserId,
    })) ||
    (email
      ? await findContactByIdentity({
          workspaceId,
          platform: normalizedPlatform,
          identityType: "email",
          identityValue: email,
        })
      : null) ||
    (phone
      ? await findContactByIdentity({
          workspaceId,
          platform: normalizedPlatform,
          identityType: "phone",
          identityValue: phone,
        })
      : null);

  if (!contact) {
    const existingRes = await query(
      `SELECT *
       FROM contacts
       WHERE bot_id = $1
         AND platform_user_id = $2
       LIMIT 1`,
      [input.botId, platformUserId]
    );
    contact = existingRes.rows[0] || null;
  }

  if (!contact) {
    const insertRes = await query(
      `INSERT INTO contacts (bot_id, workspace_id, platform_user_id, name, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (bot_id, platform_user_id)
       DO UPDATE SET
         workspace_id = COALESCE(contacts.workspace_id, EXCLUDED.workspace_id),
         name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name),
         email = COALESCE(NULLIF(EXCLUDED.email, ''), contacts.email),
         phone = COALESCE(NULLIF(EXCLUDED.phone, ''), contacts.phone)
       RETURNING *`,
      [input.botId, workspaceId, platformUserId, name, email, phone]
    );
    contact = insertRes.rows[0];
  } else {
    const updateRes = await query(
      `UPDATE contacts
       SET
         workspace_id = COALESCE(workspace_id, $1),
         bot_id = COALESCE(bot_id, $2),
         platform_user_id = COALESCE(NULLIF(platform_user_id, ''), $3),
         name = COALESCE(NULLIF($4, ''), name),
         email = COALESCE(NULLIF($5, ''), email),
         phone = COALESCE(NULLIF($6, ''), phone),
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [workspaceId, input.botId, platformUserId, name, email, phone, contact.id]
    );
    contact = updateRes.rows[0] || contact;
  }

  await linkContactIdentity({
    contactId: contact.id,
    workspaceId,
    botId: input.botId,
    platform: normalizedPlatform,
    identityType: "platform_user_id",
    identityValue: platformUserId,
    metadata: {
      source: "runtime",
    },
  });

  if (email) {
    await linkContactIdentity({
      contactId: contact.id,
      workspaceId,
      botId: input.botId,
      platform: normalizedPlatform,
      identityType: "email",
      identityValue: email,
      metadata: {
        source: "runtime",
      },
    });
  }

  if (phone) {
    await linkContactIdentity({
      contactId: contact.id,
      workspaceId,
      botId: input.botId,
      platform: normalizedPlatform,
      identityType: "phone",
      identityValue: phone,
      metadata: {
        source: "runtime",
      },
    });
  }

  return contact;
}
