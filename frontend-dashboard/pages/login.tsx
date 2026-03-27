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

      const data = await authService.login(email, password);

      localStorage.removeItem("activeBotId");
      setSelectedBotId(null);
      setAuth(
        data.user,
        data.token,
        data.memberships || [],
        data.activeWorkspace || null,
        data.projectAccesses || [],
        data.resolvedAccess || null
      );

      const isPlatformOperator =
        data.user?.role === "super_admin" || data.user?.role === "developer";
      router.push(isPlatformOperator ? "/workspaces" : "/");
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-7 shadow-[var(--shadow-glass)] backdrop-blur-2xl">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
          Bot.OS
        </div>
        <h1 className="mt-3 bg-[linear-gradient(180deg,var(--text),color-mix(in_srgb,var(--text)_72%,var(--accent)_28%))] bg-clip-text text-3xl font-black tracking-[-0.04em] text-transparent">
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Access your workspace or platform control view with the updated glass shell.
        </p>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <input
          className="mt-5 w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
          placeholder="email"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="mt-3 w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
          placeholder="password"
          type="password"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          className="mt-4 w-full rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5"
          onClick={login}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in..." : "Login"}
        </button>

        <div className="mt-3 text-center">
          <Link href="/forgot-password" className="text-sm text-[var(--muted)] underline">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
