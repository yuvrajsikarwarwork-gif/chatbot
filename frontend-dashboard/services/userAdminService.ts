import apiClient from "./apiClient";

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin" | "developer" | "super_admin";
  workspace_id?: string | null;
  created_at?: string;
}

export const userAdminService = {
  list: async (): Promise<PlatformUser[]> => {
    const res = await apiClient.get("/users");
    return res.data;
  },

  create: async (payload: {
    email: string;
    password: string;
    name: string;
    role: PlatformUser["role"];
  }): Promise<PlatformUser> => {
    const res = await apiClient.post("/users", payload);
    return res.data;
  },

  update: async (
    id: string,
    payload: Partial<Pick<PlatformUser, "email" | "name" | "role">>
  ): Promise<PlatformUser> => {
    const res = await apiClient.put(`/users/${id}`, payload);
    return res.data;
  },

  updateProfile: async (payload: { name: string }): Promise<PlatformUser> => {
    const res = await apiClient.put("/users/profile", payload);
    return res.data;
  },
};
