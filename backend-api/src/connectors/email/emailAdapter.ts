import { GenericMessage, OutboundDeliveryResult } from "../../services/messageRouter";
import { sendWorkspaceEmail } from "../../services/emailService";

/**
 * OUTBOUND: Converts a generic message or generic template into an HTML email.
 */
export const sendEmailAdapter = async (
  botId: string, 
  toEmail: string, 
  msg: GenericMessage,
  platformAccountId?: string | null,
  workspaceId?: string | null,
  projectId?: string | null
): Promise<OutboundDeliveryResult> => {
  try {
    // Normalize content so workspace/system mail routing can handle the final delivery.
    let headerText = "";
    let bodyText = msg.text || "";
    let footerText = "";
    let interactiveButtons = msg.buttons || [];
    if (interactiveButtons.length === 0 && Array.isArray(msg.sections)) {
      interactiveButtons = msg.sections.flatMap((section: any) =>
        Array.isArray(section?.rows)
          ? section.rows.map((row: any) => ({
              id: row?.id,
              title: row?.title,
            }))
          : []
      );
    }

    if (msg.type === "template" && msg.templateContent) {
      // Safely parse in case DB returns stringified JSON instead of a JSONB object
      const tpl = typeof msg.templateContent === "string" 
        ? JSON.parse(msg.templateContent) 
        : msg.templateContent;

      // Updated to match generic JSON structure: { header: { text: "..." } }
      headerText = tpl.header?.text || "";
      bodyText = tpl.body || bodyText;
      footerText = tpl.footer || "";
      interactiveButtons = tpl.buttons || [];
    }

    // 4. Format the HTML Body
    let htmlBody = `
      <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
    `;

    if (headerText) {
      htmlBody += `<h2 style="margin-top: 0; color: #111;">${headerText}</h2>`;
    }

    if (bodyText) {
      htmlBody += `<p style="line-height: 1.5;">${bodyText.replace(/\n/g, '<br/>')}</p>`;
    }

    // Interactive menu or Template buttons
    if (interactiveButtons.length > 0) {
      htmlBody += `<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eaeaea;">`;
      interactiveButtons.forEach((btn: any) => {
        htmlBody += `
          <div style="display: inline-block; background: #2563eb; color: white; padding: 10px 15px; margin: 5px 5px 5px 0; border-radius: 5px; font-weight: bold;">
            Reply: "${btn.title}"
          </div>
        `;
      });
      htmlBody += `<p style="font-size: 12px; color: #666; margin-top: 10px;">Please reply directly to this email with your choice.</p></div>`;
    }

    if (footerText) {
      htmlBody += `<p style="font-size: 12px; color: #999; margin-top: 20px;">${footerText}</p>`;
    }

    htmlBody += `</div>`;

    await sendWorkspaceEmail({
      workspaceId: workspaceId || null,
      to: toEmail,
      subject: headerText || "New Message regarding your inquiry",
      html: htmlBody,
      text: bodyText,
      fromName: "Support",
    });

    console.log(`[Email Outbound] Sent standardized template/message to ${toEmail}`);
    return {
      providerMessageId: null,
      status: "sent",
    };

  } catch (error: any) {
    console.error(`[Email Send Error]:`, error.message);
    throw error;
  }
};
