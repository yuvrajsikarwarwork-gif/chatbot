import { useState } from "react";
import Link from "next/link";
import { authService } from "../services/authService";
import { useAuthStore } from "../store/authStore";
import { useBotStore } from "../store/botStore";
import { useRouter } from "next/router";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setSelectedBotId = useBotStore((s) => s.setSelectedBotId);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const login = async () => {
    try {
      setIsSubmitting(true);
      setError("");

      const data = await authService.login(email.trim().toLowerCase(), password);

      localStorage.removeItem("activeBotId");
      setSelectedBotId(null);
      setAuth(
        data.user,
        data.token,
        data.memberships || [],
        data.activeWorkspace || null,
        data.projectAccesses || [],
        data.resolvedAccess || null,
        data.organizations || [],
        data.activeOrganization || null,
        data.activeOrganizationMembership || null
      );

      const isPlatformOperator =
        data.user?.role === "super_admin" || data.user?.role === "developer";
      const nextRoute = isPlatformOperator
        ? "/workspaces"
        : data.activeWorkspace?.workspace_id
          ? "/projects"
          : "/";
      router.push(nextRoute);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-text-main transition-colors duration-300">
      <div className="w-full max-w-sm rounded-[2rem] border border-border-main bg-surface p-8 shadow-xl transition-colors duration-300">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
          Bot.OS
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-text-main">
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          Access your workspace or platform control view with the Midnight Onyx shell.
        </p>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <input
          className="mt-5 w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="email"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="mt-3 w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="password"
          type="password"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          className="mt-4 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90"
          onClick={login}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in..." : "Login"}
        </button>

        <div className="mt-3 text-center">
          <Link href="/forgot-password" className="text-sm text-text-muted underline">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}

