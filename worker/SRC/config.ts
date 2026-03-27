// worker/src/config.ts

export const config = {
  WORKER_NAME: process.env.WORKER_NAME || "worker-1",

  POLL_INTERVAL_MS: Number(
    process.env.POLL_INTERVAL_MS || 500
  ),

  MAX_RETRIES: Number(
    process.env.MAX_RETRIES || 3
  ),

  LOCK_TIMEOUT_MS: Number(
    process.env.LOCK_TIMEOUT_MS || 30000
  ),

  ENGINE_URL:
    process.env.ENGINE_URL ||
    "http://localhost:5002",

};
