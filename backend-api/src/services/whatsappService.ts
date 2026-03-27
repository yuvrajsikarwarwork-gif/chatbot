import axios from "axios";

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";

export const sendWhatsAppMessage = async (
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  messageText: string
) => {
  try {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      type: "text",
      text: {
        preview_url: false,
        body: messageText,
      },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`WhatsApp message sent to ${toPhone}: ${response.data.messages[0].id}`);
    return response.data;
  } catch (error: any) {
    const payload = error?.response?.data?.error || error?.response?.data || {};
    const message = [
      payload?.message || error?.message || "WhatsApp API request failed",
      payload?.type ? `type=${payload.type}` : null,
      payload?.code ? `code=${payload.code}` : null,
      payload?.error_subcode ? `subcode=${payload.error_subcode}` : null,
      payload?.error_data?.details ? `details=${payload.error_data.details}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    console.error("WhatsApp API Error:", {
      phoneNumberId,
      toPhone,
      error: error?.response?.data || error.message,
    });

    throw {
      status: error?.response?.status || 502,
      message,
    };
  }
};
