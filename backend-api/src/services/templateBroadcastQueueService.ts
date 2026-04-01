import { launchCampaign } from "../controllers/templateController";
import {
  lockNextAvailableJob,
  markJobCompleted,
  markJobFailed,
  markJobRetry,
} from "../models/queueJobModel";

const BROADCAST_JOB_TYPES = ["template_campaign_launch"];
const BROADCAST_WORKER_NAME = "backend-template-broadcast-processor";
const POLL_INTERVAL_MS = Number(process.env.TEMPLATE_BROADCAST_POLL_INTERVAL_MS || 5000);

let processorStarted = false;
let processorBusy = false;

function buildMockResponse(resolve: (value: any) => void) {
  return {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      resolve(payload);
      return payload;
    },
  } as any;
}

async function processBroadcastJob(job: any, io: any) {
  const payload = job?.payload || {};
  const userId = String(payload.requestedByUserId || "").trim();
  const templateId = String(payload.templateId || "").trim();
  const campaignName = String(payload.campaignName || "Scheduled Campaign").trim();
  const scheduleAt = String(payload.scheduleAt || "").trim() || null;

  if (!userId || !templateId) {
    throw new Error("Broadcast job is missing required payload");
  }

  const req = {
    user: { id: userId },
    body: {
      templateId,
      campaignName,
      contactIds: Array.isArray(payload.contactIds) ? payload.contactIds : [],
      leadIds: Array.isArray(payload.leadIds) ? payload.leadIds : [],
      scheduleAt,
    },
    headers: {
      "x-workspace-id": payload.workspaceId || "",
      "x-project-id": payload.projectId || "",
      "x-bot-id": payload.preferredBotId || "",
    },
    query: {
      workspaceId: payload.workspaceId || "",
      projectId: payload.projectId || "",
    },
    params: {},
    app: {
      get: (key: string) => (key === "io" ? io : undefined),
    },
  } as any;

  await new Promise((resolve, reject) => {
    const res = buildMockResponse(resolve);
    Promise.resolve(launchCampaign(req, res)).catch(reject);
  });
}

async function drainDueJobs(io: any) {
  if (processorBusy) {
    return;
  }

  processorBusy = true;
  try {
    while (true) {
      const job = await lockNextAvailableJob(BROADCAST_JOB_TYPES, BROADCAST_WORKER_NAME);
      if (!job) {
        break;
      }

      try {
        await processBroadcastJob(job, io);
        await markJobCompleted(job.id);
      } catch (error: any) {
        const errorMessage = error?.message || "Scheduled campaign broadcast failed";
        const retryCount = Number(job?.retry_count || job?.attempts || 0);
        const maxRetries = Number(job?.max_retries ?? job?.max_attempts ?? 3);

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
}

export const startTemplateBroadcastQueueProcessor = (io: any) => {
  if (processorStarted) {
    return;
  }

  processorStarted = true;
  void drainDueJobs(io);
  setInterval(() => {
    void drainDueJobs(io);
  }, POLL_INTERVAL_MS);
};
