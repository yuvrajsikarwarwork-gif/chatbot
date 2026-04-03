import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Headphones, Info, Sparkles, X } from "lucide-react";
import { useRouter } from "next/router";
import { campaignService } from "../../services/campaignService";

type SystemBotsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string | null;
  projectId?: string | null;
};

function getCampaignDisplayName(campaign: any) {
  return String(campaign?.name || campaign?.campaignName || campaign?.title || "").trim();
}

function getSettings(detail: any) {
  const settings = detail?.settings_json && typeof detail.settings_json === "object" && !Array.isArray(detail.settings_json)
    ? detail.settings_json
    : {};
  const systemFlowRules =
    settings.system_flow_rules && typeof settings.system_flow_rules === "object" && !Array.isArray(settings.system_flow_rules)
      ? settings.system_flow_rules
      : {};
  return { settings, systemFlowRules };
}

function getHandoffKeywordsValue(detail: any) {
  const { systemFlowRules } = getSettings(detail);
  return String(
    systemFlowRules.handoff_keywords ||
      systemFlowRules.keywords ||
      systemFlowRules.trigger_keywords ||
      ""
  ).trim();
}

export default function SystemBotsModal({ isOpen, onClose, workspaceId, projectId }: SystemBotsModalProps) {
  const router = useRouter();
  const [campaignDetails, setCampaignDetails] = useState<Record<string, any>>({});
  const [savingState, setSavingState] = useState<Record<string, "idle" | "saving" | "saved">>({});
  const [handoffKeywordDrafts, setHandoffKeywordDrafts] = useState<Record<string, string>>({});
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [diagnosticCampaignId, setDiagnosticCampaignId] = useState<string | null>(null);
  const clearSavedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const keywordSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  useEffect(() => {
    let cancelled = false;

    const loadCampaigns = async () => {
      if (!isOpen) return;

      try {
        const rows = await campaignService.list({
          ...(workspaceId ? { workspaceId } : {}),
          ...(projectId ? { projectId } : {}),
        });
        if (cancelled) return;
        setCampaigns(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) {
          setCampaigns([]);
        }
      }
    };

    loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, workspaceId]);

  useEffect(() => {
    let cancelled = false;

    const loadCampaignDetails = async () => {
      if (!isOpen) return;

      const campaignIds = campaigns
        .map((campaign) => String(campaign?.id || "").trim())
        .filter(Boolean);

      const entries = await Promise.all(
        campaignIds.map(async (campaignId) => {
          try {
            const detail = await campaignService.get(campaignId);
            return [campaignId, detail] as const;
          } catch {
            return [campaignId, null] as const;
          }
        })
      );

      if (cancelled) return;

      const nextDetails: Record<string, any> = {};
      for (const [campaignId, detail] of entries) {
        if (detail) {
          nextDetails[campaignId] = detail;
        }
      }
      setCampaignDetails(nextDetails);
    };

    loadCampaignDetails();

    return () => {
      cancelled = true;
    };
  }, [campaigns, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextKeywordDrafts: Record<string, string> = {};

    for (const campaign of campaigns) {
      const campaignId = String(campaign?.id || "").trim();
      if (!campaignId) continue;
      if (handoffKeywordDrafts[campaignId] !== undefined) {
        continue;
      }
      nextKeywordDrafts[campaignId] = getHandoffKeywordsValue(campaignDetails[campaignId]);
    }

    if (Object.keys(nextKeywordDrafts).length > 0) {
      setHandoffKeywordDrafts((current) => ({ ...current, ...nextKeywordDrafts }));
    }
  }, [campaignDetails, campaigns, handoffKeywordDrafts, isOpen]);

  useEffect(() => {
    return () => {
      Object.values(clearSavedTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      Object.values(keywordSaveTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const setCampaignStatus = useCallback(
    (campaignId: string, key: "handoff" | "csat", status: "idle" | "saving" | "saved") => {
      const stateKey = `${campaignId}:${key}`;
      setSavingState((current) => ({ ...current, [stateKey]: status }));

      if (clearSavedTimersRef.current[stateKey]) {
        clearTimeout(clearSavedTimersRef.current[stateKey]!);
        clearSavedTimersRef.current[stateKey] = null;
      }

      if (status === "saved") {
        clearSavedTimersRef.current[stateKey] = setTimeout(() => {
          setSavingState((current) => ({ ...current, [stateKey]: "idle" }));
          clearSavedTimersRef.current[stateKey] = null;
        }, 2500);
      }
    },
    []
  );

  const persistCampaignSettings = useCallback(
    async (campaignId: string, nextPatch: Record<string, any>, statusKey: "handoff" | "csat") => {
      const detail = campaignDetails[campaignId];
      const { settings, systemFlowRules } = getSettings(detail);
      const nextSettings = {
        ...settings,
        system_flow_rules: {
          ...systemFlowRules,
          ...nextPatch,
        },
      };

      setCampaignStatus(campaignId, statusKey, "saving");
      try {
        const saved = await campaignService.update(campaignId, { settingsJson: nextSettings });
        setCampaignDetails((current) => ({ ...current, [campaignId]: saved }));
        if (statusKey === "handoff") {
          setHandoffKeywordDrafts((current) => ({
            ...current,
            [campaignId]: getHandoffKeywordsValue(saved) || String(nextPatch.handoff_keywords || "").trim(),
          }));
        }
        setCampaignStatus(campaignId, statusKey, "saved");
      } catch (error) {
        setCampaignStatus(campaignId, statusKey, "idle");
        throw error;
      }
    },
    [campaignDetails, setCampaignStatus]
  );

  const scheduleKeywordSave = useCallback(
    (campaignId: string, nextValue: string) => {
      setHandoffKeywordDrafts((current) => ({ ...current, [campaignId]: nextValue }));

      const currentTimer = keywordSaveTimersRef.current[campaignId];
      if (currentTimer) {
        clearTimeout(currentTimer);
      }

      keywordSaveTimersRef.current[campaignId] = setTimeout(() => {
        keywordSaveTimersRef.current[campaignId] = null;
        void persistCampaignSettings(campaignId, { handoff_keywords: String(nextValue || "").trim() }, "handoff");
      }, 1500);
    },
    [persistCampaignSettings]
  );

  const saveKeywordNow = useCallback(
    (campaignId: string) => {
      const nextValue = String(handoffKeywordDrafts[campaignId] || "").trim();
      const currentTimer = keywordSaveTimersRef.current[campaignId];
      if (currentTimer) {
        clearTimeout(currentTimer);
        keywordSaveTimersRef.current[campaignId] = null;
      }
      void persistCampaignSettings(campaignId, { handoff_keywords: nextValue }, "handoff");
    },
    [handoffKeywordDrafts, persistCampaignSettings]
  );

  const handleCsatToggle = useCallback(
    (campaignId: string, enabled: boolean) => {
      void persistCampaignSettings(campaignId, { csat_enabled: enabled }, "csat");
    },
    [persistCampaignSettings]
  );

  const openCampaignFlow = useCallback(
    (campaignId: string, flowType: "handoff" | "csat") => {
      void router.push(
        `/flows?campaignId=${encodeURIComponent(campaignId)}&systemFlowType=${encodeURIComponent(flowType)}&flowId=${encodeURIComponent(flowType)}`
      );
    },
    [router]
  );

  const diagnosticSummary = useMemo(() => {
    const campaign = diagnosticCampaignId
      ? campaigns.find((item) => String(item?.id || "").trim() === diagnosticCampaignId) || null
      : campaigns[0] || null;

    if (!campaign) {
      return null;
    }

    const campaignId = String(campaign.id || "").trim();
    const detail = campaignDetails[campaignId];
    const { settings, systemFlowRules } = getSettings(detail);
    const systemFlows = settings.system_flows && typeof settings.system_flows === "object" ? settings.system_flows : {};
    const handoffFlow = systemFlows.handoff && typeof systemFlows.handoff === "object" ? systemFlows.handoff : {};
    const csatFlow = systemFlows.csat && typeof systemFlows.csat === "object" ? systemFlows.csat : {};
    const handoffNodeCount = Array.isArray(handoffFlow.nodes) ? handoffFlow.nodes.length : 0;
    const csatNodeCount = Array.isArray(csatFlow.nodes) ? csatFlow.nodes.length : 0;
    const handoffKeywords = String(
      systemFlowRules.handoff_keywords ||
        systemFlowRules.keywords ||
        systemFlowRules.trigger_keywords ||
        ""
    ).trim();

    const campaignChannels = Array.isArray(detail?.channels) ? detail.channels : [];
    const diagnostics = [
      { label: "Workspace", value: workspaceId || "Missing", ok: Boolean(workspaceId) },
      { label: "Project", value: projectId || "Missing", ok: Boolean(projectId) },
      { label: "Campaign linked", value: campaignId || "Missing", ok: Boolean(campaignId) },
      { label: "Campaign channels", value: String(campaignChannels.length || 0), ok: campaignChannels.length > 0 },
      {
        label: "Handoff flow",
        value: handoffNodeCount > 0
          ? `${String(handoffFlow.flow_name || "System Flow")} (${handoffNodeCount} nodes)`
          : "Missing",
        ok: handoffNodeCount > 0,
      },
      { label: "Handoff keywords", value: handoffKeywords || "Missing", ok: Boolean(handoffKeywords) },
      {
        label: "CSAT flow",
        value: csatNodeCount > 0
          ? `${String(csatFlow.flow_name || "System Flow")} (${csatNodeCount} nodes)`
          : "Missing",
        ok: csatNodeCount > 0,
      },
      { label: "CSAT enabled", value: systemFlowRules.csat_enabled === undefined ? "Default on" : String(Boolean(systemFlowRules.csat_enabled)), ok: systemFlowRules.csat_enabled === undefined ? true : Boolean(systemFlowRules.csat_enabled) },
    ];

    return {
      campaignId,
      displayName: getCampaignDisplayName(campaign) || `Campaign ${campaignId.slice(0, 8)}`,
      platform: campaignChannels[0]?.platform || "whatsapp",
      diagnostics,
      missing: diagnostics.filter((row) => !row.ok).map((row) => row.label),
      apiMap: [
        "GET /campaigns/:campaignId -> loads the campaign and system-flow seed",
        "GET /campaigns/:campaignId/channels -> verifies the campaign-channel link",
        "PUT /campaigns/:campaignId -> saves handoff keywords and CSAT flags",
        "POST /api/webhook/:platform/:botId -> resolves campaign + routes the message",
        "flowEngine.processIncomingMessage -> checks campaign handoff before bot triggers",
      ],
    };
  }, [campaignDetails, campaigns, diagnosticCampaignId, projectId, workspaceId]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex h-[94vh] max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-border-main bg-surface shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border-main bg-surface p-6">
          <div>
            <h2 className="font-black uppercase tracking-tighter text-text-main">Global Triggers</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Campaign-level handoff keywords and CSAT follow-up
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDiagnosticCampaignId((current) => current || campaigns[0]?.id || null)}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-amber-700 transition-colors hover:bg-amber-100"
              title="Open wiring report"
            >
              <AlertTriangle size={14} />
              Wiring Report
            </button>
            <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-primary-fade">
              <X size={20} className="text-text-muted" />
            </button>
          </div>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-0 overflow-hidden xl:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-6">
            {campaigns.map((campaign) => {
              const campaignId = String(campaign?.id || "").trim();
              if (!campaignId) return null;
              const detail = campaignDetails[campaignId];
              const { systemFlowRules } = getSettings(detail);
              const handoffKeywords =
                handoffKeywordDrafts[campaignId] ??
                String(
                  systemFlowRules.handoff_keywords ||
                    systemFlowRules.keywords ||
                    systemFlowRules.trigger_keywords ||
                    ""
                ).trim();
              const csatEnabled =
                systemFlowRules.csat_enabled !== undefined ? Boolean(systemFlowRules.csat_enabled) : true;
              const handoffState = savingState[`${campaignId}:handoff`] || "idle";
              const csatState = savingState[`${campaignId}:csat`] || "idle";
              const displayName = getCampaignDisplayName(campaign) || `Campaign ${campaignId.slice(0, 8)}`;

              return (
                <div key={campaignId} className="rounded-[1.75rem] border border-border-main bg-canvas p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xl font-black uppercase tracking-tight text-text-main">
                        {displayName}
                      </div>
                    </div>
                    <div className="rounded-full border border-border-main bg-surface px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                      Campaign Defaults
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-2">
                    <div className="flex h-full flex-col rounded-[1.35rem] border border-border-main bg-surface p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-black uppercase tracking-tight text-text-main">
                            Global: Human Handoff
                          </div>
                          <p className="mt-2 text-sm leading-6 text-text-muted">
                            Interrupts the active bot and transfers the user to an agent when keywords are detected.
                          </p>
                        </div>
                        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                          Default Bot
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-border-main bg-canvas px-4 py-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                          Default Bot Section
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-text-muted">
                          This is the campaign-level handoff route that stays active until a global trigger keyword is matched.
                        </p>
                      </div>

                      <div className="mt-5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                          Global Trigger Keywords
                        </label>
                        <input
                          type="text"
                          value={handoffKeywords}
                          onChange={(event) => scheduleKeywordSave(campaignId, event.target.value)}
                          placeholder="human, support, agent, help desk"
                          className="mt-2 w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary/40"
                        />
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                        <div className="min-h-4">
                          {handoffState === "saving" ? (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                              Saving...
                            </span>
                          ) : handoffState === "saved" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                              <Check size={12} strokeWidth={3} />
                              Saved
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveKeywordNow(campaignId)}
                            className="inline-flex items-center justify-center rounded-2xl border border-border-main bg-surface px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-main shadow-sm transition-all hover:-translate-y-0.5 active:scale-95"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => openCampaignFlow(campaignId, "handoff")}
                            className="inline-flex items-center justify-center rounded-2xl border border-primary bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95"
                          >
                            Edit Flow
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex h-full flex-col rounded-[1.35rem] border border-border-main bg-surface p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-black uppercase tracking-tight text-text-main">
                            Post-Handoff CSAT
                          </div>
                          <p className="mt-2 text-sm leading-6 text-text-muted">
                            Automatically sends a satisfaction survey when an agent closes the conversation.
                          </p>
                        </div>
                        <div className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-sky-700">
                          Survey
                        </div>
                      </div>

                      <label className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-border-main bg-canvas px-4 py-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-text-main">
                            Enable CSAT
                          </div>
                          <div className="mt-1 text-[11px] text-text-muted">
                            Keep the post-handoff survey ready for every campaign.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={csatEnabled}
                          onChange={(event) => handleCsatToggle(campaignId, event.target.checked)}
                          className="h-5 w-5 rounded border-border-main text-primary focus:ring-primary"
                        />
                      </label>

                      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                        <div className="min-h-4">
                          {csatState === "saving" ? (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                              Saving...
                            </span>
                          ) : csatState === "saved" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                              <Check size={12} strokeWidth={3} />
                              Saved
                            </span>
                          ) : null}
                        </div>
                        <button
                          onClick={() => openCampaignFlow(campaignId, "csat")}
                          className="inline-flex items-center justify-center rounded-2xl border border-primary bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95"
                        >
                          Edit Flow
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          <div className="border-t border-border-main bg-canvas/60 p-5 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-text-main">
                  <Info size={14} className="text-primary" />
                  Wiring Report
                </div>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  End-to-end platform connectivity and missing links
                </p>
              </div>
              {diagnosticSummary ? (
                <div className="rounded-full border border-border-main bg-surface px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                  {diagnosticSummary.platform}
                </div>
              ) : null}
            </div>

            {diagnosticSummary ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-[1.35rem] border border-border-main bg-surface p-4">
                  <div className="text-sm font-black uppercase tracking-tight text-text-main">
                    {diagnosticSummary.displayName}
                  </div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                    Campaign ID: {diagnosticSummary.campaignId}
                  </div>
                </div>

                <div className="rounded-[1.35rem] border border-border-main bg-surface p-4">
                  <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                    End-to-End Checks
                  </div>
                  <div className="space-y-2">
                    {diagnosticSummary.diagnostics.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-start justify-between gap-4 rounded-xl border border-border-main bg-canvas px-3 py-2"
                      >
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-text-main">
                            {row.label}
                          </div>
                          <div className="mt-1 break-all text-xs text-text-muted">{row.value}</div>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${
                            row.ok
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {row.ok ? "Connected" : "Missing"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.35rem] border border-border-main bg-surface p-4">
                  <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                    Missing Points
                  </div>
                  {diagnosticSummary.missing.length > 0 ? (
                    <ul className="space-y-2">
                      {diagnosticSummary.missing.map((item) => (
                        <li
                          key={item}
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                      No missing campaign wiring detected for this configuration.
                    </div>
                  )}
                </div>

                <div className="rounded-[1.35rem] border border-border-main bg-surface p-4">
                  <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                    Useful API Paths
                  </div>
                  <div className="space-y-2">
                    {diagnosticSummary.apiMap.map((item) => (
                      <div key={item} className="rounded-xl border border-border-main bg-canvas px-3 py-2 text-xs text-text-muted">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[1.35rem] border border-dashed border-border-main bg-surface p-4 text-sm text-text-muted">
                No campaigns loaded yet. Open the wiring report after the modal loads a campaign.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
