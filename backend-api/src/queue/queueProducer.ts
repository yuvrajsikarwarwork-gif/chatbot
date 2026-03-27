// src/queue/queueProducer.ts

import { redis } from "./redisClient";

const QUEUE_NAME = "message-processing";

export async function pushToQueue(
  job: any
) {
  await redis.lpush(
    QUEUE_NAME,
    JSON.stringify({
      ...job,
      job_type: job.job_type || job.type,
    })
  );
}
