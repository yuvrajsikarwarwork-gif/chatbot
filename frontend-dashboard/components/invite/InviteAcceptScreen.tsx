import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";

import { authService } from "../../services/authService";
import { useAuthStore } from "../../store/authStore";

type InvitePreview = {
  email?: string;
  workspaceName?: string;
  role?: string;
};

type InviteAcceptScreenProps = {
  token: string;
  sourceLabel?: string;
};

export default function InviteAcceptScreen({ token, sourceLabel = "Workspace Invite" }: InviteAcceptScreenProps) {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const redirectTimer = useRef<number | null>(null);

  const workspaceName = invite?.workspaceName || "your workspace";
  const inviteHeading = useMemo(() => `Welcome to ${workspaceName}`, [workspaceName]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Invite link is invalid or incomplete.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setInvite(null);

    authService
      .previewInvite(token)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setInvite(data);
        setName(data?.email?.split("@")[0] || "");
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.response?.data?.error || "Invite link is invalid");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) {
        window.clearTimeout(redirectTimer.current);
      }
    };
  }, []);

  const handleSubmit = async () => {
    if (!token || submitting || success) {
      return;
    }

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
      setSuccess(true);
      redirectTimer.current = window.setTimeout(() => {
        router.push("/");
      }, 1100);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to accept invite");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080808] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(66,117,255,0.20),transparent_32%),radial-gradient(circle_at_top_right,_rgba(38,208,206,0.12),transparent_24%),linear-gradient(180deg,#0b0b0d_0%,#080808_40%,#060607_100%)]" />
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f7dff] text-sm font-black text-white shadow-[0_0_24px_rgba(79,125,255,0.55)]">
                I
              </div>
              <div className="text-sm font-semibold tracking-[0.18em] text-white/80 uppercase">
                Iterra Studio
              </div>
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-black tracking-[-0.06em] text-white sm:text-5xl lg:text-6xl">
              Premium workspace access, without the noise.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/65 sm:text-lg">
              Set your password, join the workspace, and step into the Iterra Dark experience.
              Clean onboarding. Fast access. No clutter.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/70">
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl">
                Secure invite
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl">
                Dark mode ready
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl">
                Mobile friendly
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[2.25rem] bg-[#4f7dff]/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
              <div className="border-b border-white/10 bg-white/5 px-6 py-5 sm:px-8">
                <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                  {sourceLabel}
                </div>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">
                  {inviteHeading}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  {invite ? `You were invited as ${invite.role || "a team member"}.` : "Loading your invite details."}
                </p>
              </div>

              <div className="p-6 sm:p-8">
                {loading ? (
                  <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-5 py-6 text-sm text-white/60">
                    Loading invite...
                  </div>
                ) : invite ? (
                  <div className="space-y-4">
                    <div className="rounded-[1.25rem] border border-white/10 bg-black/25 px-5 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                        Invite Details
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-white/80">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-white/50">Email</span>
                          <span className="text-right font-medium text-white">{invite.email || "Not provided"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-white/50">Workspace</span>
                          <span className="text-right font-medium text-white">{invite.workspaceName || "Workspace"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-white/50">Role</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold text-white">
                            {invite.role || "Member"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                          Your name
                        </span>
                        <input
                          className="w-full rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#4f7dff] focus:ring-2 focus:ring-[#4f7dff]/35"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="Enter your name"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                          New password
                        </span>
                        <input
                          type="password"
                          className="w-full rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#4f7dff] focus:ring-2 focus:ring-[#4f7dff]/35"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="Create your password"
                        />
                      </label>
                    </div>

                    {error ? (
                      <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {error}
                      </div>
                    ) : null}

                    {success ? (
                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 size={16} />
                          Welcome aboard!
                        </div>
                        <div className="mt-1 text-emerald-100/70">
                          Redirecting you to your dashboard...
                        </div>
                      </div>
                    ) : null}

                    <button
                      onClick={handleSubmit}
                      disabled={submitting || success}
                      className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4f7dff] px-5 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_50px_rgba(79,125,255,0.38)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#5a89ff] hover:shadow-[0_22px_70px_rgba(79,125,255,0.50)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Joining...
                        </>
                      ) : success ? (
                        <>
                          <Sparkles size={16} />
                          Welcome aboard
                        </>
                      ) : (
                        <>
                          Join Workspace
                          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-[1.25rem] border border-rose-500/20 bg-rose-500/10 px-5 py-6 text-sm text-rose-100">
                    {error || "Invite not found."}
                  </div>
                )}

                <div className="mt-6 border-t border-white/10 pt-5 text-xs leading-6 text-white/45">
                  Tip: open this invite from your phone and keep the page visible while you set your password.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
