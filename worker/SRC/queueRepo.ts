// worker/src/queueRepo.ts

import { query } from "../adapters/dbAdapter";
import { config } from "./config";

export const getNextJob = async () => {
  const res = await query(
    `
    SELECT *
    FROM queue_jobs
    WHERE status IN ('pending', 'retry')
    ORDER BY created_at ASC
    LIMIT 1
    `
  );

  return res.rows[0] || null;
};


export const lockJob = async (
  jobId: string
) => {
  const res = await query(
    `
    UPDATE queue_jobs
    SET
      status = 'processing',
      locked_at = NOW(),
      locked_by = $1
    WHERE
      id = $2
      AND status IN ('pending','retry')
    RETURNING *
    `,
    [config.WORKER_NAME, jobId]
  );

  return res.rows[0] || null;
};


export const markCompleted = async (
  jobId: string
) => {
  await query(
    `
    UPDATE queue_jobs
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW(),
      locked_at = NULL,
      locked_by = NULL
    WHERE id = $1
    `,
    [jobId]
  );
};


export const markRetry = async (
  jobId: string
) => {
  await query(
    `
    UPDATE queue_jobs
    SET
      retry_count = retry_count + 1,
      status = 'retry',
      locked_at = NULL,
      locked_by = NULL,
      updated_at = NOW()
    WHERE id = $1
    `,
    [jobId]
  );
};


export const markFailed = async (
  jobId: string
) => {
  await query(
    `
    UPDATE queue_jobs
    SET
      status = 'failed',
      locked_at = NULL,
      locked_by = NULL,
      updated_at = NOW()
    WHERE id = $1
    `,
    [jobId]
  );
};


export const releaseTimedOutJobs = async () => {
  await query(
    `
    UPDATE queue_jobs
    SET
      status = 'retry',
      locked_at = NULL,
      locked_by = NULL
    WHERE
      status = 'processing'
      AND locked_at < NOW() - ($1 * INTERVAL '1 millisecond')
    `,
    [config.LOCK_TIMEOUT_MS]
  );
};
