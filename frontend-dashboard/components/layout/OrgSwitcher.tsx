import { useEffect, useRef, useState } from "react";
import { ChevronDown, Building2 } from "lucide-react";
import { useRouter } from "next/router";

import { authService } from "../../services/authService";
import { useAuthStore } from "../../store/authStore";

export default function OrgSwitcher() {
  const router = useRouter();
  const organizations = useAuthStore((state) => state.organizations);
  const activeOrganization = useAuthStore((state) => state.activeOrganization);
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!switcherRef.current) {
        return;
      }

      if (!switcherRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (!organizations || organizations.length <= 1) {
    return null;
  }

  const activeLabel = activeOrganization?.name || "Select Organization";

  const handleSwitch = async (organizationId: string) => {
    if (!organizationId || organizationId === activeOrganization?.id || isSwitching) {
      setIsOpen(false);
      return;
    }

    try {
      setIsSwitching(true);
      setIsOpen(false);
      await authService.switchOrganization(organizationId);
      await router.replace("/workspaces");
    } catch (error) {
      console.error("Failed to switch organization", error);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div ref={switcherRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex max-w-[18rem] items-center gap-3 rounded-xl border border-border-main bg-surface px-3 py-2 text-left shadow-sm transition hover:bg-canvas"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-black uppercase tracking-[0.24em] text-primary/70">
            Organization
          </span>
          <span className="block truncate text-xs font-semibold text-text-main">
            {isSwitching ? "Switching..." : activeLabel}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[19rem] overflow-hidden rounded-2xl border border-border-main bg-surface shadow-2xl">
          <div className="border-b border-border-main px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
              Your organizations
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {organizations.map((organization) => {
              const isActive = activeOrganization?.id === organization.id;
              return (
                <button
                  key={organization.id}
                  type="button"
                  onClick={() => handleSwitch(organization.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
                    isActive ? "bg-primary/10 text-primary" : "hover:bg-canvas text-text-main"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{organization.name}</span>
                    <span className="block text-[10px] uppercase tracking-[0.16em] text-text-muted">
                      {organization.planTier || "free"} plan
                    </span>
                  </span>
                  {isActive ? (
                    <span className="ml-3 h-2 w-2 rounded-full bg-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
