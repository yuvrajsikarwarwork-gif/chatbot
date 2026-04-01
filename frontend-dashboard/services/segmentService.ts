import apiClient from "./apiClient";

export interface SegmentLibraryRecord {
  id: string;
  campaignId: string;
  campaignName: string;
  campaignSlug: string;
  workspaceId?: string | null;
  projectId?: string | null;
  botId?: string | null;
  botName?: string | null;
  platform: string;
  name: string;
  listKey: string;
  sourceType: string;
  isSystem: boolean;
  filters: Record<string, unknown>;
  metadata: Record<string, unknown>;
  leadCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export const segmentService = {
  list: async (filters?: {
    workspaceId?: string;
    projectId?: string;
    sourceType?: string;
    campaignId?: string;
  }): Promise<SegmentLibraryRecord[]> => {
    const res = await apiClient.get("/segments", {
      params: {
        ...(filters?.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters?.projectId ? { projectId: filters.projectId } : {}),
        ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
        ...(filters?.campaignId ? { campaignId: filters.campaignId } : {}),
      },
    });
    return res.data;
  },
};
