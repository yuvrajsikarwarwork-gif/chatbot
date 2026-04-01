const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

async function run() {
  const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
  if (!connectionString) {
    throw new Error("DB_URL or DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString });
  try {
    const migrationPath = path.resolve(
      __dirname,
      "../../database/migrations/065_backfill_legacy_input_node_aliases.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");
    await pool.query(sql);
    console.log("Legacy flow node alias migration applied successfully.");
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Failed to apply legacy flow node alias migration", err);
  process.exit(1);
});
