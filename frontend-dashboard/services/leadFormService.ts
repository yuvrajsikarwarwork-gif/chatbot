import apiClient from "./apiClient";

export interface LeadFormField {
  id?: string;
  fieldKey: string;
  fieldType: string;
  questionLabel: string;
  options?: string[];
  isRequired?: boolean;
  sortOrder?: number;
}

export interface LeadFormRecord {
  id: string;
  workspace_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  fields: LeadFormField[];
}

function extractLeadFormArray(payload: unknown): LeadFormRecord[] {
  if (Array.isArray(payload)) {
    return payload as LeadFormRecord[];
  }

  const wrapped = payload as { data?: unknown; items?: unknown } | null | undefined;
  if (Array.isArray(wrapped?.data)) {
    return wrapped.data as LeadFormRecord[];
  }

  if (Array.isArray(wrapped?.items)) {
    return wrapped.items as LeadFormRecord[];
  }

  return [];
}

export const leadFormService = {
  list: async (workspaceId?: string, projectId?: string) => {
    const res = await apiClient.get("/lead-forms", {
      params: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(projectId ? { projectId } : {}),
      },
    });
    return extractLeadFormArray(res.data);
  },

  get: async (id: string, projectId?: string) => {
    const res = await apiClient.get(`/lead-forms/${id}`, {
      params: projectId ? { projectId } : {},
    });
    return res.data as LeadFormRecord;
  },

  create: async (payload: {
    workspaceId: string;
    projectId?: string;
    name: string;
    fields: LeadFormField[];
  }) => {
    const res = await apiClient.post("/lead-forms", payload);
    return res.data as LeadFormRecord;
  },

  update: async (
    id: string,
    payload: {
      projectId?: string;
      name: string;
      fields: LeadFormField[];
    }
  ) => {
    const res = await apiClient.put(`/lead-forms/${id}`, payload);
    return res.data as LeadFormRecord;
  },

  remove: async (id: string, projectId?: string) => {
    const res = await apiClient.delete(`/lead-forms/${id}`, {
      data: projectId ? { projectId } : undefined,
      params: projectId ? { projectId } : undefined,
    });
    return res.data;
  },
};
