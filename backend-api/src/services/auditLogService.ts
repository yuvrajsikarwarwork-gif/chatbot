import { createAuditLog } from "../models/auditLogModel";

export async function logAuditSafe(input: {
  userId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  try {
    await createAuditLog(input);
  } catch (err) {
    console.warn("Audit log skipped", err);
  }
}
