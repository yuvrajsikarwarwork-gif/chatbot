import React, { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Bot,
  CheckCircle2,
  FolderOpen,
  Globe2,
  ImagePlus,
  Loader2,
  Mail,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Send,
  Smartphone,
  User,
} from "lucide-react";

import apiClient from "../../services/apiClient";
import MessageList from "./MessageList";
import TemplateSelectModal from "./TemplateSelectModal";

interface ChatWindowProps {
  messages: any[];
  activeConversation: any;
  onResumeBot: () => void;
  onReconnectConversation?: () => void;
  onMessageSent: (msg: any) => Promise<void>;
  canResumeBot?: boolean;
  canManualReply?: boolean;
  showCampaign?: boolean;
  showFlow?: boolean;
  showList?: boolean;
}

const platformThemes: Record<string, { label: string; icon: any; has24HourRule: boolean }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, has24HourRule: true },
  telegram: { label: "Telegram", icon: Smartphone, has24HourRule: true },
  instagram: { label: "Instagram", icon: Mail, has24HourRule: true },
  facebook: { label: "Facebook", icon: Mail, has24HourRule: true },
  email: { label: "Email", icon: Mail, has24HourRule: false },
  website: { label: "Web", icon: Globe2, has24HourRule: false },
  web: { label: "Web", icon: Globe2, has24HourRule: false },
};

const QUICK_REPLIES = [
  "On it",
  "Thanks for the update",
  "Please share more details",
  "We will get back to you shortly",
];

const panelPattern =
  "linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.78)), radial-gradient(circle at top left, rgba(0,82,204,0.04), transparent 20%), radial-gradient(circle at bottom right, rgba(15,23,42,0.03), transparent 22%)";

