import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, X } from "lucide-react";

import apiClient from "../../services/apiClient";
import { notify } from "../../store/uiStore";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  template: any | null;
};

type VariableDescriptor = {
  token: string;
  mappedField: string;
  label: string;
  helpText: string;
  autoValue?: "recipient";
};

const NAME_FIELDS = new Set(["name", "full_name", "user_name"]);
const EMAIL_FIELDS = new Set(["email", "lead_email", "work_email"]);
const PHONE_FIELDS = new Set(["phone", "mobile", "wa_number", "phone_number"]);

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

function extractVariableTokens(template: any) {
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

function formatFriendlyField(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getVariableDescriptor(template: any, token: string): VariableDescriptor {
  const mappedField = String(template?.variables?.[token] || "").trim();
  const friendlyField = mappedField ? formatFriendlyField(mappedField) : "Manual value";

  if (PHONE_FIELDS.has(mappedField)) {
    return {
      token,
      mappedField,
      label: `Variable {{${token}}} - ${friendlyField}`,
      helpText: "Auto-filled from recipient phone.",
      autoValue: "recipient",
    };
  }

  return {
    token,
    mappedField,
    label: `Variable {{${token}}} - ${friendlyField}`,
    helpText: mappedField
      ? `Assigned to ${friendlyField}.`
      : "No field mapping saved for this variable.",
  };
}

const sendTemplateThemes: Record<string, any> = {
  whatsapp: {
    label: "WhatsApp",
    shell: "bg-emerald-50 border-emerald-200 text-emerald-950",
    message: "bg-emerald-100 text-emerald-950",
    note: "bg-emerald-100/80 text-emerald-900",
  },
  telegram: {
    label: "Telegram",
    shell: "bg-sky-50 border-sky-200 text-sky-950",
    message: "bg-sky-100 text-sky-950",
    note: "bg-sky-100/80 text-sky-900",
  },
  email: {
    label: "Email",
    shell: "bg-violet-50 border-violet-200 text-violet-950",
    message: "bg-violet-100 text-violet-950",
    note: "bg-violet-100/80 text-violet-900",
  },
  sms: {
    label: "SMS",
    shell: "bg-indigo-50 border-indigo-200 text-indigo-950",
    message: "bg-indigo-100 text-indigo-950",
    note: "bg-indigo-100/80 text-indigo-900",
  },
  instagram: {
    label: "Instagram",
    shell: "bg-pink-50 border-pink-200 text-pink-950",
    message: "bg-pink-100 text-pink-950",
    note: "bg-pink-100/80 text-pink-900",
  },
  facebook: {
    label: "Facebook",
    shell: "bg-blue-50 border-blue-200 text-blue-950",
    message: "bg-blue-100 text-blue-950",
    note: "bg-blue-100/80 text-blue-900",
  },
  website: {
    label: "Web",
    shell: "bg-canvas border-border-main text-text-main",
    message: "bg-canvas text-text-main",
    note: "bg-canvas/80 text-text-main",
  },
};

function getRecipientLabel(platformType: string) {
  const platform = String(platformType || "").trim().toLowerCase();
  if (platform === "email") return "Recipient email";
  if (platform === "website") return "Recipient id";
  return "Recipient phone";
}

export default function SingleSendTemplateModal({ isOpen, onClose, template }: Props) {
  const [recipient, setRecipient] = useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [manualVariableValues, setManualVariableValues] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);

  const platform = String(template?.platform_type || "").trim().toLowerCase();
  const theme = sendTemplateThemes[platform] || sendTemplateThemes.whatsapp;
  const tokens = useMemo(() => extractVariableTokens(template), [template]);
  const content = useMemo(() => parseTemplateContent(template), [template]);
  const headerType = String(content?.header?.type || "").trim().toLowerCase();
  const needsHeaderMedia = ["image", "video", "document"].includes(headerType);
  const savedHeaderAsset = String(content?.header?.assetUrl || content?.header?.assetId || "").trim();
  const hasSavedHeaderAsset = Boolean(savedHeaderAsset);
  const recipientLabel = getRecipientLabel(platform);
  const descriptors = useMemo(
    () => tokens.map((token) => getVariableDescriptor(template, token)),
    [template, tokens]
  );

  const resolvedVariableValues = useMemo(
    () =>
      Object.fromEntries(
        descriptors.map((descriptor) => {
          if (descriptor.autoValue === "recipient") {
            return [descriptor.token, recipient.trim()];
          }
          return [descriptor.token, String(manualVariableValues[descriptor.token] || "").trim()];
        })
      ),
    [descriptors, manualVariableValues, recipient]
  );

  const resolvedRecipientName = useMemo(() => {
    const nameToken = descriptors.find((descriptor) => NAME_FIELDS.has(descriptor.mappedField));
    const value = nameToken ? resolvedVariableValues[nameToken.token] : "";
    return String(value || "").trim() || "Recipient";
  }, [descriptors, resolvedVariableValues]);

  const resolvedRecipientEmail = useMemo(() => {
    if (platform === "email") {
      return recipient.trim();
    }
    const emailToken = descriptors.find((descriptor) => EMAIL_FIELDS.has(descriptor.mappedField));
    const value = emailToken ? resolvedVariableValues[emailToken.token] : "";
    return String(value || "").trim();
  }, [descriptors, platform, recipient, resolvedVariableValues]);

  useEffect(() => {
    if (!isOpen) return;
    setRecipient("");
    setHeaderMediaUrl(savedHeaderAsset);
    setManualVariableValues(
      Object.fromEntries(
        descriptors
          .filter((descriptor) => !descriptor.autoValue)
          .map((descriptor) => [descriptor.token, ""])
      )
    );
  }, [descriptors, isOpen, savedHeaderAsset]);

  if (!isOpen || !template) return null;

  const handleSend = async () => {
    const trimmedRecipient = recipient.trim();

    if (!trimmedRecipient) {
      notify(`${recipientLabel} is required.`, "error");
      return;
    }

    if (needsHeaderMedia && !headerMediaUrl.trim()) {
      notify(`This template needs a ${headerType} header asset before sending.`, "error");
      return;
    }

    for (const descriptor of descriptors) {
      if (!String(resolvedVariableValues[descriptor.token] || "").trim()) {
        notify(`Fill ${descriptor.label} before sending.`, "error");
        return;
      }
    }

    setIsSending(true);
    try {
      const response = await apiClient.post(`/templates/${template.id}/send-once`, {
        recipient: trimmedRecipient,
        recipientName: resolvedRecipientName,
        recipientEmail: resolvedRecipientEmail,
        headerMediaUrl: headerMediaUrl.trim() || undefined,
        variableValues: resolvedVariableValues,
      });
      if (!response?.data?.success) {
        notify("Template send was not accepted by the backend.", "error");
        return;
      }

      notify("Template send accepted. Delivery status will update after WhatsApp processes it.", "success");
      onClose();
    } catch (error: any) {
      notify(error?.response?.data?.error || "Failed to send template.", "error");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-md sm:p-4">
      <div className="flex h-[min(80vh,720px)] w-full max-w-[880px] flex-col overflow-hidden rounded-[1.75rem] border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] shadow-[var(--shadow-glass)] backdrop-blur-2xl">
        <div className={`flex items-center justify-between border-b border-[var(--glass-border)] p-4 sm:p-5 bg-surface/80 ${theme.shell}`}>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-text-main">Single Send</h2>
            <p className="text-xs font-bold uppercase tracking-widest text-text-main">
              {theme.label} template Â· {template.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--glass-border)] p-2 text-text-muted transition-all hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:text-text-main"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4 sm:p-5">
          <div className="grid h-full gap-4 overflow-y-auto lg:grid-cols-[1fr_0.82fr]">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                {recipientLabel}
              </label>
              <input
                type={platform === "email" ? "email" : "text"}
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder={recipientLabel}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface-strong)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--line-strong)]"
              />
            </div>

            {needsHeaderMedia && !hasSavedHeaderAsset ? (
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  {headerType} header asset
                </label>
                <input
                  type="text"
                  value={headerMediaUrl}
                  onChange={(event) => setHeaderMediaUrl(event.target.value)}
                  placeholder={
                    headerType === "document"
                      ? "Public PDF URL or Meta media id"
                      : headerType === "video"
                        ? "Public video URL or Meta media id"
                        : "Public image URL or Meta media id"
                  }
                  className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface-strong)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--line-strong)]"
                />
                <div className="mt-1 text-[11px] text-[var(--muted)]">
                  This approved template still needs a {headerType} header parameter when sending.
                </div>
              </div>
            ) : null}

            {needsHeaderMedia && hasSavedHeaderAsset ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Using the saved {headerType} header asset from this template.
              </div>
            ) : null}

            {descriptors.length > 0 ? (
              <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5">
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  Template variables
                </div>
                {descriptors.map((descriptor) => (
                  <div key={descriptor.token}>
                    <label className="mb-1 block text-[11px] font-bold text-[var(--text)]">
                      {descriptor.label}
                    </label>
                    {descriptor.autoValue === "recipient" ? (
                      <input
                        type="text"
                        value={resolvedVariableValues[descriptor.token] || ""}
                        readOnly
                        placeholder={descriptor.helpText}
                        className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--muted)] outline-none"
                      />
                    ) : (
                      <input
                        type={EMAIL_FIELDS.has(descriptor.mappedField) ? "email" : "text"}
                        value={manualVariableValues[descriptor.token] || ""}
                        onChange={(event) =>
                          setManualVariableValues((current) => ({
                            ...current,
                            [descriptor.token]: event.target.value,
                          }))
                        }
                        placeholder={descriptor.helpText}
                        className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface-strong)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--line-strong)]"
                      />
                    )}
                    <div className="mt-1 text-[11px] text-[var(--muted)]">
                      {descriptor.helpText}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-sm text-[var(--muted)]">
                No template variables are mapped here. Recipient input is enough to send.
              </div>
            )}
          </div>

          <div className={`rounded-[1.35rem] border ${theme.shell} p-4 shadow-[var(--shadow-soft)]`}>
            <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-text-muted">
              Preview
            </div>
            <div className={`rounded-[1.1rem] border ${theme.shell} bg-surface`}>
              <div className="border-b px-4 py-3 text-sm font-bold text-text-main">
                {theme.label} template
              </div>
              <div className="space-y-3 bg-surface px-3.5 py-3.5">
                {content?.header ? (
                  <div className={`rounded-xl ${theme.note} p-2.5 text-sm`}>
                    {content.header.type === "text" ? content.header.text : `${content.header.type} header`}
                  </div>
                ) : null}
                <div className={`rounded-2xl ${theme.message} px-3.5 py-3 text-sm leading-6`}>
                  {content?.body || "No body"}
                  {content?.footer ? (
                    <div className="mt-3 border-t border-border-main pt-2 text-[11px] text-text-muted">
                      {content.footer}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--glass-border)] p-3.5 sm:p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-[var(--glass-border)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(129,140,248,0.34)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[0_14px_24px_var(--accent-glow)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send Once
          </button>
        </div>
      </div>
    </div>
  );
}

