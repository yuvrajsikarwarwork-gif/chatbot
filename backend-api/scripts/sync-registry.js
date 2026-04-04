const path = require("path");
const { Pool } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const { publishFlow } = require("../dist/services/publishFlowService");

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];
  return value && !String(value).startsWith("--") ? value : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
  if (!connectionString) {
    throw new Error("DB_URL or DATABASE_URL is required");
  }

  const dryRun = !hasFlag("--apply");
  const throttleMs = Math.max(0, Number(readArg("--throttle-ms") || 100));
  const limitArg = readArg("--limit");
  const workspaceId = readArg("--workspace-id");
  const botId = readArg("--bot-id");
  const projectId = readArg("--project-id");
  const explicitUserId = process.env.SYNC_REGISTRY_USER_ID || process.env.TEST_USER_ID || null;
  const limit = limitArg ? Math.max(1, Number(limitArg)) : null;

  const pool = new Pool({ connectionString });

  try {
    const params = [];
    const clauses = ["is_active = true"];

    if (workspaceId) {
      params.push(workspaceId);
      clauses.push(`workspace_id = $${params.length}`);
    }

    if (botId) {
      params.push(botId);
      clauses.push(`bot_id = $${params.length}`);
    }

    if (projectId) {
      params.push(projectId);
      clauses.push(`project_id = $${params.length}`);
    }

    const limitClause = limit ? `LIMIT ${limit}` : "";

    const queryText = `
      SELECT id, flow_name, workspace_id, bot_id, project_id, is_active
      FROM flows
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC NULLS LAST, id DESC
      ${limitClause}
    `;

    const { rows: flows } = await pool.query(queryText, params);

    console.log(
      JSON.stringify(
        {
          mode: dryRun ? "dry-run" : "apply",
          filters: {
            workspaceId: workspaceId || null,
            botId: botId || null,
            projectId: projectId || null,
            limit: limit || null,
            throttleMs,
          },
          activeFlows: flows.length,
        },
        null,
        2
      )
    );

    if (dryRun) {
      const preview = [];
      for (const flow of flows) {
        const triggerCountRes = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM triggers
           WHERE flow_id = $1`,
          [flow.id]
        );

        preview.push({
          id: flow.id,
            name: flow.flow_name,
          workspaceId: flow.workspace_id,
          botId: flow.bot_id,
          projectId: flow.project_id,
          existingTriggers: Number(triggerCountRes.rows[0]?.count || 0),
        });
      }

      console.log(
        JSON.stringify(
          {
            wouldSync: preview,
          },
          null,
          2
        )
      );
      return;
    }

    let actorUserId = explicitUserId;
    if (actorUserId) {
      const actorCheck = await pool.query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [actorUserId]);
      actorUserId = actorCheck.rows[0]?.id || null;
    }

    if (!actorUserId) {
      const { rows: actorRows } = await pool.query(
        `SELECT id
         FROM users
         WHERE role IN ('super_admin', 'developer')
         ORDER BY created_at DESC NULLS LAST, id DESC
         LIMIT 1`
      );
      actorUserId = actorRows[0]?.id || null;
    }

    if (!actorUserId) {
      throw new Error("No suitable admin/developer user found. Set SYNC_REGISTRY_USER_ID or create one.");
    }

    let successCount = 0;
    let failCount = 0;
    const failures = [];

    for (const flow of flows) {
      try {
        const result = await publishFlow(flow.id, actorUserId);
        successCount += 1;
        console.log(
          `✅ [${successCount}/${flows.length}] Synced ${flow.flow_name || flow.id} (${result.count} triggers)`
        );
      } catch (error) {
        failCount += 1;
        const message = String(error?.message || error || "Unknown error");
        failures.push({
          id: flow.id,
          name: flow.flow_name,
          error: message,
        });
        console.error(`❌ Failed to sync ${flow.flow_name || flow.id}: ${message}`);
      }

      if (throttleMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, throttleMs));
      }
    }

    console.log(
      JSON.stringify(
        {
          summary: {
            total: flows.length,
            success: successCount,
            failed: failCount,
          },
          failures,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Registry sync failed", error?.message || error);
  process.exit(1);
});
