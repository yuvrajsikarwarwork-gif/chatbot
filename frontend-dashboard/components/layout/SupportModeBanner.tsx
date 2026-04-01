import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/router";
import { authService } from "../../services/authService";
import { useAuthStore } from "../../store/authStore";
import { useVisibility } from "../../hooks/useVisibility";
import { notify } from "../../store/uiStore";

function formatExpiry(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function SupportModeBanner() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const resolvedAccess = useAuthStore((state) => state.resolvedAccess);
  const memberships = useAuthStore((state) => state.memberships);
  const projectAccesses = useAuthStore((state) => state.projectAccesses);
  const { supportAccess } = useVisibility();
  const [ending, setEnding] = useState(false);

  const banner = useMemo(() => {
    const supportMode =
      supportAccess &&
      (Boolean(resolvedAccess?.support_access) ||
        Boolean(activeWorkspace?.permissions_json?.support_mode));
    if (!supportMode || !activeWorkspace?.workspace_id) {
      return null;
    }

    return {
      workspaceName:
        activeWorkspace.workspace_name ||
        (activeWorkspace as unknown as { name?: string })?.name ||
        activeWorkspace.workspace_id,
      expiresAt: formatExpiry(activeWorkspace.permissions_json?.support_expires_at),
      actorName: user?.name || user?.email || "Platform operator",
    };
  }, [activeWorkspace, resolvedAccess?.support_access, user?.email, user?.name]);

  if (!banner) {
    return null;
  }

  return (
    <div className="support-mode-banner fixed inset-x-0 top-0 z-[90] border-b border-[rgba(255,255,255,0.18)] px-4 py-3 text-white shadow-[0_18px_40px_rgba(127,29,29,0.28)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)]">
            <ShieldAlert size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[rgba(255,235,235,0.82)]">
              Support Mode
            </div>
            <div className="truncate text-sm font-semibold text-white">
              {banner.actorName} is acting inside {banner.workspaceName}
            </div>
            <div className="mt-1 text-xs leading-5 text-[rgba(255,245,245,0.82)]">
              Platform pages like <span className="font-semibold text-white">Permissions</span>, <span className="font-semibold text-white">Plans</span>, <span className="font-semibold text-white">Logs</span>, <span className="font-semibold text-white">Tickets</span>, and <span className="font-semibold text-white">System Settings</span> are hidden while this support session is active.
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 text-left lg:items-end lg:text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(255,238,238,0.86)]">
            {banner.expiresAt ? `Access expires ${banner.expiresAt}` : "Support access active"}
          </div>
          <div className="max-w-xl text-[11px] leading-5 text-[rgba(255,245,245,0.78)]">
            This is expected. Support mode keeps the session bound to the current workspace so platform controls stay out of the way until you exit support mode.
          </div>
        </div>
        <button
          type="button"
          disabled={ending}
          onClick={async () => {
            try {
              setEnding(true);
              const data = await authService.endSupportSession();
              useAuthStore.setState((state) => ({
                user: data.user || user || state.user,
                memberships: Array.isArray(data.memberships) ? data.memberships : memberships,
                activeWorkspace: data.activeWorkspace || null,
                projectAccesses: Array.isArray(data.projectAccesses) ? data.projectAccesses : projectAccesses,
                activeProject: null,
                resolvedAccess: data.resolvedAccess || null,
              }));
              notify("Support mode ended.", "success");
              if (typeof window !== "undefined") {
                window.location.assign("/workspaces");
                return;
              }
              router.replace("/workspaces").catch(() => undefined);
            } catch (error) {
              console.error("Failed to end support mode", error);
              notify("Failed to end support mode.", "error");
            } finally {
              setEnding(false);
            }
          }}
          className="rounded-full border border-[rgba(255,255,255,0.22)] bg-[rgba(255,255,255,0.1)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-[rgba(255,255,255,0.16)] disabled:opacity-60"
        >
          {ending ? "Exiting..." : "Exit Support Mode"}
        </button>
      </div>
    </div>
  );
}
