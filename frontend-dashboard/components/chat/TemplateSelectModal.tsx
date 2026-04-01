import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Send, X } from "lucide-react";

import apiClient from "../../services/apiClient";
import { notify } from "../../store/uiStore";

function parseTemplateContent(template: any) {
  if (!template?.content) {
    return {
      header:
        template?.header_type && template?.header_type !== "none"
          ? { type: template.header_type, text: template.header || "" }
          : null,
      body: template?.body || "",
      footer: template?.footer || "",
      buttons: Array.isArray(template?.buttons) ? template.buttons : [],
    };
  }

  return typeof template.content === "string"
    ? JSON.parse(template.content)
    : template.content;
}

function extractTemplateTokens(template: any) {
  const content = parseTemplateContent(template) || {};
  const fields = [
    content?.header?.text,
    content?.body,
    content?.footer,
    ...(Array.isArray(content?.buttons)
      ? content.buttons.flatMap((button: any) => [button?.title, button?.value])
      : []),
  ];
  const tokens = new Set<string>();

  for (const field of fields) {
    const source = String(field || "");
    const matches = source.matchAll(/{{\s*(\d+)\s*}}/g);
    for (const match of matches) {
      const token = String(match?.[1] || "").trim();
      if (token) {
        tokens.add(token);
      }
    }
  }

  return Array.from(tokens).sort((left, right) => Number(left) - Number(right));
}

function getTemplatePreview(template: any) {
  const content = parseTemplateContent(template);
  return content?.body || template?.body || "No preview available";
}

const platformPreviewThemes: Record<string, any> = {
  whatsapp: {
    label: "WhatsApp",
    shell: "bg-emerald-50 border-emerald-200 text-emerald-950",
    message: "bg-emerald-100 text-emerald-950",
    note: "bg-emerald-100/70 text-emerald-900",
  },
  telegram: {
    label: "Telegram",
    shell: "bg-sky-50 border-sky-200 text-sky-950",
    message: "bg-sky-100 text-sky-950",
    note: "bg-sky-100/70 text-sky-900",
  },
  email: {
    label: "Email",
    shell: "bg-violet-50 border-violet-200 text-violet-950",
    message: "bg-violet-100 text-violet-950",
    note: "bg-violet-100/70 text-violet-900",
  },
  sms: {
    label: "SMS",
    shell: "bg-indigo-50 border-indigo-200 text-indigo-950",
    message: "bg-indigo-100 text-indigo-950",
    note: "bg-indigo-100/70 text-indigo-900",
  },
  instagram: {
    label: "Instagram",
    shell: "bg-pink-50 border-pink-200 text-pink-950",
    message: "bg-pink-100 text-pink-950",
    note: "bg-pink-100/70 text-pink-900",
  },
  facebook: {
    label: "Facebook",
    shell: "bg-blue-50 border-blue-200 text-blue-950",
    message: "bg-blue-100 text-blue-950",
    note: "bg-blue-100/70 text-blue-900",
  },
  website: {
    label: "Website",
    shell: "bg-canvas border-border-main text-text-main",
    message: "bg-canvas text-text-main",
    note: "bg-canvas/70 text-text-main",
  },
};

function getVariableLabel(template: any, token: string) {
  const mappedField = String(template?.variables?.[token] || "").trim();
  if (!mappedField) {
    return `Variable {{${token}}}`;
  }

  const friendly = mappedField
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `Variable {{${token}}} Â· ${friendly}`;
}

