import { Response } from "express";
import axios from "axios";
import csv from "csv-parser";
import fs from "fs";
import path from "path";

import { env } from "../config/env";
import { query } from "../config/db";
import { AuthRequest } from "../middleware/authMiddleware";
import { decryptSecret } from "../utils/encryption";
import { upsertContactWithIdentity } from "../services/contactIdentityService";
import {
  findAccessibleTemplate,
  launchCampaign as launchTemplateCampaign,
} from "./templateController";

type UploadRuntime = {
  botId: string;
  workspaceId: string | null;
  projectId: string | null;
  campaignId: string | null;
  platform: string;
};

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";

async function resolveUploadRuntime(req: AuthRequest) {
  const botId = String(req.body?.bot_id || "").trim();
  const campaignId = String(req.body?.campaign_id || "").trim();
  const templateId = String(req.body?.template_id || "").trim();
  const userId = req.user?.id || (req.user as any)?.user_id;

  if (!userId) {
    throw { status: 401, message: "Unauthorized" };
  }

  if (!botId && !campaignId) {
    throw { status: 400, message: "bot_id or campaign_id is required" };
  }

  if (campaignId) {
    const template =
      templateId ? await findAccessibleTemplate(templateId, String(userId)) : null;
    const channelRes = await query(
      `SELECT cc.bot_id,
              cc.platform,
              c.workspace_id,
              c.project_id
       FROM campaign_channels cc
       JOIN campaigns c ON c.id = cc.campaign_id
       WHERE cc.campaign_id = $1
         AND cc.status = 'active'
       ORDER BY cc.created_at ASC
       LIMIT 1`,
      [campaignId]
    );

    const channel = channelRes.rows[0];
    if (!channel?.bot_id) {
      throw {
        status: 409,
        message: "Campaign needs one active channel with a bot before bulk send.",
      };
    }

    return {
      botId: String(channel.bot_id),
      workspaceId: channel.workspace_id || null,
      projectId: channel.project_id || null,
      campaignId,
      platform: String(template?.platform_type || channel.platform || "whatsapp"),
    } satisfies UploadRuntime;
  }

  const botRes = await query(
    `SELECT id, workspace_id, project_id
     FROM bots
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [botId, userId]
  );

  const bot = botRes.rows[0];
  if (!bot) {
    throw { status: 403, message: "Unauthorized or bot not found" };
  }

  return {
    botId: String(bot.id),
    workspaceId: bot.workspace_id || null,
    projectId: bot.project_id || null,
    campaignId: campaignId || null,
    platform: "whatsapp",
  } satisfies UploadRuntime;
}

async function resolveMetaUploadConnection(input: {
  campaignId: string;
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  const channelRes = await query(
    `SELECT
       cc.id,
       c.workspace_id,
       c.project_id,
       pa.account_id,
       pa.business_id,
       pa.token
     FROM campaign_channels cc
     JOIN campaigns c ON c.id = cc.campaign_id
     LEFT JOIN platform_accounts pa ON pa.id = cc.platform_account_ref_id
     WHERE cc.campaign_id = $1
       AND LOWER(COALESCE(NULLIF(TRIM(cc.platform), ''), NULLIF(TRIM(cc.platform_type), ''))) = 'whatsapp'
       AND LOWER(TRIM(COALESCE(cc.status, 'active'))) = 'active'
       ${input.workspaceId ? "AND c.workspace_id = $2" : ""}
       ${input.projectId ? `AND c.project_id = $${input.workspaceId ? 3 : 2}` : ""}
     ORDER BY cc.created_at ASC
     LIMIT 1`,
    [
      input.campaignId,
      ...(input.workspaceId ? [input.workspaceId] : []),
      ...(input.projectId ? [input.projectId] : []),
    ]
  );

  const channel = channelRes.rows[0];
  if (!channel?.business_id || !channel?.token) {
    throw {
      status: 409,
      message: "Campaign needs an active WhatsApp platform account with WABA ID and access token.",
    };
  }

  const accessToken = decryptSecret(channel.token);
  if (!accessToken) {
    throw { status: 409, message: "Connected WhatsApp access token could not be decrypted." };
  }

  return {
    wabaId: String(channel.business_id),
    phoneNumberId: String(channel.account_id || ""),
    accessToken,
  };
}

async function createMetaUploadSession(input: {
  accessToken: string;
  fileName: string;
  fileLength: number;
  fileType: string;
}) {
  if (!env.META_APP_ID) {
    throw {
      status: 500,
      message:
        "META_APP_ID is missing in the backend runtime. Add the actual Meta App ID to backend-api/.env and fully restart the backend process.",
    };
  }

  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${env.META_APP_ID}/uploads`);
  url.searchParams.set("file_name", input.fileName);
  url.searchParams.set("file_length", String(input.fileLength));
  url.searchParams.set("file_type", input.fileType);
  url.searchParams.set("access_token", input.accessToken);

  const response = await axios.post(url.toString());
  const uploadId = String(response.data?.id || "").trim();
  if (!uploadId) {
    throw { status: 502, message: "Meta upload session did not return an upload id." };
  }

  return uploadId;
}

