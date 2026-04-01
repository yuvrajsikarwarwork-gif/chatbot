import { db, query } from "../config/db";

let botColumnSupport:
  | {
      legacySettings: boolean;
      globalSettings: boolean;
      settingsJson: boolean;
    }
  | null = null;

async function getBotColumnSupport() {
  if (botColumnSupport) {
    return botColumnSupport;
  }

  const res = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'bots'`
  );

  const columns = new Set(res.rows.map((row: any) => String(row.column_name || "").trim()));
  botColumnSupport = {
    legacySettings: columns.has("settings"),
    globalSettings: columns.has("global_settings"),
    settingsJson: columns.has("settings_json"),
  };
  return botColumnSupport;
}

function quoteIdentifier(identifier: string) {
  return `"${String(identifier || "").replace(/"/g, '""')}"`;
}

async function getTablesWithColumn(client: any, columnName: string, excludedTables: string[] = []) {
  const res = await client.query(
    `SELECT DISTINCT table_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name = $1
       AND table_name <> ALL($2::text[])
     ORDER BY table_name ASC`,
    [columnName, excludedTables]
  );

  return res.rows
    .map((row: any) => String(row.table_name || "").trim())
    .filter(Boolean);
}

async function purgeTablesByColumn(
  client: any,
  tables: string[],
  whereClauseFactory: (tableName: string) => string,
  botId: string
) {
  const pending = tables.map((tableName) => String(tableName || "").trim()).filter(Boolean);
  let didProgress = true;

  while (pending.length > 0 && didProgress) {
    didProgress = false;
    const nextPending: string[] = [];

    for (let index = 0; index < pending.length; index += 1) {
      const tableName = pending[index];
      if (!tableName) {
        continue;
      }
      const savepointName = `bot_purge_${index}`;
      await client.query(`SAVEPOINT ${savepointName}`);

      try {
        await client.query(
          `DELETE FROM ${quoteIdentifier(tableName)}
           WHERE ${whereClauseFactory(tableName)}`,
          [botId]
        );
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
        didProgress = true;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        if ((error as any)?.code !== "23503") {
          throw error;
        }
        nextPending.push(tableName);
      }
    }

    pending.splice(0, pending.length, ...nextPending);
  }

  if (pending.length > 0) {
    throw new Error(
      `Unable to purge bot dependencies from tables: ${pending.join(", ")}`
    );
  }
}

export async function findBotsByUser(userId: string) {
  const res = await query(
    "SELECT * FROM bots WHERE user_id = $1 AND deleted_at IS NULL ORDER BY status = 'active' DESC, created_at DESC",
    [userId]
  );
  return res.rows;
}

export async function findBotsByWorkspaceProject(
  workspaceId: string,
  projectId?: string | null
) {
  const params: Array<string | null> = [workspaceId];
  let projectClause = "";

  if (projectId) {
    params.push(projectId);
    projectClause = ` AND project_id = $${params.length}`;
  }

  const res = await query(
    `SELECT *
     FROM bots
     WHERE workspace_id = $1
       AND deleted_at IS NULL${projectClause}
     ORDER BY status = 'active' DESC, created_at DESC`,
    params
  );
  return res.rows;
}

export async function findBotById(id: string) {
  const res = await query("SELECT * FROM bots WHERE id = $1 AND deleted_at IS NULL", [id]);
  return res.rows[0];
}

export async function findBotByIdAndProject(id: string, projectId: string) {
  const res = await query("SELECT * FROM bots WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [
    id,
    projectId,
  ]);
  return res.rows[0];
}

