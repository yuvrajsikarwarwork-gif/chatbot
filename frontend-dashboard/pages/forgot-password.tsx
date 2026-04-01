import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/router";

import { authService } from "../services/authService";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewOtp, setPreviewOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const normalizedEmail = email.trim().toLowerCase();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const isOtpValid = otp.trim().length === 6;
  const isPasswordValid = password.length >= 8;
  const canRequestOtp = !loading && isEmailValid;
  const canVerifyOtp = !loading && isEmailValid && isOtpValid;
  const canResetPassword = !loading && isEmailValid && isOtpValid && isPasswordValid && password === confirmPassword;
  const isDev = process.env.NODE_ENV !== "production";

  const requestOtp = async () => {
    if (!isEmailValid) {
      setError("Enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");
      const data = await authService.requestPasswordReset(normalizedEmail);
      setPreviewOtp(data?.previewOtp || "");
      setMessage("If the account exists, an OTP has been sent to the email address.");
      setStep(2);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to request OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!isEmailValid) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isOtpValid) {
      setError("Enter the 6-digit OTP.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");
      await authService.verifyPasswordResetOtp({ email: normalizedEmail, otp: otp.trim() });
      setMessage("OTP verified. You can now set a new password.");
      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.error || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!isEmailValid) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isOtpValid) {
      setError("Enter the 6-digit OTP.");
      return;
    }
    if (!isPasswordValid) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");
      await authService.resetPassword({ email: normalizedEmail, otp: otp.trim(), password });
      setStep(3);
      setMessage("Password reset complete. You can now log in.");
      window.setTimeout(() => {
        router.push("/login").catch(() => undefined);
      }, 1200);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080808] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(66,117,255,0.20),transparent_30%),radial-gradient(circle_at_top_right,_rgba(38,208,206,0.10),transparent_24%),linear-gradient(180deg,#0b0b0d_0%,#080808_44%,#060607_100%)]" />
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f7dff] text-sm font-black text-white shadow-[0_0_24px_rgba(79,125,255,0.55)]">
                I
              </div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">
                Bot.OS Recovery
              </div>
            </div>

            <h1 className="mt-6 max-w-2xl text-4xl font-black tracking-[-0.06em] text-white sm:text-5xl lg:text-6xl">
              Reset access without losing the thread.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/65 sm:text-lg">
              Verify the email, enter the one-time code, and set a fresh password in the same secure shell.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  Step 1
                </div>
                <div className="mt-2 text-sm font-semibold text-white">Email</div>
                <div className="mt-1 text-xs leading-5 text-white/55">Request the OTP.</div>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  Step 2
                </div>
                <div className="mt-2 text-sm font-semibold text-white">OTP</div>
                <div className="mt-1 text-xs leading-5 text-white/55">Confirm the code.</div>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  Step 3
                </div>
                <div className="mt-2 text-sm font-semibold text-white">Password</div>
                <div className="mt-1 text-xs leading-5 text-white/55">Set the new password.</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[2.25rem] bg-[#4f7dff]/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
              <div className="border-b border-white/10 bg-white/5 px-6 py-5 sm:px-8">
                <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                  Password Recovery
                </div>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">
                  Reset password
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Verify your email with an OTP, then choose a new password.
                </p>
              </div>

              <div className="p-6 sm:p-8">
                <div className="flex gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                  <span className={step >= 1 ? "text-white" : ""}>Email</span>
                  <span>/</span>
                  <span className={step >= 2 ? "text-white" : ""}>OTP</span>
                  <span>/</span>
                  <span className={step >= 3 ? "text-white" : ""}>Password</span>
                </div>

                <div className="mt-6 space-y-3">
                  <input
                    type="email"
                    autoComplete="email"
                    className="w-full rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#4f7dff] focus:ring-2 focus:ring-[#4f7dff]/35 disabled:opacity-60"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email"
                    disabled={step > 1}
                  />

                  {step >= 2 ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="w-full rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#4f7dff] focus:ring-2 focus:ring-[#4f7dff]/35"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit OTP"
                      maxLength={6}
                    />
                  ) : null}

                  {step >= 3 ? (
                    <>
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="w-full rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#4f7dff] focus:ring-2 focus:ring-[#4f7dff]/35"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="New password"
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="w-full rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#4f7dff] focus:ring-2 focus:ring-[#4f7dff]/35"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Confirm password"
                      />
                    </>
                  ) : null}

                  {message ? (
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                      {message}
                    </div>
                  ) : null}
                  {error ? (
                    <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                      {error}
                    </div>
                  ) : null}
                  {isDev && previewOtp ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/45">
                      Development preview is available in the server logs.
                    </div>
                  ) : null}

                  {step === 1 ? (
                    <button
                      type="button"
                      onClick={requestOtp}
                      disabled={!canRequestOtp}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4f7dff] px-5 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_50px_rgba(79,125,255,0.38)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#5a89ff] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? "Sending OTP..." : "Send OTP"}
                    </button>
                  ) : null}

                  {step === 2 ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={verifyOtp}
                        disabled={!canVerifyOtp}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4f7dff] px-5 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_50px_rgba(79,125,255,0.38)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#5a89ff] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading ? "Verifying..." : "Verify OTP"}
                      </button>
                      <button
                        type="button"
                        onClick={requestOtp}
                        disabled={!canRequestOtp}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Resend OTP
                      </button>
                    </div>
                  ) : null}

                  {step === 3 ? (
                    <button
                      type="button"
                      onClick={resetPassword}
                      disabled={!canResetPassword}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4f7dff] px-5 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_50px_rgba(79,125,255,0.38)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#5a89ff] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? "Updating Password..." : "Update Password"}
                    </button>
                  ) : null}

                  <Link href="/login" className="block text-center text-sm text-white/55 underline decoration-white/25 underline-offset-4 hover:text-white">
                    Back to login
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