export default function TemplateSelectModal({
  isOpen,
  onClose,
  activeConversation,
  onSent,
  onSend,
}: any) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTemplates([]);
      setSelectedTemplateId("");
      setVariableValues({});
      return;
    }

    setIsLoading(true);
    apiClient
      .get("/templates", {
        params: {
          ...(activeConversation?.workspace_id ? { workspaceId: activeConversation.workspace_id } : {}),
          ...(activeConversation?.project_id ? { projectId: activeConversation.project_id } : {}),
          ...(activeConversation?.platform || activeConversation?.channel
            ? { platform: activeConversation.platform || activeConversation.channel }
            : {}),
        },
      })
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        const approved = rows.filter(
          (template) => String(template?.status || "").trim().toLowerCase() === "approved"
        );
        setTemplates(approved);
        setSelectedTemplateId(approved[0]?.id || "");
      })
      .catch((error) => {
        console.error("Failed to load templates", error);
        notify("Failed to load approved templates.", "error");
        setTemplates([]);
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, activeConversation]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === String(selectedTemplateId)) || null,
    [templates, selectedTemplateId]
  );
  const tokens = useMemo(() => extractTemplateTokens(selectedTemplate), [selectedTemplate]);
  const platform = String(activeConversation?.platform || activeConversation?.channel || "whatsapp").toLowerCase();
  const previewTheme = platformPreviewThemes[platform] || platformPreviewThemes.whatsapp;

  useEffect(() => {
    setVariableValues(Object.fromEntries(tokens.map((token) => [token, ""])));
  }, [selectedTemplateId, tokens]);

  const handleSendTemplate = async () => {
    if (!selectedTemplate) {
      notify("Choose an approved template first.", "error");
      return;
    }

    for (const token of tokens) {
      if (!String(variableValues[token] || "").trim()) {
        notify(`Fill the value for {{${token}}} before sending.`, "error");
        return;
      }
    }

    setIsSending(true);
    try {
      await onSend({
        type: "template",
        templateName: selectedTemplate.name,
        languageCode: selectedTemplate.language,
        templateVariableValues: variableValues,
      });
      onSent?.();
      onClose();
    } catch (error: any) {
      notify(error?.response?.data?.error || "Failed to send template.", "error");
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] shadow-[var(--shadow-glass)] backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.06))] p-4">
          <div>
            <h3 className="text-xl font-black text-text-main">
              Send {previewTheme.label} Template
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Choose a template, fill variables, and send it from the inbox.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--glass-border)] p-2 text-text-muted transition duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:text-text-main">
            <X size={20} />
          </button>
        </div>

        <div className="grid max-h-[70vh] gap-0 overflow-hidden lg:grid-cols-[320px_1fr]">
          <div className="max-h-[70vh] overflow-y-auto border-r border-border-main bg-canvas/90 p-4">
            {isLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-[var(--muted)]">
                <Loader2 size={16} className="animate-spin" />
                Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--muted)]">
                No approved templates found.
              </p>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`group w-full rounded-2xl border p-4 text-left transition-all duration-300 ${
                      String(selectedTemplateId) === String(template.id)
                        ? "border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-soft)]"
                        : "border-[var(--glass-border)] bg-[var(--surface)] hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--glass-surface-strong)]"
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <p className="text-xs font-black uppercase tracking-wider text-[var(--accent)]">
                        {template.name}
                      </p>
                      <Send size={14} className="text-[var(--muted)] group-hover:text-[var(--accent)]" />
                    </div>
                    <p className="line-clamp-4 break-words text-sm leading-snug text-[var(--muted)]">
                      {getTemplatePreview(template)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-5">
            {selectedTemplate ? (
              <div className="space-y-5">
                <div className={`rounded-2xl border ${previewTheme.shell} p-4`}>
                  <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Preview
                  </div>
                  <div className="mt-3 rounded-2xl bg-surface px-4 py-3 shadow-sm">
                    <div className={`rounded-2xl ${previewTheme.message} px-4 py-3 text-sm leading-6`}>
                      {getTemplatePreview(selectedTemplate)}
                    </div>
                  </div>
                </div>

                {tokens.length > 0 ? (
                  <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                      Template variables
                    </div>
                    {tokens.map((token) => (
                      <div key={token}>
                        <label className="mb-1 block text-[11px] font-bold text-[var(--text)]">
                          {getVariableLabel(selectedTemplate, token)}
                        </label>
                        <input
                          type="text"
                          value={variableValues[token] || ""}
                          onChange={(event) =>
                            setVariableValues((current) => ({
                              ...current,
                              [token]: event.target.value,
                            }))
                          }
                          placeholder={`Value for {{${token}}}`}
                          className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--line-strong)]"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--muted)]">
                    This template has no variables, so it can be sent immediately.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--muted)]">
                Choose an approved template to continue.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--glass-border)] p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[var(--glass-border)] px-4 py-2 text-xs font-black uppercase tracking-widest text-[var(--muted)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedTemplate || isSending}
            onClick={handleSendTemplate}
            className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(129,140,248,0.34)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-[0_18px_32px_var(--accent-glow)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
          >
            {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Send Template
          </button>
        </div>
      </div>
    </div>
  );
}

