import { query } from "../config/db";
import { getAiProvidersRuntimeService } from "./platformSettingsService";

export type OptimizationReasonBucket = "low_confidence" | "missing_data" | "semantic_miss";

export interface NodeOptimizationReport {
  nodeId: string;
  flowId: string | null;
  nodeType: string | null;
  totalAttempts: number;
  failureCount: number;
  fallbackCount: number;
  avgConfidence: number | null;
  failureRate: number;
  reasonBucket: OptimizationReasonBucket;
  sampleInputs: string[];
  lastSeenAt: string | null;
}

export interface NodeOptimizationFieldUpdate {
  key: string;
  description: string;
}

export interface NodeOptimizationSuggestion {
  reasoning: string;
  suggested_prompt: string;
  fieldUpdates?: NodeOptimizationFieldUpdate[];
  notes?: string[];
}

export interface NodeOptimizationPerformanceResolution {
  nodeId: string;
  note: string | null;
}

export interface NodeOptimizationPerformancePoint {
  date: string;
  failureRate: number;
  avgConfidence: number | null;
  totalAttempts: number;
  failureCount: number;
  confidenceScore: number;
  resolutions: NodeOptimizationPerformanceResolution[];
}

type CreatedAtFilterInput = {
  sinceHours?: number | null;
  days?: number | null;
  startDate?: string | null;
};

function buildCreatedAtFilter(input: CreatedAtFilterInput, paramIndex: number) {
  const startDate = typeof input.startDate === "string" ? input.startDate.trim() : "";
  const parsedStartDate = startDate ? new Date(startDate) : null;
  if (parsedStartDate && !Number.isNaN(parsedStartDate.getTime())) {
    return {
      clause: `AND re.created_at >= $${paramIndex}::timestamptz`,
      values: [parsedStartDate.toISOString()],
    };
  }

  const days = Number(input.days || 0);
  if (Number.isFinite(days) && days > 0) {
    return {
      clause: `AND re.created_at >= NOW() - ($${paramIndex}::int * INTERVAL '1 day')`,
      values: [days],
    };
  }

  const sinceHours = Number(input.sinceHours || 0);
  if (Number.isFinite(sinceHours) && sinceHours > 0) {
    return {
      clause: `AND re.created_at >= NOW() - ($${paramIndex}::int * INTERVAL '1 hour')`,
      values: [sinceHours],
    };
  }

  return {
    clause: "",
    values: [] as Array<string | number>,
  };
}

