import { CheckCheck, Link2, PhoneCall } from "lucide-react";

type TemplatePreviewProps = {
  template: any;
  campaignName?: string;
};

function parseTemplateContent(template: any) {
  if (!template?.content) {
    return {
      header:
        template?.header_type && template?.header_type !== "none"
          ? { type: template.header_type, text: template.header || "", assetUrl: template.header || "" }
          : null,
      body: template?.body || "",
      footer: template?.footer || "",
      buttons: Array.isArray(template?.buttons) ? template.buttons : [],
    };
  }

  return typeof template.content === "string" ? JSON.parse(template.content) : template.content;
}

function getPlatform(template: any) {
  return String(template?.target_platform || template?.platform_type || "whatsapp").trim().toLowerCase();
}

function getTemplateName(template: any) {
  return String(template?.name || template?.meta_template_name || "Untitled template").trim() || "Untitled template";
}

function buildPreviewText(text: string, fallback: string) {
  return String(text || "").trim() || fallback;
}

function renderFormattedText(text: string) {
  return String(text || "")
    .split("\n")
    .map((line, index) => (
      <p key={`${index}-${line}`}>
        {line.split(/(\*[^*]+\*)/g).map((segment, segmentIndex) => {
          if (/^\*[^*]+\*$/.test(segment)) {
            return <strong key={`${segmentIndex}-${segment}`}>{segment.slice(1, -1)}</strong>;
          }
          return <span key={`${segmentIndex}-${segment}`}>{segment}</span>;
        })}
      </p>
    ));
}

function getButtonLabel(button: { type?: string; title?: string; value?: string }) {
  const type = String(button?.type || "").toLowerCase();
  if (type === "url") return "Open link";
  if (type === "phone") return "Call";
  if (type === "quick_reply") return "Reply";
  if (type === "copy_code") return "Copy code";
  if (type === "flow") return "Open flow";
  if (type === "catalog") return "Open catalog";
  return "Action";
}

function getButtonIcon(type: string) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "url") {
    return <Link2 size={12} className="shrink-0" />;
  }
  if (normalized === "phone") {
    return <PhoneCall size={12} className="shrink-0" />;
  }
  return null;
}

function MediaHeader({ headerType, headerSource }: { headerType: string; headerSource: string }) {
  const normalizedHeaderType = String(headerType || "").toLowerCase();
  const normalizedHeaderSource = String(headerSource || "").trim();
  const hasRemoteAsset = /^https?:\/\//i.test(normalizedHeaderSource);

  if (!normalizedHeaderType || normalizedHeaderType === "none") {
    return null;
  }

  if (normalizedHeaderType === "image") {
    return (
      <div className="overflow-hidden rounded-[12px] border border-[#d7d0c7] bg-white">
        {hasRemoteAsset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={normalizedHeaderSource} alt="Template header preview" className="h-36 w-full object-cover" />
        ) : (
          <div className="px-4 py-8 text-center text-xs text-[#6b7280]">Image preview</div>
        )}
      </div>
    );
  }

  if (normalizedHeaderType === "video") {
    return (
      <div className="overflow-hidden rounded-[12px] border border-[#d7d0c7] bg-black">
        {hasRemoteAsset ? (
          <video src={normalizedHeaderSource} controls className="h-36 w-full bg-black object-cover" />
        ) : (
          <div className="px-4 py-8 text-center text-xs text-[#6b7280]">Video preview</div>
        )}
      </div>
    );
  }

  if (normalizedHeaderType === "document") {
    return (
      <div className="rounded-[12px] border border-[#d7d0c7] bg-white px-4 py-4 text-xs text-[#6b7280]">
        <div className="font-semibold text-[#111827]">Document header</div>
        <div className="mt-1 break-all">{normalizedHeaderSource || "Meta media handle"}</div>
      </div>
    );
  }

  if (normalizedHeaderType === "location") {
    return (
      <div className="rounded-[12px] border border-[#d7d0c7] bg-white px-4 py-4 text-xs text-[#6b7280]">
        <div className="font-semibold text-[#111827]">Location header</div>
        <div className="mt-1 break-all">{normalizedHeaderSource || "Location preview"}</div>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] bg-white px-4 py-3 text-sm text-[#374151]">
      {buildPreviewText(normalizedHeaderSource, "Header text")}
    </div>
  );
}

