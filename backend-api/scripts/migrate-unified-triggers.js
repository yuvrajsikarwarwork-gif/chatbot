const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
  if (!connectionString) {
    throw new Error("DB_URL or DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString });
  try {
    const migrationPath = path.resolve(__dirname, "../../database/migrations/088_create_unified_triggers.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");
    await pool.query(sql);
    console.log("Unified triggers migration applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to apply unified triggers migration", error?.message || error);
  process.exit(1);
});
