require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { Client } = require("pg");

const WORKSPACE_PERMISSIONS = {
  manage_workspace: true,
  manage_users: true,
  can_create_campaign: true,
  can_create_flow: true,
  can_manage_platform_accounts: true,
};

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] || null;
}

async function main() {
  const email = readArg("--email");
  const userIdArg = readArg("--user-id");
  const workspaceIdArg = readArg("--workspace-id");

  if (!email && !userIdArg) {
    throw new Error("Pass --email <value> or --user-id <value>.");
  }

  const client = new Client({
    connectionString: process.env.DB_URL,
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      `SELECT id, email, name, role, workspace_id
       FROM users
       WHERE ($1::text IS NOT NULL AND email = $1)
          OR ($2::uuid IS NOT NULL AND id = $2)
       LIMIT 1`,
      [email, userIdArg]
    );

    const user = userRes.rows[0];
    if (!user) {
      throw new Error("User not found.");
    }

    const workspaceId = workspaceIdArg || user.workspace_id;
    if (!workspaceId) {
      throw new Error("No workspace found for this user. Pass --workspace-id.");
    }

    const workspaceRes = await client.query(
      `SELECT id, name, owner_user_id, status
       FROM workspaces
       WHERE id = $1
       LIMIT 1`,
      [workspaceId]
    );

    const workspace = workspaceRes.rows[0];
    if (!workspace) {
      throw new Error("Workspace not found.");
    }

    await client.query(
      `UPDATE users
       SET role = 'super_admin',
           workspace_id = $2
       WHERE id = $1`,
      [user.id, workspaceId]
    );

    await client.query(
      `UPDATE workspaces
       SET owner_user_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [workspaceId, user.id]
    );

    await client.query(
      `INSERT INTO workspace_memberships
         (workspace_id, user_id, role, status, permissions_json, created_by)
       VALUES ($1, $2, 'workspace_owner', 'active', $3::jsonb, $2)
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET
         role = 'workspace_owner',
         status = 'active',
         permissions_json = $3::jsonb,
         updated_at = NOW()`,
      [workspaceId, user.id, JSON.stringify(WORKSPACE_PERMISSIONS)]
    );

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          ok: true,
          user: {
            id: user.id,
            email: user.email,
            previousRole: user.role,
            nextRole: "super_admin",
          },
          workspace: {
            id: workspace.id,
            name: workspace.name,
            ownerUserId: user.id,
          },
          membership: {
            workspaceId,
            userId: user.id,
            role: "workspace_owner",
            status: "active",
            permissions: WORKSPACE_PERMISSIONS,
          },
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
