import {
  lockNextAvailableJob,
  markJobCompleted,
  markJobFailed,
  markJobRetry,
} from "../models/queueJobModel";
import { handleExpiredTriggerConfirmation } from "./flowConfirmationBookmarkService";

const CONFIRMATION_TIMEOUT_JOB_TYPES = ["trigger_confirmation_timeout"];
const CONFIRMATION_TIMEOUT_WORKER_NAME = "backend-trigger-confirmation-timeout";
const POLL_INTERVAL_MS = Number(process.env.TRIGGER_CONFIRMATION_TIMEOUT_POLL_INTERVAL_MS || 1000);

let processorStarted = false;
let processorBusy = false;

const processConfirmationTimeoutJob = async (job: any, io: any) => {
  const payload = job?.payload || {};
  await handleExpiredTriggerConfirmation({
    conversationId: String(payload.conversationId || ""),
    confirmationState: null,
    io,
    notify: true,
  });
};

const drainDueJobs = async (io: any) => {
  if (processorBusy) {
    return;
  }

  processorBusy = true;

  try {
    while (true) {
      const job = await lockNextAvailableJob(CONFIRMATION_TIMEOUT_JOB_TYPES, CONFIRMATION_TIMEOUT_WORKER_NAME);
      if (!job) {
        break;
      }

      try {
        await processConfirmationTimeoutJob(job, io);
        await markJobCompleted(job.id);
      } catch (error: any) {
        const errorMessage = error?.message || "Trigger confirmation timeout job failed";
        const retryCount = Number(job?.retry_count || job?.attempts || 0);
        const maxRetries = Number(job?.max_retries ?? job?.max_attempts ?? 1);

        if (retryCount + 1 >= maxRetries) {
          await markJobFailed(job.id, errorMessage);
        } else {
          await markJobRetry(job.id, errorMessage);
        }
      }
    }
  } finally {
    processorBusy = false;
  }
};

export const startFlowConfirmationTimeoutQueueProcessor = (io: any) => {
  if (processorStarted) {
    return;
  }

  processorStarted = true;
  void drainDueJobs(io);
  setInterval(() => {
    void drainDueJobs(io);
  }, POLL_INTERVAL_MS);
};
