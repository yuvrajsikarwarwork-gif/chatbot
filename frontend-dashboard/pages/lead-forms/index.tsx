import { useEffect, useMemo, useState } from "react";
import { Database, Plus, Save, Trash2 } from "lucide-react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import {
  leadFormService,
  type LeadFormField,
  type LeadFormRecord,
} from "../../services/leadFormService";
import { useAuthStore } from "../../store/authStore";

const STANDARD_FIELD_PRESETS: Array<{
  label: string;
  fieldKey: string;
  fieldType: string;
  questionLabel: string;
}> = [
  { label: "Full Name", fieldKey: "full_name", fieldType: "short_text", questionLabel: "What is your full name?" },
  { label: "Email Address", fieldKey: "email", fieldType: "email", questionLabel: "What is your email address?" },
  { label: "Phone Number", fieldKey: "phone", fieldType: "phone", questionLabel: "What is your phone number?" },
  { label: "Company Name", fieldKey: "company_name", fieldType: "company_name", questionLabel: "What is your company name?" },
];

const CUSTOM_FIELD_TYPES: Array<{ label: string; value: string }> = [
  { label: "Short Text", value: "short_text" },
  { label: "Number", value: "number" },
  { label: "Dropdown", value: "dropdown" },
  { label: "Date", value: "date" },
  { label: "Boolean", value: "boolean" },
];

function emptyField(index: number): LeadFormField {
  return {
    fieldKey: "",
    fieldType: "short_text",
    questionLabel: "",
    options: [],
    isRequired: false,
    sortOrder: index,
  };
}

