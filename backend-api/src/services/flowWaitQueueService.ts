import {
  lockNextAvailableJob,
  markJobCompleted,
  markJobFailed,
  markJobRetry,
} from "../models/queueJobModel";
import {
  handleWaitingNodeTimeout,
  sendWaitingNodeReminder,
} from "./flowEngine";

const FLOW_WAIT_JOB_TYPES = ["flow_wait_reminder", "flow_wait_timeout"];
const FLOW_WAIT_WORKER_NAME = "backend-flow-wait-processor";
const POLL_INTERVAL_MS = Number(process.env.FLOW_WAIT_POLL_INTERVAL_MS || 1000);

let processorStarted = false;
let processorBusy = false;

const processFlowWaitJob = async (job: any, io: any) => {
  const payload = job?.payload || {};
  const type = String(job?.type || "");

  if (type === "flow_wait_reminder") {
    await sendWaitingNodeReminder({
      conversationId: String(payload.conversationId || ""),
      waitingNodeId: String(payload.waitingNodeId || ""),
      reminderText: String(payload.reminderText || ""),
      io,
    });
    return;
  }

  if (type === "flow_wait_timeout") {
    await handleWaitingNodeTimeout({
      conversationId: String(payload.conversationId || ""),
      botId: String(payload.botId || ""),
      platformUserId: String(payload.platformUserId || ""),
      waitingNodeId: String(payload.waitingNodeId || ""),
      channel: String(payload.channel || "whatsapp"),
      timeoutFallback: String(payload.timeoutFallback || ""),
      io,
    });
    return;
  }

  throw new Error(`Unsupported flow wait job type: ${type}`);
};

const drainDueJobs = async (io: any) => {
  if (processorBusy) {
    return;
  }

  processorBusy = true;

  try {
    while (true) {
      const job = await lockNextAvailableJob(FLOW_WAIT_JOB_TYPES, FLOW_WAIT_WORKER_NAME);
      if (!job) {
        break;
      }

      try {
        await processFlowWaitJob(job, io);
        await markJobCompleted(job.id);
      } catch (error: any) {
        const errorMessage = error?.message || "Flow wait job failed";
        const retryCount = Number(job?.attempts || 0);
        const maxRetries = Number(job?.max_attempts ?? 2);

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

export const startFlowWaitQueueProcessor = (io: any) => {
  if (processorStarted) {
    return;
  }

  processorStarted = true;
  void drainDueJobs(io);
  setInterval(() => {
    void drainDueJobs(io);
  }, POLL_INTERVAL_MS);
};
