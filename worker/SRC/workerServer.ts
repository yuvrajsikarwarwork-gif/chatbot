// worker/src/workerServer.ts

import {
  getNextJob,
  lockJob,
  markCompleted,
  releaseTimedOutJobs,
} from "./queueRepo";

import { processJob } from "./jobProcessor";

import {
  handleRetry,
} from "./retryManager";

import {
  logError,
} from "./analyticsRepo";

import { config } from "./config";


const sleep = (ms: number) =>
  new Promise((res) =>
    setTimeout(res, ms)
  );


const runWorker = async () => {
  console.log(
    "Worker started:",
    config.WORKER_NAME
  );

  while (true) {
    try {
      await releaseTimedOutJobs();

      const job =
        await getNextJob();

      if (!job) {
        await sleep(
          config.POLL_INTERVAL_MS
        );
        continue;
      }

      const locked =
        await lockJob(job.id);

      if (!locked) {
        continue;
      }

      try {
        await processJob(
          locked
        );

        await markCompleted(
          locked.id
        );
      } catch (err: any) {
        await logError(
          locked.id,
          err,
          locked.payload?.botId || null
        );

        await handleRetry(
          locked,
          err
        );
      }
    } catch (err) {
      console.error(
        "Worker loop error",
        err
      );

      await sleep(1000);
    }
  }
};


runWorker();
