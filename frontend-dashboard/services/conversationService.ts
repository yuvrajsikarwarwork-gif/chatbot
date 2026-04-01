import apiClient from "./apiClient";

export interface ConversationAssignment {
  id: string;
  conversation_id: string;
  agent_id: string;
  assigned_by?: string | null;
  assigned_at: string;
  assignment_type: string;
  status: string;
  notes?: string | null;
  released_at?: string | null;
  released_by?: string | null;
  agent_name?: string | null;
  agent_email?: string | null;
  assigned_by_name?: string | null;
  released_by_name?: string | null;
}

export interface ConversationNote {
  id: string;
  note: string;
  author_user_id?: string | null;
  author_name?: string | null;
  author_email?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ConversationTimelineEvent {
  event_type: "conversation" | "lead" | "message" | "identity" | string;
  event_id: string;
  source_id?: string | null;
  source_type?: string | null;
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  happened_at?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface ConversationTag {
  tag: string;
  created_at?: string;
  created_by?: string | null;
}

export interface AssignmentCapacityCandidate {
  user_id: string;
  role: string;
  name?: string | null;
  email?: string | null;
  open_assignment_count: number;
  pending_assignment_count: number;
  capacity_limit: number;
  capacity_remaining: number;
  capacity_ratio: number;
  capacity_status: "available" | "near_capacity" | "at_capacity";
  last_assigned_at?: string | null;
  has_project_access: boolean;
  scope_matches: boolean;
  eligible_for_assignment: boolean;
  recommended: boolean;
  agent_skills: string[];
  required_skills: string[];
  matched_skill_count: number;
  skill_match: boolean;
}

export interface AssignmentCapacityResponse {
  maxOpenChats: number;
  defaultAgentId?: string | null;
  conversationId?: string | null;
  requiredSkills?: string[];
  summary: {
    totalCandidates: number;
    eligibleCandidates: number;
    availableCandidates: number;
    nearCapacityCandidates: number;
    atCapacityCandidates: number;
    skillMatchedCandidates: number;
  };
  candidates: AssignmentCapacityCandidate[];
}

export const conversationService = {
  list: async (filters: Record<string, string | undefined>) => {
    const res = await apiClient.get("/conversations", {
      params: filters,
    });
    return res.data;
  },

  getDetail: async (conversationId: string) => {
    const res = await apiClient.get(`/conversations/${conversationId}`);
    return res.data;
  },

  getMessages: async (conversationId: string) => {
    const res = await apiClient.get(`/conversations/${conversationId}/messages`);
    return res.data;
  },

  getTimeline: async (conversationId: string) => {
    const res = await apiClient.get(`/conversations/${conversationId}/timeline`);
    return res.data;
  },

  updateStatus: async (conversationId: string, status: string) => {
    const res = await apiClient.put(`/conversations/${conversationId}/status`, {
      status,
    });
    return res.data;
  },

  assign: async (
    conversationId: string,
    payload: { agentId: string; assignmentType?: string; notes?: string }
  ) => {
    const res = await apiClient.post(`/conversations/${conversationId}/assign`, payload);
    return res.data;
  },

  reassign: async (
    conversationId: string,
    payload: { agentId: string; assignmentType?: string; notes?: string }
  ) => {
    const res = await apiClient.post(`/conversations/${conversationId}/reassign`, payload);
    return res.data;
  },

  release: async (conversationId: string, payload?: { notes?: string }) => {
    const res = await apiClient.post(`/conversations/${conversationId}/release`, payload || {});
    return res.data;
  },

  getAssignments: async (conversationId: string): Promise<ConversationAssignment[]> => {
    const res = await apiClient.get(`/conversations/${conversationId}/assignments`);
    return res.data;
  },

  getAssignmentCapacity: async (filters: {
    workspaceId?: string;
    projectId?: string;
    conversationId?: string;
  }): Promise<AssignmentCapacityResponse> => {
    const res = await apiClient.get("/conversations/assignment-capacity", {
      params: filters,
    });
    return res.data;
  },

  addNote: async (conversationId: string, note: string) => {
    const res = await apiClient.post(`/conversations/${conversationId}/notes`, { note });
    return res.data;
  },

  addTag: async (conversationId: string, tag: string) => {
    const res = await apiClient.post(`/conversations/${conversationId}/tags`, { tag });
    return res.data;
  },

  removeTag: async (conversationId: string, tag: string) => {
    const res = await apiClient.delete(`/conversations/${conversationId}/tags/${encodeURIComponent(tag)}`);
    return res.data;
  },

  updateList: async (conversationId: string, listId: string | null) => {
    const res = await apiClient.put(`/conversations/${conversationId}/list`, { listId });
    return res.data;
  },

  updateContext: async (
    conversationId: string,
    context: Record<string, unknown>
  ) => {
    const res = await apiClient.put(`/conversations/${conversationId}/context`, { context });
    return res.data;
  },

  reply: async (
    conversationId: string,
    payload: {
      text?: string;
      type?: string;
      templateName?: string;
      languageCode?: string;
      templateVariableValues?: Record<string, string>;
      mediaUrl?: string;
      buttons?: Array<{ id?: string; title?: string }>;
    }
  ) => {
    const res = await apiClient.post(`/conversations/${conversationId}/reply`, payload);
    return res.data;
  },
};
