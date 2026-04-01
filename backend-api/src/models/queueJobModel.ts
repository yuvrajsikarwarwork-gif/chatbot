// src/models/queueJobModel.ts

import { query } from "../config/db";

type CreateJobOptions = {
  status?: string;
  availableAt?: string | Date | null;
  maxRetries?: number | null;
};

export async function createJob(
  type: string,
  payload: any,
  options: CreateJobOptions = {}
) {
  const res = await query(
    `
    INSERT INTO queue_jobs
    (job_type, status, payload, available_at, max_retries, updated_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
    RETURNING *
    `,
    [
      type,
      options.status || "pending",
      payload,
      options.availableAt || new Date().toISOString(),
      options.maxRetries ?? null,
    ]
  );

  return res.rows[0];
}

export async function updateJobStatus(
  id: string,
  status: string
) {
  await query(
    `
    UPDATE queue_jobs
    SET status = $1, updated_at = NOW()
    WHERE id = $2
    `,
    [status, id]
  );
}

export async function cancelPendingJobsByConversation(
  conversationId: string,
  jobTypes: string[]
) {
  if (!conversationId || jobTypes.length === 0) {
    return;
  }

  await query(
    `
    UPDATE queue_jobs
    SET status = 'cancelled', updated_at = NOW()
    WHERE status IN ('pending', 'retry')
      AND COALESCE(job_type, type) = ANY($2::text[])
      AND payload->>'conversationId' = $1
    `,
    [conversationId, jobTypes]
  );
}

export async function lockNextAvailableJob(
  jobTypes: string[],
  workerName: string
) {
  if (jobTypes.length === 0) {
    return null;
  }

  const res = await query(
    `
    WITH next_job AS (
      SELECT id
      FROM queue_jobs
      WHERE status IN ('pending', 'retry')
        AND COALESCE(job_type, type) = ANY($1::text[])
        AND available_at <= NOW()
      ORDER BY available_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE queue_jobs q
    SET
      status = 'processing',
      locked_at = NOW(),
      locked_by = $2,
      updated_at = NOW()
    FROM next_job
    WHERE q.id = next_job.id
    RETURNING q.*
    `,
    [jobTypes, workerName]
  );

  return res.rows[0] || null;
}

export async function markJobCompleted(id: string) {
  await query(
    `
    UPDATE queue_jobs
    SET
      status = 'completed',
      updated_at = NOW(),
      locked_at = NULL,
      locked_by = NULL
    WHERE id = $1
    `,
    [id]
  );
}

export async function markJobRetry(id: string, errorMessage?: string | null) {
  await query(
    `
    UPDATE queue_jobs
    SET
      retry_count = COALESCE(retry_count, 0) + 1,
      status = 'retry',
      available_at = NOW(),
      error_message = $2,
      updated_at = NOW(),
      locked_at = NULL,
      locked_by = NULL
    WHERE id = $1
    `,
    [id]
  );
}

export async function markJobFailed(id: string, errorMessage?: string | null) {
  await query(
    `
    UPDATE queue_jobs
    SET
      status = 'failed',
      error_message = $2,
      updated_at = NOW(),
      locked_at = NULL,
      locked_by = NULL
    WHERE id = $1
    `,
    [id]
  );
}
