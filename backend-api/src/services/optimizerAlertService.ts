import { env } from "../config/env";
import { query } from "../config/db";
import { sendTransactionalEmail } from "./mailService";
import { notifyPlatformOperators } from "./notificationService";
import { NodeOptimizationService } from "./NodeOptimizationService";

const DEFAULT_WINDOW_HOURS = 1;
const DEFAULT_COOLDOWN_HOURS = 6;
const DEFAULT_FAILURE_RATE_THRESHOLD = 0.3;
const DEFAULT_MIN_ATTEMPTS = 10;

type OptimizerAlertReason = "failure_spike";

export interface OptimizerAlertHistoryRow {
  id: string;
  workspaceId: string;
  flowId: string | null;
  nodeId: string;
  alertType: OptimizerAlertReason;
  windowStart: string;
  windowEnd: string;
  totalAttempts: number;
  failureCount: number;
  failureRate: number;
  avgConfidence: number | null;
  sampleInputs: string[];
  cooldownUntil: string | null;
  notifiedChannels: string[];
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedBy?: string | null;
  statusUpdatedAt?: string | null;
  resolutionNote?: string | null;
}

export interface OptimizerAlertEvaluationRow {
  workspaceId: string;
  flowId: string | null;
  nodeId: string;
  nodeType: string | null;
  totalAttempts: number;
  failureCount: number;
  fallbackCount?: number;
  avgConfidence: number | null;
  failureRate: number;
  reasonBucket: string;
  sampleInputs: string[];
  lastSeenAt?: string | null;
}

export interface OptimizerAlertResult {
  nodeId: string;
  flowId: string | null;
  alertType: OptimizerAlertReason;
  status: "triggered" | "skipped_cooldown" | "skipped_threshold" | "failed";
  workspaceId: string;
  totalAttempts: number;
  failureCount: number;
  failureRate: number;
  avgConfidence: number | null;
  sampleInputs: string[];
  historyId?: string | null;
  cooldownUntil?: string | null;
  message?: string | null;
}

export interface OptimizerAlertSweepResult {
  success: boolean;
  evaluatedWorkspaces: number;
  triggered: number;
  skippedCooldown: number;
  skippedThreshold: number;
  failed: number;
  results: OptimizerAlertResult[];
}

async function tableExists(tableName: string) {
  const res = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
     ) AS exists`,
    [tableName]
  );

  return Boolean(res.rows[0]?.exists);
}

function toNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toIsoOrNull(value: unknown) {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSampleInputs(value: unknown, limit = 5) {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of items) {
    const next = String(item || "").trim();
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    output.push(next);
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function buildAppLink(workspaceId: string) {
  const base = String(env.PUBLIC_APP_BASE_URL || "http://localhost:3000").trim().replace(/\/$/, "");
  return `${base}/analytics?workspaceId=${encodeURIComponent(workspaceId)}`;
}

function buildAlertMessage(row: OptimizerAlertEvaluationRow) {
  const failurePercent = Math.round(row.failureRate * 100);
  const confidencePercent = row.avgConfidence === null ? "n/a" : `${Math.round(row.avgConfidence * 100)}%`;
  return [
    `Optimizer spike detected for node ${row.nodeId}.`,
    `Failure rate: ${failurePercent}% over the last hour.`,
    `Avg confidence: ${confidencePercent}.`,
    `Open the analytics dashboard and review the Optimizer tab: ${buildAppLink(row.workspaceId)}.`,
  ].join(" ");
}

function buildAlertEmailBody(row: OptimizerAlertEvaluationRow) {
  const failurePercent = Math.round(row.failureRate * 100);
  const confidencePercent = row.avgConfidence === null ? "n/a" : `${Math.round(row.avgConfidence * 100)}%`;
  const samples = row.sampleInputs.slice(0, 5).map((item) => `<li>${item.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>`).join("");
  const link = buildAppLink(row.workspaceId);

  return {
    subject: `Optimizer alert: node ${row.nodeId.slice(0, 8)} spiked to ${failurePercent}% failure`,
    text: [
      `Optimizer spike detected for node ${row.nodeId}.`,
      `Workspace: ${row.workspaceId}`,
      `Flow: ${row.flowId || "n/a"}`,
      `Failure rate: ${failurePercent}%`,
      `Avg confidence: ${confidencePercent}`,
      `Open the analytics dashboard: ${link}`,
      `Sample inputs: ${row.sampleInputs.slice(0, 5).join(" | ") || "n/a"}`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin: 0 0 12px; color: #7c3aed;">Optimizer alert</h2>
        <p style="margin: 0 0 8px;">Node <strong>${row.nodeId}</strong> crossed the failure threshold in the last hour.</p>
        <ul style="margin: 0 0 12px; padding-left: 18px;">
          <li><strong>Workspace:</strong> ${row.workspaceId}</li>
          <li><strong>Flow:</strong> ${row.flowId || "n/a"}</li>
          <li><strong>Failure rate:</strong> ${failurePercent}%</li>
          <li><strong>Average confidence:</strong> ${confidencePercent}</li>
        </ul>
        <p style="margin: 0 0 8px;">
          <a href="${link}" style="color: #7c3aed; text-decoration: none; font-weight: 600;">Open the Optimizer dashboard</a>
        </p>
        <p style="margin: 12px 0 6px; font-weight: 600;">Sample inputs</p>
        <ul style="margin: 0; padding-left: 18px;">
          ${samples || "<li>n/a</li>"}
        </ul>
      </div>
    `,
  };
}