export async function createScopedBot(input: {
  userId: string;
  name: string;
  triggerKeywords?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  const columns = await getBotColumnSupport();
  const insertColumns = ["user_id", "workspace_id", "project_id", "name", "trigger_keywords", "status"];
  const values: any[] = [
    input.userId,
    input.workspaceId || null,
    input.projectId || null,
    input.name,
    input.triggerKeywords || "",
  ];
  const placeholders = ["$1", "$2", "$3", "$4", "$5", "'inactive'"];
  if (columns.legacySettings) {
    insertColumns.push("settings");
    placeholders.push(`$${values.length + 1}::jsonb`);
    values.push(JSON.stringify({}));
  }
  if (columns.globalSettings) {
    insertColumns.push("global_settings");
    placeholders.push(`$${values.length + 1}::jsonb`);
    values.push(JSON.stringify({}));
  }
  if (columns.settingsJson) {
    insertColumns.push("settings_json");
    placeholders.push(`$${values.length + 1}::jsonb`);
    values.push(JSON.stringify({}));
  }

  const res = await query(
    `INSERT INTO bots (${insertColumns.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING *`,
    values
  );
  return res.rows[0];
}

export async function updateBot(
  id: string,
  userId: string,
  data: {
    name?: string;
    trigger_keywords?: string;
    status?: string;
    workspace_id?: string | null;
    project_id?: string | null;
    settings?: Record<string, unknown> | null;
    settings_json?: Record<string, unknown> | null;
    global_settings?: Record<string, unknown> | null;
  }
) {
  const columns = await getBotColumnSupport();
  const clauses: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    values.push(data.name);
    clauses.push(`name = $${values.length}`);
  }
  if (data.trigger_keywords !== undefined) {
    values.push(data.trigger_keywords);
    clauses.push(`trigger_keywords = $${values.length}`);
  }
  if (data.status !== undefined) {
    values.push(data.status);
    clauses.push(`status = $${values.length}`);
  }
  if (data.workspace_id !== undefined) {
    values.push(data.workspace_id);
    clauses.push(`workspace_id = $${values.length}`);
  }
  if (data.project_id !== undefined) {
    values.push(data.project_id);
    clauses.push(`project_id = $${values.length}`);
  }
  if (columns.legacySettings && data.settings !== undefined) {
    values.push(JSON.stringify(data.settings || {}));
    clauses.push(`settings = $${values.length}::jsonb`);
  }
  if (columns.globalSettings && data.global_settings !== undefined) {
    values.push(JSON.stringify(data.global_settings || {}));
    clauses.push(`global_settings = $${values.length}::jsonb`);
  }
  if (columns.settingsJson && data.settings_json !== undefined) {
    values.push(JSON.stringify(data.settings_json || {}));
    clauses.push(`settings_json = $${values.length}::jsonb`);
  }

  if (clauses.length === 0) {
    return findBotById(id);
  }

  values.push(id, userId);
  const queryText = `
    UPDATE bots
    SET ${clauses.join(", ")},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $${values.length - 1} AND user_id = $${values.length}
    RETURNING *
  `;
  const res = await query(queryText, values);
  return res.rows[0];
}

export async function updateBotStatus(
  id: string,
  userId: string,
  status: string
) {
  const res = await query(
    `
    UPDATE bots
    SET
      status = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND user_id = $3
    RETURNING *
    `,
    [status, id, userId]
  );
  return res.rows[0];
}

export async function updateWorkspaceBot(
  id: string,
  data: {
    name?: string;
    trigger_keywords?: string;
    status?: string;
    workspace_id?: string | null;
    project_id?: string | null;
    settings?: Record<string, unknown> | null;
    settings_json?: Record<string, unknown> | null;
  global_settings?: Record<string, unknown> | null;
  }
) {
  const columns = await getBotColumnSupport();
  const clauses: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    values.push(data.name);
    clauses.push(`name = $${values.length}`);
  }
  if (data.trigger_keywords !== undefined) {
    values.push(data.trigger_keywords);
    clauses.push(`trigger_keywords = $${values.length}`);
  }
  if (data.status !== undefined) {
    values.push(data.status);
    clauses.push(`status = $${values.length}`);
  }
  if (data.workspace_id !== undefined) {
    values.push(data.workspace_id);
    clauses.push(`workspace_id = $${values.length}`);
  }
  if (data.project_id !== undefined) {
    values.push(data.project_id);
    clauses.push(`project_id = $${values.length}`);
  }
  if (columns.legacySettings && data.settings !== undefined) {
    values.push(JSON.stringify(data.settings || {}));
    clauses.push(`settings = $${values.length}::jsonb`);
  }
  if (columns.globalSettings && data.global_settings !== undefined) {
    values.push(JSON.stringify(data.global_settings || {}));
    clauses.push(`global_settings = $${values.length}::jsonb`);
  }
  if (columns.settingsJson && data.settings_json !== undefined) {
    values.push(JSON.stringify(data.settings_json || {}));
    clauses.push(`settings_json = $${values.length}::jsonb`);
  }

  if (clauses.length === 0) {
    return findBotById(id);
  }

  values.push(id);
  const idIndex = values.length;
  const queryText = `
    UPDATE bots
    SET ${clauses.join(", ")},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $${idIndex}
    RETURNING *
  `;
  const res = await query(queryText, values);
  return res.rows[0];
}

export async function deleteBot(id: string, userId: string) {
  await query("DELETE FROM bots WHERE id = $1 AND user_id = $2", [id, userId]);
}

export async function deleteWorkspaceBot(id: string) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM flow_nodes
       WHERE flow_id IN (
         SELECT id
         FROM flows
         WHERE bot_id = $1
       )`,
      [id]
    );

    const botTables = await getTablesWithColumn(client, "bot_id", ["bots", "flow_nodes"]);
    await purgeTablesByColumn(
      client,
      botTables,
      (tableName) => `${quoteIdentifier("bot_id")} = $1`,
      id
    );

    await client.query("DELETE FROM flows WHERE bot_id = $1", [id]);
    await client.query("DELETE FROM bots WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