export default function LeadFormsPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { canViewPage } = useVisibility();

  const projectRole = getProjectRole(activeProject?.id);
  const canViewLeadForms =
    canViewPage("leads") || projectRole === "project_admin" || projectRole === "editor";
  const canManageLeadForms =
    hasWorkspacePermission(activeWorkspace?.workspace_id, "edit_workflow") ||
    projectRole === "project_admin" ||
    projectRole === "editor";

  const [forms, setForms] = useState<LeadFormRecord[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [draftName, setDraftName] = useState("");
  const [draftFields, setDraftFields] = useState<LeadFormField[]>([emptyField(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedForm = useMemo(
    () => forms.find((form) => form.id === selectedFormId) || null,
    [forms, selectedFormId]
  );

  const resetDraft = () => {
    setSelectedFormId("");
    setDraftName("");
    setDraftFields([emptyField(0)]);
  };

  const loadForms = async () => {
    if (!activeWorkspace?.workspace_id || !canViewLeadForms) {
      setForms([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setErrorMessage("");
      const data = await leadFormService.list(
        activeWorkspace.workspace_id,
        activeProject?.id || undefined
      );
      setForms(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setForms([]);
      setErrorMessage(
        error?.response?.data?.error || error?.message || "Failed to load lead forms."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms().catch(() => undefined);
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewLeadForms]);

  useEffect(() => {
    if (!selectedForm) {
      return;
    }

    setDraftName(selectedForm.name || "");
    setDraftFields(
      Array.isArray(selectedForm.fields) && selectedForm.fields.length > 0
        ? selectedForm.fields.map((field, index) => ({
            ...field,
            sortOrder: Number(field.sortOrder ?? index),
          }))
        : [emptyField(0)]
    );
  }, [selectedForm]);

  const updateField = (index: number, key: keyof LeadFormField, value: unknown) => {
    setDraftFields((prev) =>
      prev.map((field, currentIndex) =>
        currentIndex === index ? { ...field, [key]: value } : field
      )
    );
  };

  const addField = () => {
    setDraftFields((prev) => [...prev, emptyField(prev.length)]);
  };

  const addStandardField = (preset: typeof STANDARD_FIELD_PRESETS[number]) => {
    setDraftFields((prev) => [
      ...prev,
      {
        fieldKey: preset.fieldKey,
        fieldType: preset.fieldType,
        questionLabel: preset.questionLabel,
        options: [],
        isRequired: true,
        sortOrder: prev.length,
      },
    ]);
  };

  const removeField = (index: number) => {
    setDraftFields((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      return next.length > 0
        ? next.map((field, currentIndex) => ({ ...field, sortOrder: currentIndex }))
        : [emptyField(0)];
    });
  };

  const handleSave = async () => {
    if (!activeWorkspace?.workspace_id || !canManageLeadForms) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const payload = {
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject?.id || undefined,
        name: draftName,
        fields: draftFields,
      };

      const saved = selectedFormId
        ? await leadFormService.update(selectedFormId, {
            projectId: activeProject?.id || undefined,
            name: payload.name,
            fields: payload.fields,
          })
        : await leadFormService.create(payload);

      setSuccessMessage(selectedFormId ? "Lead form updated." : "Lead form created.");
      await loadForms();
      if (saved?.id) {
        setSelectedFormId(saved.id);
      }
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.error || error?.message || "Failed to save lead form."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFormId || !canManageLeadForms) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await leadFormService.remove(selectedFormId, activeProject?.id || undefined);
      setSuccessMessage("Lead form deleted.");
      resetDraft();
      await loadForms();
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.error || error?.message || "Failed to delete lead form."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout fullBleed>
      {!canViewLeadForms ? (
        <PageAccessNotice
          title="Lead forms are restricted for this role"
          description="Lead form management is available to workspace admins, project admins, and editors."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="flex min-h-full flex-col gap-5 text-text-main">
          {!activeWorkspace?.workspace_id || !activeProject?.id ? (
            <div className="rounded-[1.5rem] border border-dashed border-border-main bg-canvas p-8 text-sm text-text-muted">
              Select a workspace and project first. Lead forms are managed inside the active project context.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <div className="grid min-h-0 gap-5 xl:grid-cols-[340px_1fr] xl:items-stretch">
            <div className="flex min-h-0 flex-col rounded-[1.9rem] border border-border-main bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-border-main px-5 py-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                    Lead Forms
                  </div>
                  <div className="mt-1 text-sm text-text-muted">
                    Reusable schemas for flow capture.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetDraft}
                  className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-transparent px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-text-main transition hover:bg-primary-fade hover:text-primary hover:border-primary/30"
                >
                  <Plus size={14} />
                  New
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {loading ? (
                  <div className="p-4 text-sm text-text-muted">Loading lead forms...</div>
                ) : forms.length === 0 ? (
                  <div className="p-4 text-sm text-text-muted">
                    No lead forms exist yet. Create one to start mapping input nodes.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {forms.map((form) => (
                      <button
                        key={form.id}
                        type="button"
                        onClick={() => setSelectedFormId(form.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          selectedFormId === form.id
                            ? "border-primary bg-primary text-white"
                            : "border-border-main bg-surface text-text-main hover:bg-primary-fade hover:text-primary hover:border-primary/30"
                        }`}
                      >
                        <div className="text-sm font-bold">{form.name}</div>
                        <div
                          className={`mt-1 text-xs ${
                            selectedFormId === form.id ? "text-text-muted" : "text-text-muted"
                          }`}
                        >
                          {Array.isArray(form.fields) ? form.fields.length : 0} field(s)
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                    <Database size={12} />
                    {selectedFormId ? "Edit Lead Form" : "Create Lead Form"}
                  </div>
                  <div className="mt-2 text-sm text-text-muted">
                    Define reusable fields once, then link input nodes to them in the flow builder.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedFormId ? (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving || !canManageLeadForms}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !canManageLeadForms}
                    className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={14} />
                    {saving ? "Saving..." : "Save Form"}
                  </button>
                </div>
              </div>

              <div className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                    Form Name
                  </label>
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="e.g. Real Estate Inquiry"
                    className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-muted outline-none"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                      Fields
                    </div>
                    <button
                      type="button"
                      onClick={addField}
                      className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-transparent px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-text-main transition hover:bg-primary-fade hover:text-primary hover:border-primary/30"
                    >
                      <Plus size={14} />
                      Add Field
                    </button>
                  </div>

                  <div className="rounded-2xl border border-border-main bg-canvas p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                      Standard Fields
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {STANDARD_FIELD_PRESETS.map((preset) => (
                        <button
                          key={preset.fieldKey}
                          type="button"
                          onClick={() => addStandardField(preset)}
                          className="rounded-full border border-border-main bg-transparent px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-text-main transition hover:bg-primary-fade hover:text-primary hover:border-primary/30"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {draftFields.map((field, index) => (
                    <div key={`${field.fieldKey}-${index}`} className="rounded-2xl border border-border-main bg-canvas p-4">
                      <div className="grid gap-3 md:grid-cols-[1fr_180px_1.3fr_auto_auto]">
                        <input
                          value={field.fieldKey}
                          onChange={(event) => updateField(index, "fieldKey", event.target.value)}
                          placeholder="field_key"
                          className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm font-mono text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                        <select
                          value={field.fieldType}
                          onChange={(event) => updateField(index, "fieldType", event.target.value)}
                          className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          {[...STANDARD_FIELD_PRESETS.map((item) => ({ label: item.label, value: item.fieldType })), ...CUSTOM_FIELD_TYPES]
                            .filter((item, itemIndex, arr) => arr.findIndex((candidate) => candidate.value === item.value) === itemIndex)
                            .map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                        </select>
                        <input
                          value={field.questionLabel}
                          onChange={(event) => updateField(index, "questionLabel", event.target.value)}
                          placeholder="Question label"
                          className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                        <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-main bg-transparent px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-text-main">
                          <input
                            type="checkbox"
                            checked={Boolean(field.isRequired)}
                            onChange={(event) => updateField(index, "isRequired", event.target.checked)}
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => removeField(index)}
                          className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 transition hover:bg-red-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {field.fieldType === "dropdown" ? (
                        <textarea
                          value={Array.isArray(field.options) ? field.options.join(", ") : ""}
                          onChange={(event) =>
                            updateField(
                              index,
                              "options",
                              event.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean)
                            )
                          }
                          placeholder="Dropdown options separated by commas"
                          className="mt-3 w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