function WhatsAppPreview({ template, content, campaignName }: { template: any; content: any; campaignName?: string }) {
  const headerType = String(content?.header?.type || template?.header_type || "none").toLowerCase();
  const headerText = String(content?.header?.text || template?.header || "").trim();
  const bodyText = String(content?.body || template?.body || "").trim();
  const footerText = String(content?.footer || template?.footer || "").trim();
  const headerSource = String(content?.header?.assetUrl || content?.header?.assetId || template?.header || "").trim();
  const buttons = Array.isArray(content?.buttons) ? content.buttons : Array.isArray(template?.buttons) ? template.buttons : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="relative w-full max-w-[360px] rounded-[24px] border border-[#d9cfc4] bg-[#E5DDD5] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-[#6b7280]">
            <span>WhatsApp preview</span>
            <span>{campaignName || "Live preview"}</span>
          </div>
          <div className="relative w-full">
            <div className="absolute right-4 top-3 h-3 w-3 -translate-y-1 rotate-45 rounded-[2px] bg-[#DCF8C6]" />
            <div className="overflow-hidden rounded-[12px] rounded-tr-none bg-[#DCF8C6] px-4 py-3 text-[14.2px] leading-[1.6] text-[#111827] shadow-[0_1px_1px_rgba(0,0,0,0.08)]">
              {headerType !== "none" ? (
                <div className="mb-2">
                  <MediaHeader headerType={headerType} headerSource={headerSource} />
                </div>
              ) : null}
              {headerType === "text" && headerText ? (
                <div className="mb-1 text-[14.2px] font-medium leading-[1.6] text-[#111827]">
                  {headerText}
                </div>
              ) : null}
              <div>{renderFormattedText(buildPreviewText(bodyText, "Your template body will appear here."))}</div>
              {footerText ? <div className="mt-2 text-[11px] leading-4 text-[#667085]">{footerText}</div> : null}
              <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-[#667085]">
                <span>12:00 PM</span>
                <CheckCheck size={12} />
              </div>
            </div>
          </div>

          {buttons.length > 0 ? (
            <div className="mt-2 w-full overflow-hidden rounded-[12px] border border-[#d9d9d9] bg-white">
              {buttons.map((button: any, index: number) => {
                const type = String(button?.type || "").toLowerCase();
                const label = buildPreviewText(String(button?.title || ""), getButtonLabel(button));
                return (
                  <div
                    key={`${label}-${index}`}
                    className={`flex items-center justify-center gap-2 border-t border-[#ececec] px-4 py-3 text-center text-[13px] font-semibold text-[#1976d2] ${index === 0 ? "border-t-0" : ""}`}
                  >
                    {getButtonIcon(type)}
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TelegramPreview({ template, content, campaignName }: { template: any; content: any; campaignName?: string }) {
  const bodyText = String(content?.body || template?.body || "").trim();
  const footerText = String(content?.footer || template?.footer || "").trim();
  const buttons = Array.isArray(content?.buttons) ? content.buttons : Array.isArray(template?.buttons) ? template.buttons : [];

  return (
    <div className="space-y-4">
      <div className="relative flex justify-center">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c7d2e0] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#64748b] shadow-sm">
          Today
        </div>
        <div className="w-full max-w-[360px] rounded-[24px] border border-[#bfd0df] bg-[#dfe7ef] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-[#64748b]">
            <span>Telegram preview</span>
            <span>{campaignName || "Live preview"}</span>
          </div>
          <div className="rounded-[18px] bg-white px-4 py-3 text-sm leading-6 text-[#22303f] shadow-sm">
            <div>{buildPreviewText(bodyText, "Your Telegram message will appear here.")}</div>
            {footerText ? <div className="mt-3 border-t border-[#e5e7eb] pt-2 text-[11px] text-[#64748b]">{footerText}</div> : null}
          </div>
          {buttons.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {buttons.map((button: any, index: number) => (
                <div
                  key={`${String(button?.title || "")}-${index}`}
                  className="rounded-full border border-[#c7d2e0] bg-white px-3 py-2 text-[11px] font-bold text-[#304356]"
                >
                  {buildPreviewText(String(button?.title || ""), getButtonLabel(button))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SocialPreview({
  platform,
  template,
  content,
  campaignName,
}: {
  platform: string;
  template: any;
  content: any;
  campaignName?: string;
}) {
  const bodyText = String(content?.body || template?.body || "").trim();
  const footerText = String(content?.footer || template?.footer || "").trim();
  const headerSource = String(content?.header?.assetUrl || content?.header?.assetId || template?.header || "").trim();
  const buttons = Array.isArray(content?.buttons) ? content.buttons : Array.isArray(template?.buttons) ? template.buttons : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="w-full max-w-[360px] overflow-hidden rounded-[24px] border border-[#243041] bg-gradient-to-br from-[#101828] via-[#111827] to-[#1f2937] p-4 text-white shadow-lg">
          <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
            <span>{platform === "instagram" ? "Instagram DM preview" : "Facebook Messenger preview"}</span>
            <span>{campaignName || "Live preview"}</span>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-white/10 px-4 py-4 text-center text-sm leading-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            {headerSource ? (
              <div className="mb-3 overflow-hidden rounded-[14px] border border-white/10">
                <MediaHeader headerType={String(content?.header?.type || template?.header_type || "").toLowerCase()} headerSource={headerSource} />
              </div>
            ) : null}
            <div className="mx-auto max-w-[280px]">{buildPreviewText(bodyText, "Your message will appear here.")}</div>
            {footerText ? <div className="mt-3 border-t border-white/10 pt-2 text-[11px] text-white/65">{footerText}</div> : null}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-[16px] border border-white/10 bg-white/5 px-4 py-2 text-[11px] text-white/70">
            <span>Reply</span>
            <span>Type a message...</span>
          </div>
          {buttons.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {buttons.map((button: any, index: number) => (
                <div
                  key={`${String(button?.title || "")}-${index}`}
                  className="rounded-[14px] border border-white/15 bg-white/8 px-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.14em] text-white"
                >
                  {buildPreviewText(String(button?.title || ""), getButtonLabel(button))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmailPreview({ template, content }: { template: any; content: any }) {
  const bodyText = String(content?.body || template?.body || "").trim();
  const footerText = String(content?.footer || template?.footer || "").trim();
  const headerText = String(content?.header?.text || template?.header || "").trim();

  return (
    <div className="mx-auto max-w-[460px] rounded-[20px] border border-[#e5e7eb] bg-white shadow-lg">
      <div className="border-b border-[#e5e7eb] px-5 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6b7280]">Email preview</div>
        <div className="mt-2 text-sm font-bold text-[#111827]">Subject: {getTemplateName(template)}</div>
      </div>
      <div className="p-5">
        <div className="rounded-[18px] border border-[#e5e7eb] bg-[#f9fafb] p-4 text-sm leading-6 text-[#111827]">
          {headerText ? <div className="mb-3 text-sm font-semibold text-[#111827]">{headerText}</div> : null}
          <div>{buildPreviewText(bodyText, "Your email body will appear here.")}</div>
          {footerText ? <div className="mt-3 border-t border-[#e5e7eb] pt-3 text-xs text-[#6b7280]">{footerText}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function TemplatePreview({ template, campaignName }: TemplatePreviewProps) {
  const platform = getPlatform(template);
  const content = parseTemplateContent(template);

  return (
    <div className="space-y-4">
      {platform === "whatsapp" ? (
        <WhatsAppPreview template={template} content={content} campaignName={campaignName} />
      ) : platform === "telegram" ? (
        <TelegramPreview template={template} content={content} campaignName={campaignName} />
      ) : platform === "instagram" || platform === "facebook" ? (
        <SocialPreview platform={platform} template={template} content={content} campaignName={campaignName} />
      ) : (
        <EmailPreview template={template} content={content} />
      )}
    </div>
  );
}
