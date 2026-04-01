import {
  createLeadForm,
  deleteLeadForm,
  findLeadFormById,
  findLeadFormsByWorkspace,
  updateLeadForm,
  type LeadFormFieldRecord,
} from "../models/leadFormModel";
import { logAuditSafe } from "./auditLogService";
import { assertProjectRoleAccess } from "./projectAccessService";
import {
  assertWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";

function normalizeFieldKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ ]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const ALLOWED_FIELD_TYPES = new Set([
  "short_text",
  "email",
  "phone",
  "company_name",
  "number",
  "dropdown",
  "date",
  "boolean",
]);

function normalizeFieldType(value: unknown) {
  const normalized = String(value || "short_text").trim().toLowerCase();
  if (!ALLOWED_FIELD_TYPES.has(normalized)) {
    throw { status: 400, message: `Unsupported field type '${value}'` };
  }
  return normalized;
}

function normalizeFieldOptions(value: unknown, fieldType: string) {
  const options = Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (fieldType === "dropdown" && options.length === 0) {
    throw { status: 400, message: "Dropdown fields require at least one option" };
  }

  return options;
}

function normalizeQuestionLabel(value: unknown) {
  return String(value || "").trim();
}

function normalizeLeadFormFields(input: unknown): LeadFormFieldRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: LeadFormFieldRecord[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const row = input[index] && typeof input[index] === "object"
      ? (input[index] as Record<string, unknown>)
      : {};
    const fieldKey = normalizeFieldKey(row.fieldKey || row.field_key);
    const fieldType = normalizeFieldType(row.fieldType || row.field_type);
    const questionLabel = normalizeQuestionLabel(
      row.questionLabel || row.question_label
    );
    const options = normalizeFieldOptions(row.options, fieldType);

    if (!fieldKey) {
      throw { status: 400, message: `Field ${index + 1} is missing a valid field key` };
    }

    if (!questionLabel) {
      throw { status: 400, message: `Field ${index + 1} is missing a question label` };
    }

    if (seen.has(fieldKey)) {
      throw { status: 400, message: `Duplicate field key '${fieldKey}' is not allowed` };
    }

    seen.add(fieldKey);
    normalized.push({
      fieldKey,
      fieldType,
      questionLabel,
      options,
      isRequired: Boolean(row.isRequired ?? row.is_required),
      sortOrder: index,
    });
  }

  return normalized;
}

function normalizeLeadFormName(value: unknown) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw { status: 400, message: "Lead form name is required" };
  }
  return normalized;
}

async function assertLeadFormReadAccess(
  userId: string,
  workspaceId: string,
  projectId?: string | null
) {
  for (const permission of [WORKSPACE_PERMISSIONS.viewLeads, WORKSPACE_PERMISSIONS.editWorkflow]) {
    try {
      await assertWorkspacePermission(userId, workspaceId, permission);
      return;
    } catch (err: any) {
      if (err?.status && err.status !== 403) {
        throw err;
      }
    }
  }

  if (!projectId) {
    throw { status: 403, message: "Forbidden: Insufficient permissions to view lead forms" };
  }

  await assertProjectRoleAccess(userId, projectId, ["project_admin", "editor"], workspaceId);
}

async function assertLeadFormWriteAccess(
  userId: string,
  workspaceId: string,
  projectId?: string | null
) {
  try {
    await assertWorkspacePermission(
      userId,
      workspaceId,
      WORKSPACE_PERMISSIONS.editWorkflow
    );
    return;
  } catch (err: any) {
    if (err?.status && err.status !== 403) {
      throw err;
    }
  }

  if (!projectId) {
    throw { status: 403, message: "Forbidden: Insufficient permissions to manage lead forms" };
  }

  await assertProjectRoleAccess(userId, projectId, ["project_admin", "editor"], workspaceId);
}

export async function listLeadFormsService(
  userId: string,
  workspaceId: string,
  projectId?: string | null
) {
  await assertLeadFormReadAccess(userId, workspaceId, projectId);

  return findLeadFormsByWorkspace(workspaceId);
}

export async function getLeadFormService(id: string, userId: string, projectId?: string | null) {
  const form = await findLeadFormById(id);
  if (!form) {
    throw { status: 404, message: "Lead form not found" };
  }

  await assertLeadFormReadAccess(userId, String(form.workspace_id), projectId);

  return form;
}

export async function createLeadFormService(
  userId: string,
  payload: {
    workspaceId?: string;
    workspace_id?: string;
    projectId?: string;
    project_id?: string;
    name?: string;
    fields?: unknown;
  }
) {
  const workspaceId = String(payload.workspaceId || payload.workspace_id || "").trim();
  const projectId = String(payload.projectId || payload.project_id || "").trim() || null;
  if (!workspaceId) {
    throw { status: 400, message: "workspaceId is required" };
  }

  await assertLeadFormWriteAccess(userId, workspaceId, projectId);

  const created = await createLeadForm({
    workspaceId,
    name: normalizeLeadFormName(payload.name),
    fields: normalizeLeadFormFields(payload.fields),
  });

  await logAuditSafe({
    userId,
    workspaceId,
    action: "create",
    entity: "lead_form",
    entityId: created?.id,
    newData: created || {},
  });

  return created;
}

export async function updateLeadFormService(
  id: string,
  userId: string,
  payload: {
    projectId?: string;
    project_id?: string;
    name?: string;
    fields?: unknown;
  }
) {
  const existing = await findLeadFormById(id);
  if (!existing) {
    throw { status: 404, message: "Lead form not found" };
  }
  const projectId = String(payload.projectId || payload.project_id || "").trim() || null;

  await assertLeadFormWriteAccess(userId, String(existing.workspace_id), projectId);

  const updated = await updateLeadForm({
    id,
    name: normalizeLeadFormName(payload.name),
    fields: normalizeLeadFormFields(payload.fields),
  });

  await logAuditSafe({
    userId,
    workspaceId: existing.workspace_id,
    action: "update",
    entity: "lead_form",
    entityId: id,
    oldData: existing,
    newData: updated || {},
  });

  return updated;
}

export async function deleteLeadFormService(
  id: string,
  userId: string,
  projectId?: string | null
) {
  const existing = await findLeadFormById(id);
  if (!existing) {
    throw { status: 404, message: "Lead form not found" };
  }

  await assertLeadFormWriteAccess(userId, String(existing.workspace_id), projectId);

  await logAuditSafe({
    userId,
    workspaceId: existing.workspace_id,
    action: "delete",
    entity: "lead_form",
    entityId: id,
    oldData: existing,
  });

  await deleteLeadForm(id);
}
