import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { authService } from "../services/authService";
import { useAuthStore } from "../store/authStore";

export default function AcceptInvitePage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [invite, setInvite] = useState<any>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const token = typeof router.query.token === "string" ? router.query.token : "";

  useEffect(() => {
    if (!router.isReady || !token) {
      return;
    }

    authService
      .previewInvite(token)
      .then((data) => {
        setInvite(data);
        setName(data?.email?.split("@")[0] || "");
      })
      .catch((err: any) => {
        setError(err?.response?.data?.error || "Invite link is invalid");
      })
      .finally(() => setLoading(false));
  }, [router.isReady, token]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError("");
      const data = await authService.acceptInvite({ token, password, name });
      setAuth(
        data.user,
        data.token,
        data.memberships || [],
        data.activeWorkspace || null,
        data.projectAccesses || [],
        data.resolvedAccess || null
      );
      router.push("/");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to accept invite");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-7 shadow-[var(--shadow-glass)] backdrop-blur-2xl">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
          Workspace Invite
        </div>
        <h1 className="mt-3 bg-[linear-gradient(180deg,var(--text),color-mix(in_srgb,var(--text)_72%,var(--accent)_28%))] bg-clip-text text-3xl font-black tracking-[-0.04em] text-transparent">
          Accept invite
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Join your workspace and set your password.
        </p>
        {loading ? <div className="mt-6 text-sm text-[var(--muted)]">Loading invite...</div> : null}
        {invite ? (
          <div className="mt-6 space-y-3">
            <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
              {invite.email} invited to {invite.workspaceName} as {invite.role}
            </div>
            <input
              className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
            <input
              type="password"
              className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New password"
            />
            {error ? <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5 disabled:opacity-60"
            >
              {submitting ? "Joining..." : "Join Workspace"}
            </button>
          </div>
        ) : null}
        {!loading && !invite && !error ? (
          <div className="mt-6 text-sm text-[var(--muted)]">Invite not found.</div>
        ) : null}
      </div>
    </div>
  );
}
