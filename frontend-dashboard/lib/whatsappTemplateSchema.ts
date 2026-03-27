export type TemplateCategory = "marketing" | "utility" | "authentication";
export type TemplatePlatform = "whatsapp" | "telegram" | "email" | "sms" | "instagram";
export type TemplateValidationMode = "draft" | "publish";

export type TemplateButtonType =
  | "quick_reply"
  | "url"
  | "phone"
  | "copy_code"
  | "flow"
  | "catalog";

export type TemplateButton = {
  type?: string | null;
  title?: string | null;
  value?: string | null;
};

export type TemplateHeader = {
  type?: string | null;
  text?: string | null;
  assetId?: string | null;
  assetUrl?: string | null;
};

export type TemplateContent = {
  header?: TemplateHeader | null;
  body?: string | null;
  footer?: string | null;
  buttons?: TemplateButton[] | null;
};

export type TemplateValidationInput = {
  name?: string | null;
  language?: string | null;
  category?: string | null;
  campaign_id?: string | null;
  platform_type?: string | null;
  header_type?: string | null;
  header?: string | null;
  body?: string | null;
  footer?: string | null;
  buttons?: TemplateButton[] | null;
  content?: TemplateContent | null;
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;
const URL_PATTERN = /^https?:\/\//i;
const E164_PATTERN = /^\+[1-9][0-9]{6,19}$/;
const VARIABLE_PATTERN = /{{\s*(\d+)\s*}}/g;

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function extractVariables(value: string) {
  return Array.from(value.matchAll(VARIABLE_PATTERN)).map((match) => Number(match[1]));
}

function hasSequentialVariables(value: string) {
  const variables = Array.from(new Set(extractVariables(value))).sort((a, b) => a - b);
  return variables.every((token, index) => token === index + 1);
}

function getNormalizedContent(input: TemplateValidationInput) {
  const content = input.content || {};
  const header = content.header || null;
  return {
    platformType: normalizeText(input.platform_type || "whatsapp").toLowerCase(),
    name: normalizeText(input.name),
    language: normalizeText(input.language),
    category: normalizeText(input.category).toLowerCase(),
    campaignId: normalizeText(input.campaign_id),
    headerType: normalizeText(header?.type || input.header_type || "none").toLowerCase(),
    headerText: String(header?.text ?? input.header ?? ""),
    headerAssetId: normalizeText(header?.assetId),
    headerAssetUrl: normalizeText(header?.assetUrl),
    body: String(content.body ?? input.body ?? ""),
    footer: String(content.footer ?? input.footer ?? ""),
    buttons: Array.isArray(content.buttons)
      ? content.buttons
      : Array.isArray(input.buttons)
        ? input.buttons
        : [],
  };
}

export function validateTemplateInput(
  input: TemplateValidationInput,
  mode: TemplateValidationMode = "publish"
): ValidationResult {
  const errors: string[] = [];
  const normalized = getNormalizedContent(input);

  if (!normalized.campaignId) {
    errors.push(
      mode === "draft"
        ? "Select a connected campaign before saving a draft."
        : "Select a connected campaign."
    );
  }

  if (!normalized.name) {
    errors.push(
      mode === "draft" ? "Internal name is required for a draft." : "Message template name is required."
    );
  } else {
    if (normalized.name.length > 512) {
      errors.push("Template name must stay within 512 characters.");
    }
    if (!TEMPLATE_NAME_PATTERN.test(normalized.name)) {
      errors.push("Template name must use lowercase letters, numbers, and underscores only.");
    }
  }

  if (mode === "draft") {
    return { ok: errors.length === 0, errors };
  }

  if (!normalized.language) {
    errors.push("Select a template language.");
  }

  if (!["marketing", "utility", "authentication"].includes(normalized.category)) {
    errors.push("Select a valid template category.");
  }

  if (!normalized.body.trim()) {
    errors.push("Template body is required.");
  }

  if (normalized.platformType !== "whatsapp") {
    return { ok: errors.length === 0, errors };
  }

  const bodyText = normalized.body;
  const bodyVariables = extractVariables(bodyText);
  const footerText = normalized.footer;
  const headerText = normalized.headerText;

  if (bodyText.length > 1024) {
    errors.push("WhatsApp body must stay within 1024 characters.");
  }
  if (footerText.length > 60) {
    errors.push("WhatsApp footer must stay within 60 characters.");
  }
  if (/{{\s*\d+\s*}}/.test(footerText)) {
    errors.push("WhatsApp footer cannot contain variables.");
  }
  if (URL_PATTERN.test(footerText)) {
    errors.push("WhatsApp footer cannot contain URLs.");
  }

  if (normalized.headerType === "text") {
    if (headerText.length > 60) {
      errors.push("WhatsApp text header must stay within 60 characters.");
    }
    const headerVariables = extractVariables(headerText);
    if (headerVariables.length > 1) {
      errors.push("WhatsApp text header supports at most one variable.");
    }
    if (headerVariables.length === 1 && headerVariables[0] !== 1) {
      errors.push("WhatsApp text header variable must be {{1}}.");
    }
  }

  if (["image", "video", "document"].includes(normalized.headerType)) {
    if (!normalized.headerAssetId) {
      errors.push("Provide a Meta media handle for the WhatsApp media header sample.");
    }
    if (URL_PATTERN.test(normalized.headerAssetId)) {
      errors.push("WhatsApp media headers require a Meta media handle, not a public URL.");
    }
  }

  if (bodyVariables.length > 0) {
    if (!hasSequentialVariables(bodyText)) {
      errors.push("WhatsApp body variables must be sequential without gaps.");
    }
    if (/{{\s*\d+\s*}}\s*{{\s*\d+\s*}}/.test(bodyText)) {
      errors.push("WhatsApp body cannot contain back-to-back variables.");
    }
    if (/^\s*{{\s*\d+\s*}}/.test(bodyText) || /{{\s*\d+\s*}}\s*$/.test(bodyText)) {
      errors.push("WhatsApp body variables cannot appear at the very start or end without surrounding text.");
    }
  }

  const buttons = normalized.buttons;
  const quickReplies = buttons.filter((button) => normalizeText(button?.type).toLowerCase() === "quick_reply");
  const urlButtons = buttons.filter((button) => normalizeText(button?.type).toLowerCase() === "url");
  const phoneButtons = buttons.filter((button) => normalizeText(button?.type).toLowerCase() === "phone");
  const copyCodeButtons = buttons.filter((button) => normalizeText(button?.type).toLowerCase() === "copy_code");

  if (buttons.length > 10) {
    errors.push("WhatsApp supports at most 10 buttons in total.");
  }
  if (urlButtons.length > 2) {
    errors.push("WhatsApp supports at most 2 website CTA buttons.");
  }
  if (phoneButtons.length > 1) {
    errors.push("WhatsApp supports at most 1 phone CTA button.");
  }
  if (copyCodeButtons.length > 1) {
    errors.push("WhatsApp supports at most 1 copy code button.");
  }

  const seenTitles = new Set<string>();
  let seenCta = false;
  for (const button of buttons) {
    const type = normalizeText(button?.type).toLowerCase();
    const title = normalizeText(button?.title);
    const value = normalizeText(button?.value);
    const isQuickReply = type === "quick_reply";
    const isCta = type === "url" || type === "phone" || type === "copy_code" || type === "flow" || type === "catalog";

    if (!title) {
      errors.push("Every WhatsApp button needs visible button text.");
      continue;
    }
    if (title.length > 25) {
      errors.push(`Button "${title}" must stay within 25 characters.`);
    }

    const normalizedTitle = title.toLowerCase();
    if (seenTitles.has(normalizedTitle)) {
      errors.push(`Button text "${title}" must be unique.`);
    }
    seenTitles.add(normalizedTitle);

    if (isCta) {
      seenCta = true;
    }
    if (seenCta && isQuickReply) {
      errors.push("WhatsApp buttons must be grouped: quick replies first, CTA buttons after them.");
    }

    if (!isQuickReply && !isCta) {
      errors.push(`Unsupported WhatsApp button type "${type || "unknown"}".`);
      continue;
    }

    if (type === "url") {
      if (!value) {
        errors.push(`URL button "${title}" needs a website URL.`);
      } else {
        const variables = extractVariables(value);
        if (variables.length > 0) {
          if (variables.length !== 1 || !value.endsWith(`{{${variables[0]}}}`)) {
            errors.push(`Dynamic URL button "${title}" must end with exactly one variable.`);
          }
        } else if (!URL_PATTERN.test(value)) {
          errors.push(`URL button "${title}" needs a valid static URL.`);
        }
      }
    }

    if (type === "phone" && !E164_PATTERN.test(value)) {
      errors.push(`Phone button "${title}" needs a valid E.164 phone number.`);
    }

    if (type === "copy_code") {
      if (normalized.category !== "marketing") {
        errors.push("Copy code buttons are only allowed for marketing templates.");
      }
      if (!value) {
        errors.push(`Copy code button "${title}" needs a sample code.`);
      } else if (value.length > 15) {
        errors.push(`Copy code button "${title}" must stay within 15 characters.`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