async function uploadFileToMeta(input: {
  uploadId: string;
  accessToken: string;
  filePath: string;
}) {
  const fileBuffer = fs.readFileSync(input.filePath);
  const response = await axios.post(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${input.uploadId}`,
    fileBuffer,
    {
      headers: {
        Authorization: `OAuth ${input.accessToken}`,
        file_offset: "0",
        "Content-Type": "application/octet-stream",
      },
    }
  );

  const handle = String(response.data?.h || response.data?.handle || "").trim();
  if (!handle) {
    throw { status: 502, message: "Meta upload did not return a media handle." };
  }

  return handle;
}

export const uploadMetaTemplateSample = async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const campaignId = String(req.body?.campaign_id || "").trim();
  const headerType = String(req.body?.header_type || "").trim().toLowerCase();
  const workspaceId = String(req.headers["x-workspace-id"] || "").trim() || null;
  const projectId = String(req.headers["x-project-id"] || "").trim() || null;

  if (!campaignId) {
    return res.status(400).json({ error: "campaign_id is required" });
  }

  if (!["image", "video", "document"].includes(headerType)) {
    return res.status(400).json({ error: "header_type must be image, video, or document" });
  }

  try {
    const connection = await resolveMetaUploadConnection({
      campaignId,
      workspaceId,
      projectId,
    });
    const uploadId = await createMetaUploadSession({
      accessToken: connection.accessToken,
      fileName: path.basename(file.originalname || file.filename),
      fileLength: file.size,
      fileType: file.mimetype,
    });
    const metaHandle = await uploadFileToMeta({
      uploadId,
      accessToken: connection.accessToken,
      filePath: file.path,
    });
    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${file.filename}`;

    return res.status(200).json({
      url: fileUrl,
      filename: file.filename,
      metaHandle,
      wabaId: connection.wabaId,
      phoneNumberId: connection.phoneNumberId || null,
    });
  } catch (error: any) {
    const payload = error?.response?.data?.error || error?.response?.data || {};
    const message = [
      payload?.message || error?.message || "Failed to upload media sample to Meta.",
      payload?.type ? `type=${payload.type}` : null,
      payload?.code ? `code=${payload.code}` : null,
      payload?.error_subcode ? `subcode=${payload.error_subcode}` : null,
      payload?.error_user_msg ? `details=${payload.error_user_msg}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    return res.status(error?.status || error?.response?.status || 500).json({ error: message });
  }
};

export const uploadLeadsCSV = async (req: AuthRequest, res: Response) => {
  const file = req.file;
  const templateId = String(req.body?.template_id || "").trim();
  const campaignName = String(req.body?.campaign_name || "CSV Bulk Send").trim();

  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const runtime = await resolveUploadRuntime(req);
    const rows: any[] = [];

    fs.createReadStream(file.path)
      .pipe(csv())
      .on("data", (data) => rows.push(data))
      .on("end", async () => {
        try {
          const createdLeadIds: string[] = [];

          for (const row of rows) {
            const phone = String(row.phone || row.wa_number || "").trim();
            const name = String(row.name || row.wa_name || "Unknown").trim();
            const email = String(row.email || "").trim();

            if (!phone && !email) continue;

            const platformUserId = runtime.platform === "email" ? email : phone;
            if (!platformUserId) continue;

            const contact = await upsertContactWithIdentity({
              botId: runtime.botId,
              workspaceId: runtime.workspaceId,
              platform: runtime.platform,
              platformUserId,
              name,
              email: email || null,
              phone: phone || null,
            });

            const contactId = contact?.id;
            if (!contactId) continue;

            const leadRes = await query(
              `INSERT INTO leads
                 (bot_id, workspace_id, project_id, contact_id, campaign_id, platform, name, phone, email, source, status, wa_name, wa_number)
               VALUES
                 ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'csv_upload', 'new', $10, $11)
               RETURNING id`,
              [
                runtime.botId,
                runtime.workspaceId,
                runtime.projectId,
                contactId,
                runtime.campaignId,
                runtime.platform,
                name,
                phone || null,
                email || null,
                name,
                phone || null,
              ]
            );

            if (leadRes.rows[0]?.id) {
              createdLeadIds.push(String(leadRes.rows[0].id));
            }
          }

          if (templateId && createdLeadIds.length > 0) {
            req.body = {
              templateId,
              campaignName,
              leadIds: createdLeadIds,
            };
            return launchTemplateCampaign(req as any, res);
          }

          return res.status(200).json({
            message: `Successfully processed ${createdLeadIds.length} leads.`,
            count: createdLeadIds.length,
          });
        } catch (error: any) {
          console.error("CSV processing error:", error);
          return res.status(error?.status || 500).json({
            error: error?.message || "Failed to process CSV data",
          });
        } finally {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      });
  } catch (error: any) {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    res.status(error?.status || 500).json({ error: error?.message || "Server Error" });
  }
};
