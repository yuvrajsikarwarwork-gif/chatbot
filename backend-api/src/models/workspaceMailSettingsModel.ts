import { query } from "../config/db";
import { decryptSecret, encryptSecret } from "../utils/encryption";

export interface WorkspaceMailSettingsRow {
  workspace_id: string;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_pass?: unknown;
  smtp_from?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WorkspaceMailSettingsView {
  workspaceId: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFrom: string | null;
  smtpPassConfigured: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function encodeSecret(value: string) {
  return JSON.stringify(encryptSecret(value));
}

function decodeSecret(value: unknown) {
  const decoded = decryptSecret(value);
  return decoded && decoded.trim() ? decoded.trim() : null;
}

export function toWorkspaceMailSettingsView(
  row: WorkspaceMailSettingsRow | null | undefined
): WorkspaceMailSettingsView | null {
  if (!row) {
    return null;
  }

  return {
    workspaceId: String(row.workspace_id || "").trim(),
    smtpHost: decodeSecret(row.smtp_host),
    smtpPort: row.smtp_port === undefined || row.smtp_port === null ? null : Number(row.smtp_port),
    smtpUser: decodeSecret(row.smtp_user),
    smtpFrom: decodeSecret(row.smtp_from),
    smtpPassConfigured: Boolean(decodeSecret(row.smtp_pass)),
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function findWorkspaceMailSettingsByWorkspaceId(workspaceId: string) {
  const res = await query(
    `SELECT *
     FROM workspace_settings
     WHERE workspace_id = $1
     LIMIT 1`,
    [workspaceId]
  );

  return (res.rows[0] || null) as WorkspaceMailSettingsRow | null;
}

export async function upsertWorkspaceMailSettings(input: {
  workspaceId: string;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
  userId?: string | null;
}) {
  const res = await query(
    `INSERT INTO workspace_settings (
       workspace_id,
       smtp_host,
       smtp_port,
       smtp_user,
       smtp_pass,
       smtp_from,
       created_by,
       updated_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $7
     )
     ON CONFLICT (workspace_id)
     DO UPDATE SET
       smtp_host = EXCLUDED.smtp_host,
       smtp_port = EXCLUDED.smtp_port,
       smtp_user = EXCLUDED.smtp_user,
       smtp_pass = EXCLUDED.smtp_pass,
       smtp_from = EXCLUDED.smtp_from,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [
      input.workspaceId,
      input.smtpHost ? encodeSecret(input.smtpHost) : null,
      input.smtpPort ?? null,
      input.smtpUser ? encodeSecret(input.smtpUser) : null,
      input.smtpPass ? encodeSecret(input.smtpPass) : null,
      input.smtpFrom ? encodeSecret(input.smtpFrom) : null,
      input.userId || null,
    ]
  );

  return res.rows[0] as WorkspaceMailSettingsRow;
}
