import { createJob } from "../models/queueJobModel";
import { pushToQueue } from "../queue/queueProducer";
import {
  assertBotWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";

export async function addJob(
  botId: string,
  userId: string,
  job: {
    type: string;
    payload: any;
  }
) {
  const bot = await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.editBots
  );

  if (!bot.workspace_id || !bot.project_id) {
    throw {
      status: 409,
      message: "Queue jobs now require bots to belong to a workspace project",
    };
  }

  const securedPayload = {
    ...job.payload,
    botId: bot.id,
    workspaceId: bot.workspace_id,
    projectId: bot.project_id,
  };

  const dbJob = await createJob(job.type, securedPayload);

  await pushToQueue({
    id: dbJob.id,
    job_type: job.type,
    payload: securedPayload,
  });

  return dbJob;
}
