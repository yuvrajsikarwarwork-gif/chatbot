import { query } from "../config/db";

export interface AuthTokenRecord {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  email: string;
  token_hash: string;
  purpose: string;
  metadata: Record<string, unknown>;
  expires_at: string;
  used_at?: string | null;
  created_by?: string | null;
  created_at: string;
}

export async function createAuthToken(input: {
  userId: string;
  workspaceId?: string | null;
  email: string;
  tokenHash: string;
  purpose: string;
  metadata?: Record<string, unknown>;
  expiresAt: string;
  createdBy?: string | null;
}) {
  const res = await query(
    `INSERT INTO auth_tokens
       (user_id, workspace_id, email, token_hash, purpose, metadata, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING *`,
    [
      input.userId,
      input.workspaceId || null,
      input.email,
      input.tokenHash,
      input.purpose,
      JSON.stringify(input.metadata || {}),
      input.expiresAt,
      input.createdBy || null,
    ]
  );

  return res.rows[0] as AuthTokenRecord;
}

export async function findAuthTokenByHash(tokenHash: string, purpose: string) {
  const res = await query(
    `SELECT *
     FROM auth_tokens
     WHERE token_hash = $1
       AND purpose = $2
     LIMIT 1`,
    [tokenHash, purpose]
  );

  return (res.rows[0] as AuthTokenRecord | undefined) ?? null;
}

export async function markAuthTokenUsed(id: string) {
  const res = await query(
    `UPDATE auth_tokens
     SET used_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  return (res.rows[0] as AuthTokenRecord | undefined) ?? null;
}

export async function revokeActiveAuthTokensForUser(userId: string, purpose: string) {
  await query(
    `UPDATE auth_tokens
     SET used_at = NOW()
     WHERE user_id = $1
       AND purpose = $2
       AND used_at IS NULL
       AND expires_at > NOW()`,
    [userId, purpose]
  );
}
