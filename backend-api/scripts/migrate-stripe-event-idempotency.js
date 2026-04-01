require("dotenv").config();
const { Pool } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DB_URL must be set");
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_stripe_events (
        event_id text PRIMARY KEY,
        event_type text NOT NULL,
        processed_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_processed_at
      ON processed_stripe_events(processed_at DESC)
    `);

    await client.query("COMMIT");
    console.log("Stripe event idempotency migration complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