async function ensureAlertHistoryTable() {
  return tableExists("optimizer_alert_events");
}

async function ensureAlertStatusColumns() {
  if (!(await ensureAlertHistoryTable())) {
    return false;
  }

  const res = await query(
    `SELECT
       to_regclass('public.optimizer_alert_events') IS NOT NULL AS table_exists,
       EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'optimizer_alert_events'
           AND column_name = 'status_updated_at'
       ) AS has_status_updated_at
     `
  );

  return Boolean(res.rows[0]?.table_exists);
}

async function hasRecentCooldown(workspaceId: string, nodeId: string, alertType: OptimizerAlertReason, cooldownHours: number) {
  const res = await query(
    `SELECT id, created_at, cooldown_until
     FROM optimizer_alert_events
     WHERE workspace_id = $1
       AND node_id = $2
       AND alert_type = $3
       AND (cooldown_until IS NOT NULL AND cooldown_until > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, nodeId, alertType]
  );

  if (res.rows[0]) {
    return {
      alertId: String(res.rows[0].id || ""),
      cooldownUntil: toIsoOrNull(res.rows[0].cooldown_until),
    };
  }

  const recentRes = await query(
    `SELECT id, created_at, cooldown_until
     FROM optimizer_alert_events
     WHERE workspace_id = $1
       AND node_id = $2
       AND alert_type = $3
       AND created_at >= NOW() - ($4::int * INTERVAL '1 hour')
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, nodeId, alertType, Math.max(1, cooldownHours)]
  );

  if (recentRes.rows[0]) {
    return {
      alertId: String(recentRes.rows[0].id || ""),
      cooldownUntil: toIsoOrNull(recentRes.rows[0].cooldown_until),
    };
  }

  return null;
}

async function storeAlertHistory(
  row: OptimizerAlertEvaluationRow,
  cooldownHours: number,
  notifiedChannels: string[],
  windowHours: number
) {
  const cooldownUntil = new Date(Date.now() + Math.max(1, cooldownHours) * 60 * 60 * 1000);
  const metadata = {
    reasonBucket: row.reasonBucket,
    nodeType: row.nodeType,
  };

  const res = await query(
    `INSERT INTO optimizer_alert_events (
       workspace_id,
       flow_id,
       node_id,
       alert_type,
       window_start,
       window_end,
       total_attempts,
       failure_count,
       failure_rate,
       avg_confidence,
       sample_inputs,
       cooldown_until,
       notified_channels,
       status,
       metadata
     )
     VALUES ($1, $2, $3, $4, NOW() - ($5::int * INTERVAL '1 hour'), NOW(), $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb, 'triggered', $13::jsonb)
     RETURNING *`,
    [
      row.workspaceId,
      row.flowId || null,
      row.nodeId,
      "failure_spike",
      Math.max(1, windowHours),
      row.totalAttempts,
      row.failureCount,
      row.failureRate,
      row.avgConfidence,
      JSON.stringify(row.sampleInputs || []),
      cooldownUntil.toISOString(),
      JSON.stringify(notifiedChannels || []),
      JSON.stringify(metadata),
    ]
  );

  const record = res.rows[0] || {};
  return {
    id: String(record.id || ""),
    cooldownUntil: toIsoOrNull(record.cooldown_until) || cooldownUntil.toISOString(),
  };
}

