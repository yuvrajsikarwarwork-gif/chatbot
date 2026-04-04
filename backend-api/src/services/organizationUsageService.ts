import { query } from "../config/db";

function isRecoverableUsageQueryError(err: any) {
  return ["42P01", "42703"].includes(String(err?.code || ""));
}

function toIsoMonthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

export async function getMonthlyUsageService(organizationId: string) {
  const targetOrganizationId = String(organizationId || "").trim();
  if (!targetOrganizationId) {
    throw { status: 400, message: "Organization id is required" };
  }

  const startOfMonth = toIsoMonthStart(new Date());

  try {
    const res = await query(
      `
        SELECT
          COUNT(*)::int AS message_count,
          COALESCE(
            SUM(
              COALESCE(NULLIF(TRIM(ae.event_payload->>'tokens_total'), '')::int, 0)
            ),
            0
          )::int AS token_count
        FROM analytics_events ae
        JOIN workspaces w
          ON w.id = ae.workspace_id
        WHERE w.organization_id = $1
          AND ae.created_at >= $2::timestamptz
      `,
      [targetOrganizationId, startOfMonth]
    );

    const row = res.rows[0] || {};
    return {
      messages: Number(row.message_count || 0),
      tokens: Number(row.token_count || 0),
      startOfMonth,
      updatedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (isRecoverableUsageQueryError(err)) {
      return {
        messages: 0,
        tokens: 0,
        startOfMonth,
        updatedAt: new Date().toISOString(),
      };
    }
    throw err;
  }
}
