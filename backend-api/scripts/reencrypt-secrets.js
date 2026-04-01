const path = require("path");
const { Pool } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const {
  encryptSecret,
  decryptSecret,
  isEncryptedValue,
} = require("../dist/utils/encryption");

const ACTIVE_KEY_VERSION = String(process.env.INTEGRATION_SECRET_KEY_VERSION || "v1").trim() || "v1";

const PLATFORM_SETTINGS_SECRET_KEYS = new Set([
  "metaAppSecret",
  "metaWebhookVerifyToken",
  "smtpPass",
  "openaiApiKey",
  "geminiApiKey",
  "stripeSecretKey",
  "stripeWebhookSecret",
  "razorpayKeySecret",
  "razorpayWebhookSecret",
]);

const GENERIC_SECRET_KEYS = new Set([
  "accessToken",
  "verifyToken",
  "botToken",
  "appSecret",
]);

function parsePossiblyEncrypted(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
  }
  return value;
}

function isCurrentEncryptedValue(value) {
  const parsed = parsePossiblyEncrypted(value);
  return (
    isEncryptedValue(parsed) &&
    parsed.version === 2 &&
    String(parsed.keyVersion || "") === ACTIVE_KEY_VERSION
  );
}

function rewrapSecretValue(value) {
  if (value === null || value === undefined || value === "") {
    return { changed: false, value };
  }
  if (isCurrentEncryptedValue(value)) {
    return { changed: false, value };
  }

  const decrypted = decryptSecret(value);
  if (!decrypted) {
    return { changed: false, value };
  }

  return {
    changed: true,
    value: encryptSecret(decrypted),
  };
}

function rewrapSecretsInObject(input, secretKeys) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { changed: false, value: input };
  }

  let changed = false;
  const next = { ...input };

  for (const [key, rawValue] of Object.entries(next)) {
    if (secretKeys.has(key)) {
      const rewritten = rewrapSecretValue(rawValue);
      if (rewritten.changed) {
        next[key] = rewritten.value;
        changed = true;
      }
      continue;
    }

    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      const nested = rewrapSecretsInObject(rawValue, secretKeys);
      if (nested.changed) {
        next[key] = nested.value;
        changed = true;
      }
    }
  }

  return { changed, value: next };
}

async function run() {
  const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
  if (!connectionString) {
    throw new Error("DB_URL or DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString });
  let platformSettingsUpdated = 0;
  let platformAccountsUpdated = 0;
  let campaignChannelsUpdated = 0;

  try {
    const platformSettingsRes = await pool.query(
      `SELECT settings_key, settings_json
       FROM platform_settings`
    );

    for (const row of platformSettingsRes.rows) {
      const settings = row.settings_json && typeof row.settings_json === "object"
        ? row.settings_json
        : {};
      const rewritten = rewrapSecretsInObject(settings, PLATFORM_SETTINGS_SECRET_KEYS);
      if (!rewritten.changed) {
        continue;
      }

      await pool.query(
        `UPDATE platform_settings
         SET settings_json = $2::jsonb,
             updated_at = NOW()
         WHERE settings_key = $1`,
        [row.settings_key, JSON.stringify(rewritten.value)]
      );
      platformSettingsUpdated += 1;
    }

    const platformAccountsRes = await pool.query(
      `SELECT id, token, metadata
       FROM platform_accounts`
    );

    for (const row of platformAccountsRes.rows) {
      let changed = false;
      let nextToken = row.token;
      let nextMetadata = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};

      const rewrittenToken = rewrapSecretValue(row.token);
      if (rewrittenToken.changed) {
        nextToken = JSON.stringify(rewrittenToken.value);
        changed = true;
      }

      const rewrittenMetadata = rewrapSecretsInObject(nextMetadata, GENERIC_SECRET_KEYS);
      if (rewrittenMetadata.changed) {
        nextMetadata = rewrittenMetadata.value;
        changed = true;
      }

      if (!changed) {
        continue;
      }

      await pool.query(
        `UPDATE platform_accounts
         SET token = $2,
             metadata = $3::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, nextToken, JSON.stringify(nextMetadata)]
      );
      platformAccountsUpdated += 1;
    }

    const campaignChannelsRes = await pool.query(
      `SELECT id, config
       FROM campaign_channels
       WHERE config IS NOT NULL`
    ).catch(() => ({ rows: [] }));

    for (const row of campaignChannelsRes.rows) {
      const config = row.config && typeof row.config === "object" ? row.config : {};
      const rewritten = rewrapSecretsInObject(config, GENERIC_SECRET_KEYS);
      if (!rewritten.changed) {
        continue;
      }

      await pool.query(
        `UPDATE campaign_channels
         SET config = $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, JSON.stringify(rewritten.value)]
      );
      campaignChannelsUpdated += 1;
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          activeKeyVersion: ACTIVE_KEY_VERSION,
          updated: {
            platformSettings: platformSettingsUpdated,
            platformAccounts: platformAccountsUpdated,
            campaignChannels: campaignChannelsUpdated,
          },
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Failed to re-encrypt stored secrets", error);
  process.exit(1);
});
