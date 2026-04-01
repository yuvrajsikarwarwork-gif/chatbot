import axios from "axios";
import { query } from "../../config/db";
import { GenericMessage, OutboundDeliveryResult } from "../../services/messageRouter";
import { sendWhatsAppMessage } from "../../services/whatsappService";
import { decryptSecret } from "../../utils/encryption";
import { normalizePublicMediaUrl } from "../../utils/publicUrl";
import { findCampaignChannelRuntimeById } from "../../models/campaignModel";
import { findLegacyPlatformAccountByBotAndPlatform } from "../../services/integrationService";

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";

function getChannelCredentials(channel: any) {
  if (!channel?.config || typeof channel.config !== "object") {
    return null;
  }

  return {
    phoneNumberId:
      typeof channel.config.phoneNumberId === "string"
        ? channel.config.phoneNumberId
        : null,
    accessToken: decryptSecret(channel.config.accessToken),
  };
}

function summarizeMetaAxiosError(error: any) {
  const payload = error?.response?.data?.error || error?.response?.data || {};
  const parts = [
    payload?.message || error?.message || "WhatsApp API request failed",
    payload?.type ? `type=${payload.type}` : null,
    payload?.code ? `code=${payload.code}` : null,
    payload?.error_subcode ? `subcode=${payload.error_subcode}` : null,
    payload?.error_data?.details ? `details=${payload.error_data.details}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function buildTemplateHeaderMediaParameter(
  mediaType: "image" | "video" | "document",
  source: string
) {
  const trimmedSource = normalizePublicMediaUrl(source);
  if (!trimmedSource) {
    return null;
  }

  const looksLikeHttp = /^https?:\/\//i.test(trimmedSource);
  return {
    type: mediaType,
    [mediaType]: looksLikeHttp
      ? { link: trimmedSource }
      : { id: trimmedSource },
  };
}

function resolveTemplateHeaderMediaSource(rawTemplateContent: any) {
  const assetId = String(rawTemplateContent?.header?.assetId || "").trim();
  const assetUrl = String(rawTemplateContent?.header?.assetUrl || "").trim();
  const headerText = String(rawTemplateContent?.header?.text || "").trim();
  const assetIdIsUrl = /^https?:\/\//i.test(assetId);

  if (assetUrl) {
    return assetIdIsUrl ? assetUrl : assetId || assetUrl;
  }

  if (assetId) {
    return assetId;
  }

  return headerText;
}

const buildWhatsAppPayload = (toPhone: string, msg: GenericMessage) => {
  const normalizedMediaUrl = normalizePublicMediaUrl(msg.mediaUrl || "");

  if (msg.type === "interactive" && Array.isArray(msg.sections) && msg.sections.length > 0) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      ...(msg.providerOpaqueRef ? { biz_opaque_callback_data: msg.providerOpaqueRef } : {}),
      type: "interactive",
      interactive: {
        type: "list",
        body: {
          text: msg.text || "Choose an option:"
        },
        action: {
          button: msg.buttonText || "View Options",
          sections: msg.sections
            .map((section) => ({
              title: section.title || "Options",
              rows: (section.rows || []).slice(0, 10).map((row) => ({
                id: row.id,
                title: row.title,
                ...(row.description ? { description: row.description } : {}),
              })),
            }))
            .filter((section) => section.rows.length > 0)
            .slice(0, 1),
        }
      }
    };
  }

  if (msg.type === "interactive" && msg.buttons?.length) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      ...(msg.providerOpaqueRef ? { biz_opaque_callback_data: msg.providerOpaqueRef } : {}),
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: msg.text || "Choose an option:"
        },
        action: {
          buttons: msg.buttons.slice(0, 3).map((button) => ({
            type: "reply",
            reply: {
              id: button.id,
              title: button.title
            }
          }))
        }
      }
    };
  }

  if (msg.type === "template" && msg.templateName) {
    const rawTemplateContent =
      msg.templateContent && typeof msg.templateContent === "string"
        ? (() => {
            try {
              return JSON.parse(msg.templateContent);
            } catch {
              return null;
            }
          })()
        : msg.templateContent && typeof msg.templateContent === "object"
          ? msg.templateContent
          : null;
    const headerType = String(rawTemplateContent?.header?.type || "").trim().toLowerCase();
    const headerValue = resolveTemplateHeaderMediaSource(rawTemplateContent);
    const components: any[] = Array.isArray(msg.templateComponents)
      ? msg.templateComponents
          .filter((component) => component && typeof component === "object")
          .map((component) => ({ ...component }))
      : [];
    const hasHeaderComponent = components.some(
      (component) => String(component?.type || "").trim().toLowerCase() === "header"
    );

    if (["image", "video", "document"].includes(headerType) && headerValue && !hasHeaderComponent) {
      const headerParameter = buildTemplateHeaderMediaParameter(
        headerType as "image" | "video" | "document",
        headerValue
      );
      components.push({
        type: "header",
        parameters: headerParameter ? [headerParameter] : [],
      });
    }

    const hasBodyComponent = components.some(
      (component) => String(component?.type || "").trim().toLowerCase() === "body"
    );
    if (!hasBodyComponent && Array.isArray(msg.templateParameters) && msg.templateParameters.length > 0) {
      components.push({
        type: "body",
        parameters: msg.templateParameters,
      });
    }

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      ...(msg.providerOpaqueRef ? { biz_opaque_callback_data: msg.providerOpaqueRef } : {}),
      type: "template",
      template: {
        name: msg.templateName,
        language: {
          code: msg.languageCode || "en_US"
        },
        ...(components.length > 0 ? { components } : {}),
      }
    };
  }

  if ((msg.type === "media" || msg.type === "image") && msg.mediaUrl) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      ...(msg.providerOpaqueRef ? { biz_opaque_callback_data: msg.providerOpaqueRef } : {}),
      type: "image",
      image: {
        link: normalizedMediaUrl,
        ...(msg.text ? { caption: msg.text } : {}),
      }
    };
  }

  if (msg.type === "video" && msg.mediaUrl) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      ...(msg.providerOpaqueRef ? { biz_opaque_callback_data: msg.providerOpaqueRef } : {}),
      type: "video",
      video: {
        link: normalizedMediaUrl,
        ...(msg.text ? { caption: msg.text } : {}),
      }
    };
  }

  if (msg.type === "audio" && msg.mediaUrl) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      ...(msg.providerOpaqueRef ? { biz_opaque_callback_data: msg.providerOpaqueRef } : {}),
      type: "audio",
      audio: {
        link: normalizedMediaUrl,
      }
    };
  }

  if (msg.type === "document" && msg.mediaUrl) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      ...(msg.providerOpaqueRef ? { biz_opaque_callback_data: msg.providerOpaqueRef } : {}),
      type: "document",
      document: {
        link: normalizedMediaUrl,
        ...(msg.text ? { caption: msg.text } : {}),
      }
    };
  }

  return null;
};

export const sendWhatsAppAdapter = async (
  botId: string,
  toPhone: string,
  msg: GenericMessage,
  channelId?: string | null,
  platformAccountId?: string | null
): Promise<OutboundDeliveryResult> => {
  const channel = channelId
    ? await findCampaignChannelRuntimeById(channelId)
    : null;
  const channelCredentials = getChannelCredentials(channel);

  let phoneNumberId = channelCredentials?.phoneNumberId || null;
  let accessToken = channelCredentials?.accessToken || null;

  if ((!phoneNumberId || !accessToken) && platformAccountId) {
    const accountRes = await query(
      `SELECT phone_number, account_id, token
       FROM platform_accounts
       WHERE id = $1
       LIMIT 1`,
      [platformAccountId]
    );

    const account = accountRes.rows[0];
    phoneNumberId = phoneNumberId || account?.account_id || account?.phone_number || null;
    accessToken = accessToken || decryptSecret(account?.token ?? null);
  }

  if (!phoneNumberId || !accessToken) {
    const legacyAccount = await findLegacyPlatformAccountByBotAndPlatform(
      botId,
      "whatsapp"
    );
    const metadata =
      legacyAccount?.metadata && typeof legacyAccount.metadata === "object"
        ? legacyAccount.metadata
        : {};
    phoneNumberId =
      phoneNumberId ||
      (typeof metadata.phoneNumberId === "string" ? metadata.phoneNumberId : null) ||
      legacyAccount?.account_id ||
      legacyAccount?.phone_number ||
      null;
    accessToken = accessToken || decryptSecret(legacyAccount?.token ?? null);
  }

  if (!phoneNumberId || !accessToken) {
    throw {
      status: 400,
      message: platformAccountId
        ? "Invalid WhatsApp platform account or missing credentials"
        : "Missing WhatsApp platform account credentials",
    };
  }

  if (msg.type === "text" || msg.type === "system") {
    const response = await sendWhatsAppMessage(
      phoneNumberId,
      accessToken,
      toPhone,
      msg.text || "",
      msg.providerOpaqueRef || null
    );
    return {
      providerMessageId: response?.messages?.[0]?.id || null,
      status: "sent",
    };
  }

  const payload = buildWhatsAppPayload(toPhone, msg);
  if (!payload) {
    const response = await sendWhatsAppMessage(
      phoneNumberId,
      accessToken,
      toPhone,
      msg.text || `[${msg.type}]`,
      msg.providerOpaqueRef || null
    );
    return {
      providerMessageId: response?.messages?.[0]?.id || null,
      status: "sent",
    };
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    return {
      providerMessageId: response.data?.messages?.[0]?.id || null,
      status: "sent",
    };
  } catch (error: any) {
    console.error("[WhatsApp Adapter Error]", {
      phoneNumberId,
      operation: msg.type === "template" ? "template-send" : "message-send",
      payload,
      error: error?.response?.data || error?.message,
    });
    throw {
      status: error?.response?.status || 502,
      message: summarizeMetaAxiosError(error),
    };
  }
};
