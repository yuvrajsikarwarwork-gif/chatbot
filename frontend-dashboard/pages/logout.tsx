import Link from "next/link";
import { useEffect } from "react";

import { sessionService } from "../services/sessionService";
import { useBotStore } from "../store/botStore";

export default function LogoutPage() {
  const setSelectedBotId = useBotStore((state) => state.setSelectedBotId);

  useEffect(() => {
    sessionService.clear();
    setSelectedBotId(null);
  }, [setSelectedBotId]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-8 shadow-[var(--shadow-glass)] backdrop-blur-2xl">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
          Bot.OS
        </div>
        <h1 className="mt-3 bg-[linear-gradient(180deg,var(--text),color-mix(in_srgb,var(--text)_72%,var(--accent)_28%))] bg-clip-text text-3xl font-black tracking-[-0.04em] text-transparent">
          You are signed out
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Your session has been cleared. Use the button below to return to the proper login screen.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5"
          >
            Go to login
          </Link>
          <Link
            href="/forgot-password"
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm font-semibold text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition duration-300 hover:-translate-y-0.5"
          >
            Reset password
          </Link>
        </div>
      </div>
    </div>
  );
}