async function notifyRecipients(row: OptimizerAlertEvaluationRow, message: string) {
  const recipientRes = await query(
    `SELECT id, email, name
     FROM users
     WHERE role IN ('super_admin', 'developer')
       AND COALESCE(NULLIF(TRIM(email), ''), '') <> ''`
  );

  const emails = Array.from(
    new Set(
      (recipientRes.rows || [])
        .map((item: any) => String(item?.email || "").trim())
        .filter(Boolean)
    )
  );

  const notificationPromise = notifyPlatformOperators({
    workspaceId: row.workspaceId,
    type: "optimizer_failure_spike",
    message,
    metadata: {
      nodeId: row.nodeId,
      flowId: row.flowId,
      failureRate: row.failureRate,
      totalAttempts: row.totalAttempts,
      avgConfidence: row.avgConfidence,
      sampleInputs: row.sampleInputs.slice(0, 5),
      link: buildAppLink(row.workspaceId),
    },
  });

  const emailPayload = buildAlertEmailBody(row);
  const emailPromise = Promise.allSettled(
    emails.map((to) =>
      sendTransactionalEmail({
        to,
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text,
      })
    )
  );

  const [notificationResult] = await Promise.allSettled([notificationPromise, emailPromise]);

  const channels = ["in_app"];
  if (notificationResult.status === "fulfilled") {
    channels.push("notification");
  }

  return {
    channels,
    emails: emails.length,
  };
}

export type OptimizerAlertStatus = "triggered" | "acknowledged" | "resolved";

export class OptimizerAlertService {
  static async evaluateWorkspaceFailureSpikeAlerts(input: {
    workspaceId: string;
    windowHours?: number;
    cooldownHours?: number;
    failureRateThreshold?: number;
    minAttempts?: number;
  }): Promise<OptimizerAlertResult[]> {
    const workspaceId = String(input.workspaceId || "").trim();
    if (!workspaceId) {
      return [];
    }

    if (!(await ensureAlertHistoryTable())) {
      return [];
    }

    const windowHours = Math.max(1, Math.min(Number(input.windowHours || DEFAULT_WINDOW_HOURS), 24));
    const cooldownHours = Math.max(1, Math.min(Number(input.cooldownHours || DEFAULT_COOLDOWN_HOURS), 168));
    const threshold = Number.isFinite(Number(input.failureRateThreshold))
      ? Number(input.failureRateThreshold)
      : DEFAULT_FAILURE_RATE_THRESHOLD;
    const minAttempts = Math.max(1, Math.min(Number(input.minAttempts || DEFAULT_MIN_ATTEMPTS), 1000));

    const reports = await NodeOptimizationService.getUnderperformingNodes({
      workspaceId,
      sinceHours: windowHours,
      limit: 100,
    });

    const candidates = reports.filter((row) => {
      const totalAttempts = Number(row.totalAttempts || 0);
      const failureRate = Number(row.failureRate || 0);
      return totalAttempts >= minAttempts && failureRate >= threshold;
    });

    const results: OptimizerAlertResult[] = [];

    for (const row of candidates) {
      try {
        const reasonBucket = String(row.reasonBucket || "low_confidence").trim().toLowerCase();
        const alertType: OptimizerAlertReason = "failure_spike";

        const cooldown = await hasRecentCooldown(workspaceId, row.nodeId, alertType, cooldownHours);
        if (cooldown) {
          results.push({
            workspaceId,
            nodeId: row.nodeId,
            flowId: row.flowId,
            alertType,
            status: "skipped_cooldown",
            totalAttempts: row.totalAttempts,
            failureCount: row.failureCount,
            failureRate: row.failureRate,
            avgConfidence: row.avgConfidence,
            sampleInputs: row.sampleInputs,
            cooldownUntil: cooldown.cooldownUntil || null,
            message: "Alert is within cooldown window.",
          });
          continue;
        }

        const alertRow = {
          workspaceId,
          flowId: row.flowId,
          nodeId: row.nodeId,
          nodeType: row.nodeType,
          reasonBucket,
          totalAttempts: row.totalAttempts,
          failureCount: row.failureCount,
          failureRate: row.failureRate,
          avgConfidence: row.avgConfidence,
          sampleInputs: row.sampleInputs,
        };

        const notificationSummary = buildAlertMessage({
          ...alertRow,
          reasonBucket,
        });

        const dispatch = await notifyRecipients(alertRow, notificationSummary);
        const saved = await storeAlertHistory(alertRow, cooldownHours, dispatch.channels, windowHours);

        results.push({
          workspaceId,
          nodeId: row.nodeId,
          flowId: row.flowId,
          alertType,
          status: "triggered",
          totalAttempts: row.totalAttempts,
          failureCount: row.failureCount,
          failureRate: row.failureRate,
          avgConfidence: row.avgConfidence,
          sampleInputs: row.sampleInputs,
          historyId: saved.id,
          cooldownUntil: saved.cooldownUntil,
        });
      } catch (error: any) {
        results.push({
          workspaceId,
          nodeId: row.nodeId,
          flowId: row.flowId,
          alertType: "failure_spike",
          status: "failed",
          totalAttempts: row.totalAttempts,
          failureCount: row.failureCount,
          failureRate: row.failureRate,
          avgConfidence: row.avgConfidence,
          sampleInputs: row.sampleInputs,
          message: String(error?.message || error || "Failed to dispatch alert"),
        });
      }
    }

    return results;
  }

