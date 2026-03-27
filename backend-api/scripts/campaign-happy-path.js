const {
  createCampaignService,
  createCampaignChannelService,
  updateCampaignChannelService,
  deleteCampaignChannelService,
  createEntryPointService,
  updateEntryPointService,
  deleteEntryPointService,
  deleteCampaignService,
} = require("../dist/services/campaignService");
const {
  createPlatformAccountService,
  deletePlatformAccountService,
} = require("../dist/services/platformAccountService");
const { resolveCampaignContext } = require("../dist/services/campaignContextService");
const { upsertLeadCapture } = require("../dist/services/leadCaptureService");
const { query, db } = require("../dist/config/db");

async function main() {
  const userId = process.env.TEST_USER_ID || "1373d70d-dcaf-453d-88d8-5a0af89e8fab";
  const botId = process.env.TEST_BOT_ID || "f23b7a19-39cb-4883-9edd-d72df18b7773";
  const flowId = process.env.TEST_FLOW_ID || "404c06ea-854f-4372-9fb5-8f3ca106e474";
  const runId = Date.now();
  const slug = `phase-smoke-${runId}`;

  let campaign;
  let account;
  let channel;
  let entry;
  let contact;
  let conversation;
  let conversationFork;
  let lead;

  try {
    campaign = await createCampaignService(userId, {
      name: `Phase Smoke ${runId}`,
      slug,
      status: "active",
    });

    account = await createPlatformAccountService(userId, {
      platformType: "whatsapp",
      name: `Smoke Account ${runId}`,
      phoneNumber: `+1555${String(runId).slice(-7)}`,
      accountId: `pn-${runId}`,
      businessId: `biz-${runId}`,
      status: "active",
    });

    channel = await createCampaignChannelService(userId, {
      campaignId: campaign.id,
      botId,
      platform: "whatsapp",
      platformAccountId: account.id,
      name: "Smoke Channel",
      flowId,
      defaultFlowId: flowId,
      status: "active",
      allowRestart: true,
      allowMultipleLeads: false,
    });

    channel = await updateCampaignChannelService(channel.id, userId, {
      name: "Smoke Channel Updated",
      platformAccountId: account.id,
    });

    const disposableChannel = await createCampaignChannelService(userId, {
      campaignId: campaign.id,
      botId,
      platform: "website",
      platformAccountId: `widget-${runId}`,
      name: "Disposable Channel",
      flowId,
      defaultFlowId: flowId,
      status: "active",
    });
    await deleteCampaignChannelService(disposableChannel.id, userId);

    entry = await createEntryPointService(userId, {
      campaignId: campaign.id,
      channelId: channel.id,
      botId,
      flowId,
      platform: "whatsapp",
      name: "Smoke Entry",
      entryKey: `entry-${runId}`,
      sourceRef: "ad-set-1",
      landingUrl: "https://example.com/landing",
      isDefault: true,
    });

    entry = await updateEntryPointService(entry.id, userId, {
      name: "Smoke Entry Updated",
      sourceRef: "ad-set-2",
      landingUrl: "https://example.com/landing-2",
    });

    let mismatchRejected = false;
    try {
      await createEntryPointService(userId, {
        campaignId: campaign.id,
        channelId: channel.id,
        botId,
        flowId,
        platform: "website",
        name: "Invalid Entry",
        entryKey: `invalid-${runId}`,
      });
    } catch (error) {
      mismatchRejected = true;
    }

    const disposableEntry = await createEntryPointService(userId, {
      campaignId: campaign.id,
      channelId: channel.id,
      botId,
      flowId,
      platform: "whatsapp",
      name: "Disposable Entry",
      entryKey: `delete-${runId}`,
    });
    await deleteEntryPointService(disposableEntry.id, userId);

    const context = await resolveCampaignContext(botId, "whatsapp", `entry-${runId}`);

    const contactRes = await query(
      `INSERT INTO contacts (bot_id, name, platform_user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [botId, "Smoke Contact", `wa-user-${runId}`]
    );
    contact = contactRes.rows[0];

    const conversationRes = await query(
      `INSERT INTO conversations
         (bot_id, contact_id, channel, status, variables, campaign_id, channel_id, entry_point_id, flow_id, list_id, platform, context_json)
       VALUES
         ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING *`,
      [
        botId,
        contact.id,
        "whatsapp",
        "active",
        JSON.stringify({}),
        context.campaignId,
        context.channelId,
        context.entryPointId,
        context.flowId,
        context.listId,
        context.platform,
        JSON.stringify({
          userId: context.userId,
          campaignId: context.campaignId,
          channelId: context.channelId,
          entryPointId: context.entryPointId,
          flowId: context.flowId,
          listId: context.listId,
          platform: context.platform,
        }),
      ]
    );
    conversation = conversationRes.rows[0];

    const secondConversationRes = await query(
      `INSERT INTO conversations
         (bot_id, contact_id, channel, status, variables, campaign_id, channel_id, entry_point_id, flow_id, list_id, platform, context_json)
       VALUES
         ($1, $2, $3, $4, $5::jsonb, $6, $7, NULL, $8, NULL, $9, $10::jsonb)
       RETURNING *`,
      [
        botId,
        contact.id,
        "whatsapp",
        "active",
        JSON.stringify({}),
        context.campaignId,
        context.channelId,
        context.flowId,
        context.platform,
        JSON.stringify({
          userId: context.userId,
          campaignId: context.campaignId,
          channelId: context.channelId,
          flowId: context.flowId,
          platform: context.platform,
        }),
      ]
    );
    conversationFork = secondConversationRes.rows[0];

    lead = await upsertLeadCapture({
      conversationId: conversation.id,
      botId,
      platform: "whatsapp",
      variables: {
        name: "Smoke Lead",
        phone: "+15550001111",
        email: "smoke@example.com",
      },
      nodeData: {
        nodeId: "lead-form-smoke",
        statusValue: "captured",
        sourceLabel: "lead_form",
      },
      sourcePayload: {
        smokeRun: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          campaignId: campaign.id,
          platformAccountId: account.id,
          channelId: channel.id,
          entryPointId: entry.id,
          checks: {
            platformAccountLinked: channel.platform_account_ref_id === account.id,
            channelUpdatedName: channel.name === "Smoke Channel Updated",
            entryUpdatedName: entry.name === "Smoke Entry Updated",
            contextResolved: Boolean(
              context.campaignId && context.channelId && context.entryPointId
            ),
            leadCaptured: Boolean(lead && lead.entry_point_id === entry.id),
            mismatchedEntryRejected: mismatchRejected,
            conversationIsolationForked: Boolean(
              conversation &&
                conversationFork &&
                conversation.id !== conversationFork.id &&
                conversation.entry_point_id !== conversationFork.entry_point_id
            ),
          },
        },
        null,
        2
      )
    );
  } finally {
    if (lead && lead.id) {
      await query("DELETE FROM leads WHERE id = $1", [lead.id]);
    }
    if (conversation && conversation.id) {
      await query("DELETE FROM conversations WHERE id = $1", [conversation.id]);
    }
    if (conversationFork && conversationFork.id) {
      await query("DELETE FROM conversations WHERE id = $1", [conversationFork.id]);
    }
    if (contact && contact.id) {
      await query("DELETE FROM contacts WHERE id = $1", [contact.id]);
    }
    if (campaign && campaign.id) {
      await deleteCampaignService(campaign.id, userId);
    }
    if (account && account.id) {
      await deletePlatformAccountService(account.id, userId);
    }
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await db.end();
  } catch {}
  process.exit(1);
});
