import { query } from "../config/db";
import { assertPlatformRoles } from "./workspaceAccessService";
import { markJobRetry } from "../models/queueJobModel";

export async function listQueueOpsService(userId: string, filters: { status?: string; jobType?: string } = {}) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const params: any[] = [];
  const clauses: string[] = [];

  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    clauses.push(`status = $${params.length}`);
  }

  if (filters.jobType) {
    params.push(String(filters.jobType).trim().toLowerCase());
    clauses.push(`COALESCE(job_type, type) = $${params.length}`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const res = await query(
    `
    SELECT
      id,
      COALESCE(job_type, type) AS job_type,
      status,
      payload,
      error_message,
      available_at,
      created_at,
      updated_at,
      locked_at,
      locked_by,
      retry_count,
      max_retries,
      completed_at
    FROM queue_jobs
    ${whereClause}
    ORDER BY
      CASE WHEN status IN ('failed', 'retry') THEN 0 ELSE 1 END,
      COALESCE(updated_at, created_at) DESC
    LIMIT 200
    `,
    params
  );

  const jobs = res.rows.map((row: any) => ({
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    errorMessage: row.error_message || null,
    availableAt: row.available_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lockedAt: row.locked_at || null,
    lockedBy: row.locked_by || null,
    retryCount: Number(row.retry_count || 0),
    maxRetries: row.max_retries || null,
    completedAt: row.completed_at || null,
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
  }));

  const summary = jobs.reduce<Record<string, number>>((acc, job) => {
    acc.total = (acc.total || 0) + 1;
    acc[job.status] = (acc[job.status] || 0) + 1;
    acc[job.jobType] = (acc[job.jobType] || 0) + 1;
    return acc;
  }, {});

  return { jobs, summary };
}

export async function retryQueueJobService(userId: string, jobId: string) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const res = await query(
    `SELECT id, status, payload
     FROM queue_jobs
     WHERE id = $1
     LIMIT 1`,
    [jobId]
  );
  const job = res.rows[0];
  if (!job) {
    throw { status: 404, message: "Queue job not found" };
  }

  await markJobRetry(jobId, "Manual retry requested");

  return {
    success: true,
    jobId,
    status: "retry",
  };
}

export async function retryQueueJobsService(
  userId: string,
  filters: { status?: string; jobType?: string } = {}
) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const params: any[] = [];
  const clauses: string[] = [];

  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    clauses.push(`status = $${params.length}`);
  } else {
    clauses.push(`status IN ('failed', 'retry')`);
  }

  if (filters.jobType) {
    params.push(String(filters.jobType).trim().toLowerCase());
    clauses.push(`COALESCE(job_type, type) = $${params.length}`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const res = await query(
    `
    UPDATE queue_jobs
    SET
      status = 'retry',
      retry_count = COALESCE(retry_count, 0) + 1,
      available_at = NOW(),
      error_message = 'Bulk retry requested',
      updated_at = NOW(),
      locked_at = NULL,
      locked_by = NULL
    ${whereClause}
    RETURNING id
    `,
    params
  );

  return {
    success: true,
    retriedCount: res.rowCount || 0,
  };
}

export async function getQueueJobAuditService(userId: string, jobId: string) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const jobRes = await query(
    `
    SELECT
      id,
      COALESCE(job_type, type) AS job_type,
      status,
      payload,
      error_message,
      available_at,
      created_at,
      updated_at,
      locked_at,
      locked_by,
      retry_count,
      max_retries,
      completed_at
    FROM queue_jobs
    WHERE id = $1
    LIMIT 1
    `,
    [jobId]
  );
  const job = jobRes.rows[0];
  if (!job) {
    throw { status: 404, message: "Queue job not found" };
  }

  const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
  const lookupValues = [
    String(payload.conversationId || payload.conversation_id || "").trim(),
    String(payload.leadId || payload.lead_id || "").trim(),
    String(payload.campaignId || payload.campaign_id || "").trim(),
    String(payload.ruleId || payload.rule_id || "").trim(),
  ].filter(Boolean);

  const relatedRes = lookupValues.length
    ? await query(
        `
        SELECT
          id,
          COALESCE(job_type, type) AS job_type,
          status,
          payload,
          error_message,
          available_at,
          created_at,
          updated_at,
          locked_at,
          locked_by,
          retry_count,
          max_retries,
          completed_at
        FROM queue_jobs
        WHERE id <> $1
          AND (
            payload->>'conversationId' = ANY($2::text[])
            OR payload->>'conversation_id' = ANY($2::text[])
            OR payload->>'leadId' = ANY($2::text[])
            OR payload->>'lead_id' = ANY($2::text[])
            OR payload->>'campaignId' = ANY($2::text[])
            OR payload->>'campaign_id' = ANY($2::text[])
            OR payload->>'ruleId' = ANY($2::text[])
            OR payload->>'rule_id' = ANY($2::text[])
          )
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 25
        `,
        [jobId, lookupValues]
      )
    : { rows: [] };

  const note = String(payload.operatorNote || payload.operator_note || "").trim();

  return {
    job: {
      id: job.id,
      jobType: job.job_type,
      status: job.status,
      errorMessage: job.error_message || null,
      availableAt: job.available_at || null,
      createdAt: job.created_at || null,
      updatedAt: job.updated_at || null,
      lockedAt: job.locked_at || null,
      lockedBy: job.locked_by || null,
      retryCount: Number(job.retry_count || 0),
      maxRetries: job.max_retries || null,
      completedAt: job.completed_at || null,
      payload,
      operatorNote: note,
      lineage: {
        conversationId: String(payload.conversationId || payload.conversation_id || "").trim() || null,
        leadId: String(payload.leadId || payload.lead_id || "").trim() || null,
        campaignId: String(payload.campaignId || payload.campaign_id || "").trim() || null,
        ruleId: String(payload.ruleId || payload.rule_id || "").trim() || null,
      },
    },
    relatedJobs: (relatedRes.rows || []).map((row: any) => ({
      id: row.id,
      jobType: row.job_type,
      status: row.status,
      errorMessage: row.error_message || null,
      availableAt: row.available_at || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      lockedAt: row.locked_at || null,
      lockedBy: row.locked_by || null,
      retryCount: Number(row.retry_count || 0),
      maxRetries: row.max_retries || null,
      completedAt: row.completed_at || null,
      payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    })),
  };
}

export async function updateQueueJobNoteService(userId: string, jobId: string, note: string) {
  await assertPlatformRoles(userId, ["super_admin", "developer"]);

  const res = await query(
    `
    UPDATE queue_jobs
    SET
      payload = jsonb_set(
        COALESCE(payload, '{}'::jsonb),
        '{operatorNote}',
        to_jsonb($2::text),
        true
      ),
      updated_at = NOW()
    WHERE id = $1
    RETURNING id
    `,
    [jobId, String(note || "").trim()]
  );

  if (!res.rowCount) {
    throw { status: 404, message: "Queue job not found" };
  }

  return { success: true, jobId };
}