  static async evaluateAllWorkspacesFailureSpikeAlerts(input?: {
    windowHours?: number;
    cooldownHours?: number;
    failureRateThreshold?: number;
    minAttempts?: number;
  }): Promise<OptimizerAlertSweepResult> {
    if (!(await ensureAlertHistoryTable())) {
      return {
        success: true,
        evaluatedWorkspaces: 0,
        triggered: 0,
        skippedCooldown: 0,
        skippedThreshold: 0,
        failed: 0,
        results: [],
      };
    }

    const windowHours = Math.max(1, Math.min(Number(input?.windowHours || DEFAULT_WINDOW_HOURS), 24));

    const workspaceRes = await query(
      `SELECT DISTINCT workspace_id
       FROM registry_events
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
         AND node_id IS NOT NULL
         AND UPPER(event_type) IN ('AI_INTENT_RESULT', 'AI_EXTRACT_RESULT')
       ORDER BY workspace_id ASC`,
      [windowHours]
    );

    const workspaceIds = (workspaceRes.rows || [])
      .map((row: any) => String(row?.workspace_id || "").trim())
      .filter(Boolean);

    const allResults: OptimizerAlertResult[] = [];
    for (const workspaceId of workspaceIds) {
      const results = await this.evaluateWorkspaceFailureSpikeAlerts({
        workspaceId,
        ...(input?.windowHours !== undefined ? { windowHours: input.windowHours } : {}),
        ...(input?.cooldownHours !== undefined ? { cooldownHours: input.cooldownHours } : {}),
        ...(input?.failureRateThreshold !== undefined ? { failureRateThreshold: input.failureRateThreshold } : {}),
        ...(input?.minAttempts !== undefined ? { minAttempts: input.minAttempts } : {}),
      });
      allResults.push(...results);
    }

    return {
      success: true,
      evaluatedWorkspaces: workspaceIds.length,
      triggered: allResults.filter((item) => item.status === "triggered").length,
      skippedCooldown: allResults.filter((item) => item.status === "skipped_cooldown").length,
      skippedThreshold: allResults.filter((item) => item.status === "skipped_threshold").length,
      failed: allResults.filter((item) => item.status === "failed").length,
      results: allResults,
    };
  }

