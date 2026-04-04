const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

function getMigrationFiles() {
  const files = process.argv.slice(2).filter((value) => value && !String(value).startsWith("--"));
  if (files.length > 0) {
    return files;
  }

  return ["090_create_registry_events.sql", "091_create_flow_versions.sql"];
}

async function applyMigration(pool, fileName) {
  const migrationPath = path.resolve(__dirname, "../../database/migrations", fileName);

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const sql = fs.readFileSync(migrationPath, "utf8");
  await pool.query(sql);
}

async function verifySchemaState(pool) {
  const tables = [
    "public.registry_events",
    "public.flow_versions",
    "public.triggers",
  ];

  console.log("\n--- Post-Migration Schema Verification ---");

  const results = [];
  for (const table of tables) {
    const { rows } = await pool.query("SELECT to_regclass($1) AS exists", [table]);
    results.push({
      Table: table,
      Status: rows[0]?.exists ? "✅ ONLINE" : "❌ MISSING",
    });
  }

  console.table(results);

  const isHealthy = results.every((row) => row.Status === "✅ ONLINE");
  if (isHealthy) {
    console.log("🚀 All registry systems are ready for production use.\n");
  } else {
    console.warn("⚠️  Warning: Schema is still incomplete. Check migration logs above.\n");
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
  if (!connectionString) {
    throw new Error("DB_URL or DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString });

  try {
    const files = getMigrationFiles();
    for (const fileName of files) {
      console.log(`Applying migration: ${fileName}`);
      await applyMigration(pool, fileName);
      console.log(`Applied migration: ${fileName}`);
    }

    await verifySchemaState(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Manual migration failed", error?.message || error);
  process.exit(1);
});
