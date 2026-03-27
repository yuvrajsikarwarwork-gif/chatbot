import apiClient from "./apiClient";

export interface QueueJob {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payload: any;
  attempts: number;
  created_at: string;
}

export const queueService = {
  getJobs: async (): Promise<QueueJob[]> => {
    throw new Error("Queue API is not exposed in the current backend build.");
  },

  retryJob: async (jobId: string) => {
    throw new Error(`Queue retry is not exposed in the current backend build for job ${jobId}.`);
  },
};
