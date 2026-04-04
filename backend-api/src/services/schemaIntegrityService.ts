import { query } from "../config/db";

const REQUIRED_TABLES = [
  "public.registry_events",
  "public.flow_versions",
  "public.triggers",
];

const CRITICAL_TABLES = new Set(["public.registry_events"]);

async function tableExists(qualifiedTableName: string) {
  const { rows } = await query(`SELECT to_regclass($1) AS exists`, [qualifiedTableName]);
  return Boolean(rows[0]?.exists);
}

export class SchemaIntegrityService {
  static async checkIntegrity() {
    const missing: string[] = [];

    for (const tableName of REQUIRED_TABLES) {
      const exists = await tableExists(tableName);
      if (!exists) {
        missing.push(tableName);
      }
    }

    return { missing };
  }

  static logSchemaError(missing: string[]) {
    const lines = [
      "############################################################",
      "# ❌ CRITICAL SCHEMA ERROR",
      "# The following required tables are MISSING:",
      ...missing.map((tableName) => `#   - ${tableName}`),
      "#",
      "# Observability and versioning are currently OFFLINE.",
      "#",
      "# ACTION REQUIRED:",
      "# Run the manual migration command:",
      "#   npm run migrate:registry:all",
      "############################################################",
    ];

    console.error(lines.join("\n"));
  }

  static shouldBlockStartup(missing: string[]) {
    return missing.some((tableName) => CRITICAL_TABLES.has(tableName));
  }
}
