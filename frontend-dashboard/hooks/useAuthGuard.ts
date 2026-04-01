import { useEffect } from "react";
import { useRouter } from "next/router";

import { useAuthStore } from "../store/authStore";

function getFallbackRoute(role?: string | null) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "super_admin" || normalized === "developer"
    ? "/workspaces"
    : "/projects";
}

export const useAuthGuard = (
  requiredRole?: "user" | "admin" | "developer" | "super_admin"
) => {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    if (requiredRole && user) {
      const roleWeights = {
        user: 1,
        admin: 2,
        developer: 3,
        super_admin: 4,
      };
      if (roleWeights[user.role] < roleWeights[requiredRole]) {
        router.push(getFallbackRoute(user.role));
      }
    }
  }, [isAuthenticated, user, router, requiredRole]);

  return { user, isAuthenticated: isAuthenticated() };
};