  static async listWorkspaceAlertHistory(
    workspaceId: string,
    limit = 20,
    status?: string | null
  ): Promise<OptimizerAlertHistoryRow[]> {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId || !(await ensureAlertHistoryTable())) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(Number(limit || 20), 100));
    const normalizedStatus = String(status || "").trim().toLowerCase();
    const hasStatusFilter = Boolean(normalizedStatus);
    const params: Array<string | number> = [normalizedWorkspaceId];
    const whereClauses = ["workspace_id = $1"];
    if (hasStatusFilter) {
      params.push(normalizedStatus);
      whereClauses.push(`status = $${params.length}`);
    }
    params.push(safeLimit);
    const res = await query(
      `SELECT *
       FROM optimizer_alert_events
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );

    return (res.rows || []).map((row: any) => ({
      id: String(row.id || ""),
      workspaceId: String(row.workspace_id || ""),
      flowId: row.flow_id ? String(row.flow_id) : null,
      nodeId: String(row.node_id || ""),
      alertType: String(row.alert_type || "failure_spike") as OptimizerAlertReason,
      windowStart: String(row.window_start || ""),
      windowEnd: String(row.window_end || ""),
      totalAttempts: toNumber(row.total_attempts, 0),
      failureCount: toNumber(row.failure_count, 0),
      failureRate: Number(row.failure_rate || 0),
      avgConfidence: row.avg_confidence === null || row.avg_confidence === undefined ? null : Number(row.avg_confidence),
      sampleInputs: normalizeSampleInputs(row.sample_inputs, 5),
      cooldownUntil: toIsoOrNull(row.cooldown_until),
      notifiedChannels: Array.isArray(row.notified_channels) ? row.notified_channels.map((value: any) => String(value || "").trim()).filter(Boolean) : [],
      status: String(row.status || "triggered"),
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      createdAt: String(row.created_at || ""),
      acknowledgedAt: toIsoOrNull(row.acknowledged_at),
      resolvedAt: toIsoOrNull(row.resolved_at),
      acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : null,
      resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
      statusUpdatedAt: toIsoOrNull(row.status_updated_at),
    }));
  }

  static async updateAlertStatus(input: {
    alertId: string;
    userId: string;
    status: OptimizerAlertStatus;
    workspaceId?: string | null;
    note?: string | null;
  }): Promise<OptimizerAlertHistoryRow | null> {
    const alertId = String(input.alertId || "").trim();
    const userId = String(input.userId || "").trim();
    const status = String(input.status || "").trim().toLowerCase() as OptimizerAlertStatus;
    const workspaceId = String(input.workspaceId || "").trim();
    const note = String(input.note || "").trim();

    if (!alertId || !userId || !["acknowledged", "resolved"].includes(status)) {
      return null;
    }

    if (!(await ensureAlertStatusColumns())) {
      return null;
    }

    const updates: string[] = ["status = $3", "status_updated_at = NOW()"];
    const params: Array<string | null> = [alertId, userId, status];

    if (status === "acknowledged") {
      updates.push("acknowledged_at = COALESCE(acknowledged_at, NOW())");
      updates.push("acknowledged_by = COALESCE(acknowledged_by, $2::uuid)");
    }

    if (status === "resolved") {
      updates.push("resolved_at = COALESCE(resolved_at, NOW())");
      updates.push("resolved_by = COALESCE(resolved_by, $2::uuid)");
      updates.push("resolution_note = COALESCE(NULLIF(TRIM($4), ''), resolution_note)");
      params.push(note);
    }

    const whereClauses = ["id = $1"];
    if (workspaceId) {
      params.push(workspaceId);
      whereClauses.push(`workspace_id = $${params.length}`);
    }

    const res = await query(
      `UPDATE optimizer_alert_events
       SET ${updates.join(", ")}
       WHERE ${whereClauses.join(" AND ")}
       RETURNING *`,
      params
    );

    const row = res.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: String(row.id || ""),
      workspaceId: String(row.workspace_id || ""),
      flowId: row.flow_id ? String(row.flow_id) : null,
      nodeId: String(row.node_id || ""),
      alertType: String(row.alert_type || "failure_spike") as OptimizerAlertReason,
      windowStart: String(row.window_start || ""),
      windowEnd: String(row.window_end || ""),
      totalAttempts: toNumber(row.total_attempts, 0),
      failureCount: toNumber(row.failure_count, 0),
      failureRate: Number(row.failure_rate || 0),
      avgConfidence: row.avg_confidence === null || row.avg_confidence === undefined ? null : Number(row.avg_confidence),
      sampleInputs: normalizeSampleInputs(row.sample_inputs, 5),
      cooldownUntil: toIsoOrNull(row.cooldown_until),
      notifiedChannels: Array.isArray(row.notified_channels) ? row.notified_channels.map((value: any) => String(value || "").trim()).filter(Boolean) : [],
      status: String(row.status || "triggered"),
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      createdAt: String(row.created_at || ""),
      acknowledgedAt: toIsoOrNull(row.acknowledged_at),
      resolvedAt: toIsoOrNull(row.resolved_at),
      acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : null,
      resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
      statusUpdatedAt: toIsoOrNull(row.status_updated_at),
      resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
    };
  }
}
