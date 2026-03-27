import Link from "next/link";
import { useState } from "react";

import { authService } from "../services/authService";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewOtp, setPreviewOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const requestOtp = async () => {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      const data = await authService.requestPasswordReset(email);
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
    try {
      setLoading(true);
      setError("");
      setMessage("");
      await authService.verifyPasswordResetOtp({ email, otp });
      setMessage("OTP verified. You can now set a new password.");
      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.error || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (password.length < 8) {
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
      await authService.resetPassword({ email, otp, password });
      setMessage("Password reset complete. You can now log in.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-7 shadow-[var(--shadow-glass)] backdrop-blur-2xl">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
          Bot.OS
        </div>
        <h1 className="mt-3 bg-[linear-gradient(180deg,var(--text),color-mix(in_srgb,var(--text)_72%,var(--accent)_28%))] bg-clip-text text-3xl font-black tracking-[-0.04em] text-transparent">
          Reset password
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Verify your email with an OTP, then choose a new password.
        </p>

        <div className="mt-4 flex gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          <span className={step >= 1 ? "text-[var(--text)]" : ""}>Email</span>
          <span>/</span>
          <span className={step >= 2 ? "text-[var(--text)]" : ""}>OTP</span>
          <span>/</span>
          <span className={step >= 3 ? "text-[var(--text)]" : ""}>Password</span>
        </div>

        <div className="mt-6 space-y-3">
          <input
            className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            disabled={step > 1}
          />

          {step >= 2 ? (
            <input
              className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="6-digit OTP"
              maxLength={6}
            />
          ) : null}

          {step >= 3 ? (
            <>
              <input
                type="password"
                className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="New password"
              />
              <input
                type="password"
                className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
              />
            </>
          ) : null}

          {previewOtp ? (
            <div className="rounded-2xl border border-cyan-300/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
              Dev OTP preview: <span className="font-semibold">{previewOtp}</span>
            </div>
          ) : null}
          {message ? (
            <div className="rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {step === 1 ? (
            <button
              onClick={requestOtp}
              disabled={loading}
              className="w-full rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5"
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <button
                onClick={verifyOtp}
                disabled={loading}
                className="w-full rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
              <button
                onClick={requestOtp}
                disabled={loading}
                className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm font-semibold text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition duration-200 hover:border-[var(--line-strong)]"
              >
                Resend OTP
              </button>
            </div>
          ) : null}

          {step === 3 ? (
            <button
              onClick={resetPassword}
              disabled={loading}
              className="w-full rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5"
            >
              {loading ? "Updating Password..." : "Update Password"}
            </button>
          ) : null}

          <Link href="/login" className="block text-center text-sm text-[var(--muted)] underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