async function tableExists(tableName: string) {
  const res = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
     ) AS exists`,
    [tableName]
  );

  return Boolean(res.rows[0]?.exists);
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeSampleInputs(value: unknown, limit = 5) {
  const seen = new Set<string>();
  const inputs: string[] = [];

  for (const item of parseJsonArray(value)) {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    inputs.push(normalized);
    if (inputs.length >= limit) {
      break;
    }
  }

  return inputs;
}

function stripCodeFences(value: string) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function safeJsonParse(value: string) {
  const stripped = stripCodeFences(value);
  if (!stripped) {
    return null;
  }

  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function fallbackReasoning(reasonBucket: OptimizationReasonBucket) {
  switch (reasonBucket) {
    case "missing_data":
      return "The node is losing requests because users are not supplying all required details.";
    case "semantic_miss":
      return "The classifier is not recognizing the user's wording and is falling back too often.";
    case "low_confidence":
    default:
      return "The node is completing, but the confidence signal is too weak to trust the output.";
  }
}

function fallbackPromptSuggestion(nodeData: any, reasonBucket: OptimizationReasonBucket, sampleInputs: string[]) {
  const nodeType = String(nodeData?.type || "").trim().toLowerCase();
  const currentPrompt = String(nodeData?.prompt || nodeData?.systemPrompt || nodeData?.instructions || "").trim();
  const sampleText = sampleInputs.slice(0, 3).join("; ");

  if (nodeType === "ai_extract") {
    const fieldLines = [
      ...((Array.isArray(nodeData?.requiredFields) ? nodeData.requiredFields : []) as any[]),
      ...((Array.isArray(nodeData?.optionalFields) ? nodeData.optionalFields : []) as any[]),
    ]
      .map((field) => String(field?.key || "").trim())
      .filter(Boolean);

    const prompt = [
      currentPrompt || "Extract the requested information from the user's message.",
      "Be explicit about accepted wording, abbreviations, and common variants.",
      sampleText ? `User messages often look like: ${sampleText}.` : "",
      reasonBucket === "missing_data"
        ? "Ask for missing required values and return null when the value is not present."
        : "Keep the extraction strict and return a confidence score that reflects uncertainty.",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      reasoning: fallbackReasoning(reasonBucket),
      suggested_prompt: prompt,
      fieldUpdates: fieldLines.slice(0, 6).map((key) => ({
        key,
        description: `Accept ${key} in the formats users naturally use, including common shorthand and variants.`,
      })),
    };
  }

  const prompt = [
    currentPrompt || "Classify the user's message into the correct branch.",
    sampleText ? `Recent failing messages include: ${sampleText}.` : "",
    reasonBucket === "semantic_miss"
      ? "Expand branch guidance to include slang, abbreviations, and alternate phrasings."
      : "Prefer the most likely branch only when the user intent is clear.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    reasoning: fallbackReasoning(reasonBucket),
    suggested_prompt: prompt,
  };
}

async function callAiTextCompletion(options: {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const aiProviders = await getAiProvidersRuntimeService().catch(() => null);
  const rawProvider = String(options?.provider || aiProviders?.editable?.defaultProvider || "auto")
    .trim()
    .toLowerCase();
  const provider = rawProvider === "auto"
    ? String(aiProviders?.editable?.defaultProvider || "openai").trim().toLowerCase()
    : rawProvider;
  const model =
    String(
      options?.model ||
        (provider === "gemini" ? aiProviders?.editable?.geminiModel : aiProviders?.editable?.openaiModel) ||
        aiProviders?.editable?.defaultModel ||
        ""
    ).trim();

  const systemPrompt = String(options?.systemPrompt || "").trim();
  const userPrompt = String(options?.prompt || "").trim();
  const fullPrompt = [systemPrompt, userPrompt].filter(Boolean).join("\n\n").trim();
  if (!fullPrompt) {
    return "";
  }

  try {
    if (provider === "gemini" && aiProviders?.secrets?.geminiApiKey) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model || aiProviders.editable.geminiModel
        )}:generateContent?key=${encodeURIComponent(aiProviders.secrets.geminiApiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: fullPrompt }],
              },
            ],
          }),
        }
      );
      const json = await response.json().catch(() => ({}));
      const text = Array.isArray(json?.candidates)
        ? json.candidates
            .map((candidate: any) =>
              Array.isArray(candidate?.content?.parts)
                ? candidate.content.parts.map((part: any) => String(part?.text || "")).join("")
                : ""
            )
            .join("\n")
            .trim()
        : "";
      if (text) {
        return text;
      }
    }

    if (provider === "openai" && aiProviders?.secrets?.openaiApiKey) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aiProviders.secrets.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: model || aiProviders.editable.openaiModel,
          temperature: Number(options?.temperature ?? aiProviders.editable.temperature ?? 0.2),
          max_tokens: Number(options?.maxTokens ?? aiProviders.editable.maxOutputTokens ?? 800),
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: userPrompt || fullPrompt },
          ],
        }),
      });
      const json = await response.json().catch(() => ({}));
      const text = String(json?.choices?.[0]?.message?.content || "").trim();
      if (text) {
        return text;
      }
    }
  } catch (error) {
    void error;
  }

  return fullPrompt;
}

export class NodeOptimizationService {
  static determineReasonBucket(row: {
    semantic_miss_count?: number | string | null;
    missing_data_count?: number | string | null;
    low_confidence_count?: number | string | null;
    avg_confidence?: number | string | null;
  }): OptimizationReasonBucket {
    const semanticMissCount = Number(row.semantic_miss_count || 0);
    const missingDataCount = Number(row.missing_data_count || 0);
    const lowConfidenceCount = Number(row.low_confidence_count || 0);
    const avgConfidence = row.avg_confidence === null || row.avg_confidence === undefined
      ? null
      : Number(row.avg_confidence);

    if (semanticMissCount > 0 && semanticMissCount >= missingDataCount && semanticMissCount >= lowConfidenceCount) {
      return "semantic_miss";
    }

    if (missingDataCount > 0 && missingDataCount >= lowConfidenceCount) {
      return "missing_data";
    }

    if (lowConfidenceCount > 0 || (avgConfidence !== null && Number.isFinite(avgConfidence) && avgConfidence < 0.7)) {
      return "low_confidence";
    }

    return "semantic_miss";
  }

  static async getUnderperformingNodes(input: {
    workspaceId: string;
    limit?: number;
    sinceHours?: number | null;
    days?: number | null;
    startDate?: string | null;
  }): Promise<NodeOptimizationReport[]> {
    if (!String(input.workspaceId || "").trim()) {
      return [];
    }

    if (!(await tableExists("registry_events"))) {
      return [];
    }

    const limit = Math.max(1, Math.min(Number(input.limit || 5), 100));
    const createdAtFilter = buildCreatedAtFilter(input, 2);

    const res = await query(
      `WITH recent_events AS (
         SELECT
           re.node_id,
           re.flow_id,
           UPPER(re.event_type) AS event_type,
           re.metadata,
           re.created_at,
           COALESCE(
             NULLIF(TRIM(re.metadata->>'input'), ''),
             NULLIF(TRIM(re.metadata->>'incomingText'), ''),
             NULLIF(TRIM(re.metadata->>'message'), ''),
             NULLIF(TRIM(re.metadata->>'text'), ''),
             NULLIF(TRIM(re.metadata->>'userInput'), '')
           ) AS sample_input,
           NULLIF(TRIM(re.metadata->>'selectedHandle'), '') AS selected_handle,
           NULLIF(TRIM(re.metadata->>'fallbackHandle'), '') AS fallback_handle,
           NULLIF(TRIM(re.metadata->>'reason'), '') AS reported_reason,
           NULLIF(TRIM(re.metadata->>'nodeType'), '') AS node_type,
           NULLIF(TRIM(re.metadata->>'confidence'), '')::numeric AS confidence,
           NULLIF(TRIM(re.metadata->>'minConfidence'), '')::numeric AS min_confidence,
           CASE
             WHEN UPPER(re.event_type) = 'AI_INTENT_RESULT'
               AND (
                 COALESCE(NULLIF(TRIM(re.metadata->>'selectedHandle'), ''), '') = COALESCE(NULLIF(TRIM(re.metadata->>'fallbackHandle'), ''), 'fallback')
                 OR LOWER(COALESCE(NULLIF(TRIM(re.metadata->>'reason'), ''), '')) = 'semantic_miss'
               )
             THEN 'semantic_miss'
             WHEN UPPER(re.event_type) = 'AI_EXTRACT_RESULT'
               AND (
                 LOWER(COALESCE(NULLIF(TRIM(re.metadata->>'reason'), ''), '')) IN ('missing_data', 'missing_required', 'incomplete')
                 OR COALESCE((re.metadata->>'isComplete')::boolean, true) = false
               )
             THEN 'missing_data'
             WHEN UPPER(re.event_type) = 'AI_EXTRACT_RESULT'
               AND (
                 COALESCE(NULLIF(TRIM(re.metadata->>'confidence'), '')::numeric, 0) < COALESCE(NULLIF(TRIM(re.metadata->>'minConfidence'), '')::numeric, 0.7)
               )
             THEN 'low_confidence'
             ELSE NULL
           END AS failure_bucket
         FROM registry_events re
         WHERE re.workspace_id = $1
           AND re.node_id IS NOT NULL
           AND UPPER(re.event_type) IN ('AI_INTENT_RESULT', 'AI_EXTRACT_RESULT')
           ${createdAtFilter.clause}
       ),
       node_stats AS (
         SELECT
           node_id,
           flow_id,
           COALESCE(MAX(node_type), NULL) AS node_type,
           COUNT(*)::int AS total_attempts,
           COUNT(*) FILTER (WHERE failure_bucket IS NOT NULL)::int AS failure_count,
           COUNT(*) FILTER (WHERE failure_bucket = 'semantic_miss')::int AS semantic_miss_count,
           COUNT(*) FILTER (WHERE failure_bucket = 'missing_data')::int AS missing_data_count,
           COUNT(*) FILTER (WHERE failure_bucket = 'low_confidence')::int AS low_confidence_count,
           AVG(confidence) FILTER (WHERE confidence IS NOT NULL) AS avg_confidence,
           MAX(created_at) AS last_seen_at,
           COALESCE(
             jsonb_agg(sample_input) FILTER (WHERE sample_input IS NOT NULL),
             '[]'::jsonb
           ) AS sample_inputs
         FROM recent_events
         GROUP BY node_id, flow_id
       )
       SELECT
         node_id,
         flow_id,
         node_type,
         total_attempts,
         failure_count,
         semantic_miss_count,
         missing_data_count,
         low_confidence_count,
         avg_confidence,
         last_seen_at,
         sample_inputs,
         CASE
           WHEN semantic_miss_count > 0
             AND semantic_miss_count >= missing_data_count
             AND semantic_miss_count >= low_confidence_count
           THEN 'semantic_miss'
           WHEN missing_data_count > 0
             AND missing_data_count >= low_confidence_count
           THEN 'missing_data'
           WHEN low_confidence_count > 0
             OR COALESCE(avg_confidence, 1) < 0.7
           THEN 'low_confidence'
           ELSE 'semantic_miss'
         END AS reason_bucket,
         CASE
           WHEN total_attempts > 0 THEN failure_count::numeric / total_attempts
           ELSE 0
         END AS failure_rate
       FROM node_stats
       WHERE failure_count > 0
          OR COALESCE(avg_confidence, 1) < 0.7
       ORDER BY failure_rate DESC, failure_count DESC, avg_confidence ASC NULLS LAST, last_seen_at DESC
       LIMIT $${2 + createdAtFilter.values.length}`,
      [...[input.workspaceId, ...createdAtFilter.values], limit]
    );

    return res.rows.map((row) => {
      const avgConfidence = row.avg_confidence === null || row.avg_confidence === undefined
        ? null
        : Number(row.avg_confidence);

      return {
        nodeId: String(row.node_id || "").trim(),
        flowId: row.flow_id ? String(row.flow_id).trim() : null,
        nodeType: row.node_type ? String(row.node_type).trim() : null,
        totalAttempts: Number(row.total_attempts || 0),
        failureCount: Number(row.failure_count || 0),
        fallbackCount: Number(row.semantic_miss_count || 0),
        avgConfidence: avgConfidence !== null && Number.isFinite(avgConfidence) ? avgConfidence : null,
        failureRate: Number(row.failure_rate || 0),
        reasonBucket: this.determineReasonBucket(row),
        sampleInputs: normalizeSampleInputs(row.sample_inputs, 5),
        lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
      } as NodeOptimizationReport;
    });
  }

  static async getPerformanceTimeSeries(input: {
    workspaceId: string;
    days?: number | null;
  }): Promise<NodeOptimizationPerformancePoint[]> {
    if (!String(input.workspaceId || "").trim()) {
      return [];
    }

    if (!(await tableExists("registry_events"))) {
      return [];
    }

    const days = Math.max(1, Math.min(Number(input.days || 30), 365));

    const res = await query(
      `WITH timeline AS (
         SELECT generate_series(
           date_trunc('day', NOW() - GREATEST($2::int - 1, 0) * INTERVAL '1 day'),
           date_trunc('day', NOW()),
           INTERVAL '1 day'
         ) AS day
       ),
       event_agg AS (
         SELECT
           date_trunc('day', re.created_at) AS day,
           COUNT(*)::int AS total_attempts,
           COUNT(*) FILTER (
             WHERE UPPER(re.event_type) IN ('AI_INTENT_RESULT', 'AI_EXTRACT_RESULT')
           )::int AS ai_events,
           COUNT(*) FILTER (
             WHERE UPPER(re.event_type) = 'AI_INTENT_RESULT'
               AND (
                 COALESCE(NULLIF(TRIM(re.metadata->>'selectedHandle'), ''), '') =
                   COALESCE(NULLIF(TRIM(re.metadata->>'fallbackHandle'), ''), 'fallback')
                 OR LOWER(COALESCE(NULLIF(TRIM(re.metadata->>'reason'), ''), '')) = 'semantic_miss'
               )
           )::int AS intent_failures,
           COUNT(*) FILTER (
             WHERE UPPER(re.event_type) = 'AI_EXTRACT_RESULT'
               AND (
                 LOWER(COALESCE(NULLIF(TRIM(re.metadata->>'reason'), ''), '')) IN ('missing_data', 'missing_required', 'incomplete')
                 OR COALESCE((re.metadata->>'isComplete')::boolean, true) = false
                 OR COALESCE(NULLIF(TRIM(re.metadata->>'confidence'), '')::numeric, 0) <
                    COALESCE(NULLIF(TRIM(re.metadata->>'minConfidence'), '')::numeric, 0.7)
               )
           )::int AS extract_failures,
           AVG(NULLIF(TRIM(re.metadata->>'confidence'), '')::numeric) AS avg_confidence
         FROM registry_events re
         WHERE re.workspace_id = $1
           AND re.node_id IS NOT NULL
           AND UPPER(re.event_type) IN ('AI_INTENT_RESULT', 'AI_EXTRACT_RESULT')
           AND re.created_at >= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY 1
       ),
       resolution_agg AS (
         SELECT
           date_trunc('day', oae.resolved_at) AS day,
           COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'nodeId', oae.node_id,
                 'note', NULLIF(TRIM(oae.resolution_note), '')
               )
             ) FILTER (
               WHERE oae.resolution_note IS NOT NULL
                 AND TRIM(oae.resolution_note) <> ''
             ),
             '[]'::jsonb
           ) AS resolutions
         FROM optimizer_alert_events oae
         WHERE oae.workspace_id = $1
           AND oae.status = 'resolved'
           AND oae.resolved_at >= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY 1
       )
       SELECT
         TO_CHAR(t.day, 'YYYY-MM-DD') AS date,
         COALESCE(ea.total_attempts, 0)::int AS total_attempts,
         COALESCE(ea.intent_failures, 0)::int AS intent_failures,
         COALESCE(ea.extract_failures, 0)::int AS extract_failures,
         COALESCE(ea.intent_failures, 0)::int + COALESCE(ea.extract_failures, 0)::int AS failure_count,
         COALESCE(ea.avg_confidence, NULL) AS avg_confidence,
         COALESCE(ra.resolutions, '[]'::jsonb) AS resolutions
       FROM timeline t
       LEFT JOIN event_agg ea
         ON ea.day = t.day
       LEFT JOIN resolution_agg ra
         ON ra.day = t.day
       ORDER BY t.day ASC`,
      [input.workspaceId, days]
    );

    return (res.rows || []).map((row) => {
      const totalAttempts = Number(row.total_attempts || 0);
      const failureCount = Number(row.failure_count || 0);
      const avgConfidence = row.avg_confidence === null || row.avg_confidence === undefined
        ? null
        : Number(row.avg_confidence);
      const resolutions = Array.isArray(row.resolutions)
        ? row.resolutions
            .map((item: any) => ({
              nodeId: String(item?.nodeId || item?.node_id || "").trim(),
              note: item?.note ? String(item.note).trim() : null,
            }))
            .filter((item: NodeOptimizationPerformanceResolution) => Boolean(item.nodeId || item.note))
        : [];

      return {
        date: String(row.date || ""),
        failureRate: totalAttempts > 0 ? failureCount / totalAttempts : 0,
        avgConfidence: avgConfidence !== null && Number.isFinite(avgConfidence) ? avgConfidence : null,
        totalAttempts,
        failureCount,
        confidenceScore: avgConfidence !== null && Number.isFinite(avgConfidence) ? avgConfidence * 100 : 0,
        resolutions,
      };
    });
  }

  static async generateOptimizationSuggestion(input: {
    nodeData: any;
    sampleInputs: string[];
    reasonBucket: string;
  }): Promise<NodeOptimizationSuggestion> {
    const nodeData = input.nodeData && typeof input.nodeData === "object" ? input.nodeData : {};
    const sampleInputs = Array.isArray(input.sampleInputs)
      ? input.sampleInputs.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const reasonBucket = String(input.reasonBucket || "low_confidence").trim().toLowerCase();
    const normalizedReasonBucket: OptimizationReasonBucket =
      reasonBucket === "missing_data" || reasonBucket === "semantic_miss"
        ? reasonBucket
        : "low_confidence";

    const metaPrompt = [
      "You are optimizing a chatbot node using observed failure examples.",
      "Return only valid JSON with keys: reasoning, suggested_prompt, fieldUpdates, notes.",
      "Keep reasoning short and practical, no more than 2 sentences.",
      "Keep suggested_prompt concise and specific.",
      "If this is an ai_extract node, only adjust prompt wording and field descriptions. Do not rename keys.",
      `Node type: ${String(nodeData.type || "").trim() || "unknown"}`,
      `Reason bucket: ${normalizedReasonBucket}`,
      `Current prompt: ${String(nodeData.prompt || nodeData.systemPrompt || nodeData.instructions || "").trim() || "n/a"}`,
      `Failing inputs: ${sampleInputs.length > 0 ? sampleInputs.map((item) => JSON.stringify(item)).join(", ") : "[]"}`,
      "When the failure bucket is missing_data, make the prompt ask for complete answers and mention accepted variants.",
      "When the failure bucket is semantic_miss, improve classification guidance with synonyms, slang, and alternate wording.",
      "When the failure bucket is low_confidence, tighten the instructions and reduce ambiguity.",
    ].join("\n");

    const rawResult = await callAiTextCompletion({
      provider: "auto",
      systemPrompt: "You are a precise optimization assistant for chatbot node prompts.",
      prompt: metaPrompt,
      temperature: 0.3,
      maxTokens: 800,
    });

    const parsed = safeJsonParse(rawResult);
    if (parsed && typeof parsed === "object") {
      const suggestedPrompt = String(parsed.suggested_prompt || parsed.suggestedPrompt || "").trim();
      const reasoning = String(parsed.reasoning || "").trim();
      const fieldUpdates = Array.isArray(parsed.fieldUpdates)
        ? parsed.fieldUpdates
            .map((item: any) => ({
              key: String(item?.key || "").trim(),
              description: String(item?.description || "").trim(),
            }))
            .filter((item: NodeOptimizationFieldUpdate) => Boolean(item.key && item.description))
        : [];

      if (suggestedPrompt && reasoning) {
        return {
          reasoning,
          suggested_prompt: suggestedPrompt,
          ...(fieldUpdates.length > 0 ? { fieldUpdates } : {}),
          ...(Array.isArray(parsed.notes) ? { notes: parsed.notes.map((item: any) => String(item || "").trim()).filter(Boolean) } : {}),
        };
      }
    }

    return fallbackPromptSuggestion(nodeData, normalizedReasonBucket, sampleInputs);
  }
}
