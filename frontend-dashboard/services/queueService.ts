import apiClient from "./apiClient";

export interface QueueJobRecord {
  id: string;
  jobType: string;
  status: string;
  errorMessage: string | null;
  availableAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  retryCount: number;
  maxRetries: number | null;
  completedAt: string | null;
  payload: Record<string, unknown>;
}

export interface QueueDashboard {
  jobs: QueueJobRecord[];
  summary: Record<string, number>;
}

export const queueService = {
  list: async (filters?: { status?: string; jobType?: string }): Promise<QueueDashboard> => {
    const res = await apiClient.get("/queue/jobs", {
      params: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.jobType ? { jobType: filters.jobType } : {}),
      },
    });
    return res.data;
  },

  retry: async (jobId: string) => {
    const res = await apiClient.post(`/queue/jobs/${jobId}/retry`);
    return res.data;
  },

  retryAll: async (filters?: { status?: string; jobType?: string }) => {
    const res = await apiClient.post("/queue/jobs/retry-all", {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.jobType ? { jobType: filters.jobType } : {}),
    });
    return res.data;
  },
};
