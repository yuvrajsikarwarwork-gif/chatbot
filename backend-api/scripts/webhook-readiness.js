const { Client } = require("pg");

async function main() {
  const workspaceId = process.argv[2] || "";
  if (!workspaceId) {
    throw new Error("Pass a workspace id: node scripts/webhook-readiness.js <workspaceId>");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    const workspaceRes = await client.query(
      `SELECT id, name, status
       FROM workspaces
       WHERE id = $1
       LIMIT 1`,
      [workspaceId]
    );
    const workspace = workspaceRes.rows[0];
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const summaryRes = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM projects WHERE workspace_id = $1 AND status = 'active') AS project_count,
         (SELECT COUNT(*)::int FROM bots WHERE workspace_id = $1) AS bot_count,
         (SELECT COUNT(*)::int FROM campaigns WHERE workspace_id = $1) AS campaign_count,
         (SELECT COUNT(*)::int FROM campaign_channels cc JOIN campaigns c ON c.id = cc.campaign_id WHERE c.workspace_id = $1) AS channel_count,
         (SELECT COUNT(*)::int FROM platform_accounts WHERE workspace_id = $1 AND status = 'active') AS active_account_count`,
      [workspaceId]
    );

    const accountsRes = await client.query(
      `SELECT
         id,
         project_id,
         platform_type,
         name,
         status,
         CASE WHEN token IS NOT NULL THEN true ELSE false END AS has_token,
         CASE WHEN metadata ? 'webhookUrl' THEN true ELSE false END AS has_webhook_url
       FROM platform_accounts
       WHERE workspace_id = $1
       ORDER BY platform_type, created_at DESC`,
      [workspaceId]
    );

    console.log(JSON.stringify({
      workspace,
      summary: summaryRes.rows[0],
      accounts: accountsRes.rows,
      checks: {
        hasActiveProjects: Number(summaryRes.rows[0]?.project_count || 0) > 0,
        hasBots: Number(summaryRes.rows[0]?.bot_count || 0) > 0,
        hasCampaigns: Number(summaryRes.rows[0]?.campaign_count || 0) > 0,
        hasChannels: Number(summaryRes.rows[0]?.channel_count || 0) > 0,
        hasActiveAccounts: Number(summaryRes.rows[0]?.active_account_count || 0) > 0,
      },
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