export default function ChatWindow({
  messages,
  activeConversation,
  onResumeBot,
  onReconnectConversation,
  onMessageSent,
  canResumeBot = true,
  canManualReply = true,
  showCampaign = true,
  showFlow = true,
  showList = true,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);

  const platformKey =
    (activeConversation?.channel || activeConversation?.platform || "whatsapp") === "web"
      ? "website"
      : String(activeConversation?.channel || activeConversation?.platform || "whatsapp").toLowerCase();
  const theme = platformThemes[platformKey] || platformThemes.whatsapp;
  const userId = activeConversation?.external_id || activeConversation?.platform_user_id;
  const conversationContext =
    activeConversation?.context_json && typeof activeConversation.context_json === "object"
      ? activeConversation.context_json
      : {};
  const csatRating = String(
    conversationContext.csat_rating || activeConversation?.csat_rating || ""
  )
    .trim()
    .toLowerCase();
  const csatPending = Boolean(conversationContext.csat_pending || activeConversation?.csat_pending);
  const csatLabel =
    csatRating === "csat_bad"
      ? "Bad"
      : csatRating === "csat_okay"
        ? "Okay"
        : csatRating === "csat_good"
          ? "Great"
          : "";

  const is24HourWindowOpen = () => {
    if (!theme.has24HourRule) return true;
    if (!activeConversation?.last_inbound_at) return false;

    const lastMsgTime = new Date(activeConversation.last_inbound_at).getTime();
    const now = Date.now();
    const hoursDifference = (now - lastMsgTime) / (1000 * 60 * 60);
    return hoursDifference < 24;
  };

  const windowOpen = is24HourWindowOpen();

  useEffect(() => {
    const container = messageScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleResume = async () => {
    if (!activeConversation) return;

    try {
      const res = await apiClient.post(`/chat/conversations/${activeConversation.id}/resume`);
      if (res.data.success) {
        onResumeBot();
      }
    } catch (err) {
      console.error("Failed to resume bot", err);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isSending) return;

    setIsSending(true);
    try {
      await onMessageSent({
        text: inputValue,
        type: "text",
      });
      setInputValue("");
    } catch (error) {
      console.error("Failed to send message", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickReply = async (value: string) => {
    if (isSending) return;

    setIsSending(true);
    try {
      await onMessageSent({
        text: value,
        type: "text",
      });
    } catch (error) {
      console.error("Failed to send quick reply", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleUploadSend = async (event: ChangeEvent<HTMLInputElement>, mode: "image" | "document") => {
    const file = event.target.files?.[0];
    if (!file || isSending) {
      event.target.value = "";
      return;
    }

    setIsSending(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiClient.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const mediaUrl = response.data?.url;
      if (!mediaUrl) {
        throw new Error("Upload response did not include a URL");
      }

      await onMessageSent({
        text: inputValue.trim() || undefined,
        type: mode,
        mediaUrl,
      });
      setInputValue("");
    } catch (error) {
      console.error("Failed to upload and send media", error);
    } finally {
      setIsSending(false);
      event.target.value = "";
    }
  };

  if (!activeConversation) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center border border-border-main bg-bg-card text-text-muted">
        <Bot size={64} className="mb-4 text-primary/25" />
        <h2 className="text-xl font-black uppercase tracking-[0.22em] text-text-main">
          No Conversation Selected
        </h2>
        <p className="mt-2 text-sm">Select a conversation from the registry to begin.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg-card">
      <div className="z-20 flex shrink-0 items-start justify-between gap-4 border-b border-border-main bg-bg-card px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-border-main bg-primary-fade text-primary">
            <User size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold leading-tight text-text-main">
                {activeConversation.display_name ||
                  activeConversation.user_name ||
                  activeConversation.name ||
                  "User"}
              </h3>
              <span className="inline-flex rounded-xs border border-primary/15 bg-primary-fade px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                {theme.label}
              </span>
            </div>
            <p className="truncate text-xs font-mono text-text-muted">
              {activeConversation.contact_phone_resolved || userId}
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-medium text-text-muted">
              {showCampaign && activeConversation.campaign_name ? (
                <span className="rounded-xs border border-border-main bg-bg-muted px-2 py-0.5 text-xs font-semibold text-text-main">
                  {activeConversation.campaign_name}
                </span>
              ) : null}
              {showFlow && activeConversation.flow_name ? (
                <span className="rounded-xs border border-border-main bg-bg-muted px-2 py-0.5 text-xs font-semibold text-text-main">
                  {activeConversation.flow_name}
                </span>
              ) : null}
              {showList && activeConversation.list_name ? (
                <span className="rounded-xs border border-border-main bg-bg-muted px-2 py-0.5 text-xs font-semibold text-text-main">
                  {activeConversation.list_name}
                </span>
              ) : null}
              {activeConversation.platform_account_name ? (
                <span className="rounded-xs border border-border-main bg-bg-muted px-2 py-0.5 text-xs font-semibold text-text-main">
                  {activeConversation.platform_account_name}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="ml-3 flex shrink-0 flex-wrap items-center gap-2">
          {csatLabel || csatPending ? (
            <span
              className={`inline-flex items-center gap-1 rounded-xs border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                csatRating === "csat_bad"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : csatRating === "csat_good"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {csatLabel || "CSAT pending"}
            </span>
          ) : null}
          {activeConversation.status === "agent_pending" && canResumeBot ? (
            <button
              onClick={handleResume}
              data-workspace-action="mutate"
              className="inline-flex items-center gap-2 rounded-sm border border-primary bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:opacity-95 active:scale-[0.99]"
            >
              <CheckCircle2 size={16} /> Resolve Issue
            </button>
          ) : null}
          {csatRating === "csat_bad" && onReconnectConversation ? (
            <button
              onClick={onReconnectConversation}
              data-workspace-action="mutate"
              className="inline-flex items-center gap-2 rounded-sm border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 shadow-sm transition-all hover:bg-rose-100 active:scale-[0.99]"
            >
              <RefreshCw size={16} /> Reconnect / Apologize
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={messageScrollRef}
        className="flex-1 min-h-0 overflow-y-auto border-y border-border-main bg-bg-main p-4"
        style={{
          backgroundImage: panelPattern,
          backgroundRepeat: "repeat",
          backgroundSize: "initial",
        }}
      >
        <MessageList messages={messages} />
      </div>

      <div className="z-20 shrink-0 border-t border-border-main bg-bg-card px-4 py-3">
        {csatLabel || csatPending ? (
          <div
            className={`mb-3 rounded-sm border px-4 py-3 text-sm font-medium shadow-sm ${
              csatRating === "csat_bad"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : csatRating === "csat_good"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {csatLabel
              ? `User rated this interaction: ${csatLabel}`
              : "CSAT survey pending"}
          </div>
        ) : null}

        {activeConversation.status === "agent_pending" ? (
          !canManualReply ? (
            <div className="rounded-sm border border-border-main bg-bg-muted px-4 py-3 text-center shadow-sm">
              <p className="text-xs font-medium text-text-main">
                Manual reply is disabled for this workspace.
              </p>
            </div>
          ) : windowOpen ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {QUICK_REPLIES.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    disabled={isSending}
                    onClick={() => handleQuickReply(reply)}
                    data-workspace-action="mutate"
                    className="rounded-sm border border-border-main bg-bg-card px-3 py-1.5 text-xs font-semibold text-text-main shadow-sm transition hover:bg-bg-muted disabled:opacity-50"
                  >
                    {reply}
                  </button>
                ))}
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`Reply to ${theme.label} message...`}
                  className="min-h-[48px] max-h-[120px] flex-1 resize-none rounded-sm border border-border-main bg-bg-card px-4 py-3 text-sm text-text-main shadow-sm transition-all placeholder:text-text-muted focus:border-primary focus:outline-none"
                  rows={1}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => handleUploadSend(event, "image")}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => handleUploadSend(event, "document")}
                />
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => imageInputRef.current?.click()}
                  data-workspace-action="mutate"
                  className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-sm border border-border-main bg-bg-card p-3 text-text-main shadow-sm transition-all hover:bg-bg-muted disabled:opacity-50"
                  title="Upload image"
                >
                  <ImagePlus size={18} />
                </button>
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => fileInputRef.current?.click()}
                  data-workspace-action="mutate"
                  className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-sm border border-border-main bg-bg-card p-3 text-text-main shadow-sm transition-all hover:bg-bg-muted disabled:opacity-50"
                  title="Upload file"
                >
                  <Paperclip size={18} />
                </button>
                {theme.has24HourRule ? (
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(true)}
                    data-workspace-action="mutate"
                    className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-sm border border-border-main bg-bg-card p-3 text-text-main shadow-sm transition-all hover:bg-bg-muted"
                    title="Send approved template"
                  >
                    <FolderOpen size={18} />
                  </button>
                ) : null}
                <button
                  disabled={isSending || !inputValue.trim()}
                  onClick={handleSend}
                  data-workspace-action="mutate"
                  className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-sm border border-primary bg-primary p-3 text-white shadow-sm transition-all disabled:bg-bg-muted disabled:opacity-50"
                >
                  {isSending ? (
                    <Loader2 size={18} className="animate-spin text-white" />
                  ) : (
                    <Send size={18} className="ml-1 text-white" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-sm border border-border-main bg-bg-card p-4 shadow-sm">
              <div className="min-w-0 pr-3">
                <p className="text-sm font-bold text-text-main">24-Hour Window Closed</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Meta requires a pre-approved template to resume contact.
                </p>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(true)}
                data-workspace-action="mutate"
                className="flex shrink-0 items-center gap-2 rounded-sm border border-primary bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-95"
              >
                <FolderOpen size={16} /> Send Template
              </button>
            </div>
          )
        ) : (
          <div className="rounded-sm border border-border-main bg-bg-muted px-4 py-3 text-center shadow-sm">
            <p className="text-xs font-medium text-text-main">
              The automation engine is currently handling this conversation.
            </p>
          </div>
        )}
      </div>

      <TemplateSelectModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        conversationId={activeConversation.id}
        activeConversation={activeConversation}
        onSend={onMessageSent}
        onSent={() => setIsTemplateModalOpen(false)}
      />
    </div>
  );
}
