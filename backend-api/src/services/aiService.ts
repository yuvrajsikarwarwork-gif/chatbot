import { getAiProvidersRuntimeService } from "./platformSettingsService";

type AiProviderOptions = {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  prompt?: string;
  style?: string;
};

type AiExtractionField = {
  key: string;
  type?: string;
  description?: string;
  required?: boolean;
};

type AiExtractionNodeData = {
  provider?: string;
  model?: string;
  prompt?: string;
  systemPrompt?: string;
  instructions?: string;
  style?: string;
  fields?: AiExtractionField[];
  requiredFields?: AiExtractionField[];
  optionalFields?: AiExtractionField[];
  minConfidence?: number | string;
  onIncomplete?: string;
  saveConfidenceTo?: string;
};

function replaceVariablesInText(value: string, variables: Record<string, any>) {
  const source = String(value || "");
  if (!source || !variables || typeof variables !== "object") {
    return source;
  }

  return source.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey || "").trim();
    if (!key) {
      return "";
    }

    const resolved = variables[key];
    if (resolved === null || resolved === undefined) {
      return "";
    }

    if (typeof resolved === "object") {
      try {
        return JSON.stringify(resolved);
      } catch {
        return String(resolved);
      }
    }

    return String(resolved);
  });
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

function normalizeFieldList(fields: any[], required = false): AiExtractionField[] {
  return (Array.isArray(fields) ? fields : [])
    .map((field: any) => {
      const key = String(field?.key || field?.name || "").trim();
      if (!key) {
        return null;
      }

      return {
        key,
        type: String(field?.type || "string").trim().toLowerCase() || "string",
        description: String(field?.description || "").trim(),
        required: required || Boolean(field?.required),
      };
    })
    .filter(Boolean) as AiExtractionField[];
}

function normalizeAiExtractionFields(nodeData: AiExtractionNodeData) {
  const requiredFields = normalizeFieldList(nodeData.requiredFields || [], true);
  const optionalFields = normalizeFieldList(nodeData.optionalFields || [], false);
  const fallbackFields =
    requiredFields.length + optionalFields.length > 0
      ? []
      : normalizeFieldList(nodeData.fields || [], true);

  const allFields = [...requiredFields, ...optionalFields, ...fallbackFields];
  const uniqueFields: AiExtractionField[] = [];
  const seen = new Set<string>();

  for (const field of allFields) {
    const key = String(field.key || "").trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueFields.push(field);
  }

  return {
    requiredFields: uniqueFields.filter((field) => field.required || requiredFields.some((item) => item.key === field.key)),
    optionalFields: uniqueFields.filter((field) => !field.required && !requiredFields.some((item) => item.key === field.key)),
    allFields: uniqueFields,
  };
}

async function callAiTextCompletion(options: AiProviderOptions) {
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
  const style = String(options?.style || "").trim();
  const fullPrompt = [systemPrompt, style ? `Style: ${style}` : "", userPrompt].filter(Boolean).join("\n\n").trim();

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
          temperature: Number(aiProviders.editable.temperature ?? 0.2),
          max_tokens: Number(aiProviders.editable.maxOutputTokens ?? 1024),
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

function normalizeConfidence(value: any) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    return 0;
  }
  if (confidence < 0) return 0;
  if (confidence > 1) return 1;
  return confidence;
}

function fallbackFieldSuggestion(key: string, type: string) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  const normalizedType = String(type || "string").trim().toLowerCase();

  if (normalizedKey.includes("email")) {
    return "Extract a valid email address containing an @ symbol and a domain.";
  }
  if (normalizedKey.includes("phone") || normalizedKey.includes("mobile")) {
    return "Extract a phone number, including country code if present.";
  }
  if (normalizedKey.includes("order") || normalizedKey.includes("ticket") || normalizedKey.includes("ref")) {
    return "Extract the order, ticket, or reference number from the message.";
  }
  if (normalizedKey.includes("name")) {
    return "Extract the person's name from the message.";
  }
  if (normalizedKey.includes("zip") || normalizedKey.includes("postal")) {
    return "Extract the postal or ZIP code from the message.";
  }

  return `Extract the ${normalizedKey || "requested"} value as a ${normalizedType}.`;
}

export async function suggestFieldDescription(key: string, type: string) {
  const normalizedKey = String(key || "").trim();
  const normalizedType = String(type || "string").trim().toLowerCase() || "string";

  const metaPrompt = [
    "Task: write one concise AI extraction instruction.",
    `Field key: ${normalizedKey}`,
    `Field type: ${normalizedType}`,
    "Return only the instruction sentence. No bullets. No quotes.",
    "Examples:",
    '"email" -> "Look for a valid email address, including an @ symbol and a domain."',
    '"order_id" -> "Extract the order or reference number, usually a 5-8 digit code."',
  ].join("\n");

  const suggestion = String(
    await callAiTextCompletion({
      prompt: metaPrompt,
      systemPrompt: "",
      provider: "auto",
    }).catch(() => "")
  )
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "");

  return suggestion || fallbackFieldSuggestion(normalizedKey, normalizedType);
}

export async function executeAiExtractionLogic(
  nodeData: AiExtractionNodeData,
  incomingText: string,
  variables: Record<string, any> = {}
) {
  const normalizedInput = replaceVariablesInText(String(incomingText || ""), variables);
  const normalizedVariables = variables && typeof variables === "object" ? variables : {};
  const { requiredFields, optionalFields, allFields } = normalizeAiExtractionFields(nodeData || {});
  const minConfidence = normalizeConfidence(nodeData?.minConfidence ?? 0.7) || 0.7;
  const fieldLines = allFields
    .map((field) => `- ${field.key} (${field.type || "string"}): ${field.description || "Extract this field."}`)
    .join("\n");

  const extractionPrompt = [
    "Task: extract structured data from the user input.",
    `User input: ${normalizedInput}`,
    `Requested fields:\n${fieldLines || "- No fields provided."}`,
    "Return ONLY valid JSON.",
    "Use null for missing values.",
    'Include "_confidence" with a value from 0 to 1.',
    'Include "_missing" as an array of missing required field keys.',
    "Do not add markdown or prose.",
  ].join("\n\n");

  const rawOutput = await callAiTextCompletion({
    ...(nodeData?.provider ? { provider: nodeData.provider } : {}),
    ...(nodeData?.model ? { model: nodeData.model } : {}),
    systemPrompt: String(nodeData?.prompt || nodeData?.systemPrompt || nodeData?.instructions || "").trim(),
    prompt: extractionPrompt,
    ...(nodeData?.style ? { style: nodeData.style } : {}),
  });

  const parsed = safeJsonParse(rawOutput) || {};
  const confidence = normalizeConfidence(parsed?._confidence ?? parsed?.confidence ?? 0);
  const extractedData: Record<string, any> = {};

  for (const field of allFields) {
    const value = parsed?.[field.key];
    extractedData[field.key] = value === undefined ? null : value;
  }

  const missingRequired = requiredFields
    .filter((field) => {
      const value = extractedData[field.key];
      return value === null || value === undefined || String(value).trim() === "";
    })
    .map((field) => field.key);

  const meetsConfidence = confidence >= minConfidence;
  const isComplete = meetsConfidence && missingRequired.length === 0;

  return {
    extractedData,
    confidence,
    missingRequired,
    rawOutput,
    parsedOutput: parsed,
    meetsConfidence,
    isComplete,
    requiredFields,
    optionalFields,
    allFields,
  };
}

export const executeExtractionLogic = executeAiExtractionLogic;
export const previewExtraction = executeAiExtractionLogic;
