const normalizeText = (value: any) => String(value || "").trim().toLowerCase();

const RESET_KEYWORDS = ["reset", "restart", "home", "menu", "start"];
const ESCAPE_KEYWORDS = ["end", "exit", "stop", "cancel", "quit", "conversation end"];

export const isResetCommand = (value: any) => {
  const normalized = normalizeText(value);
  return RESET_KEYWORDS.includes(normalized);
};

export const isEscapeCommand = (value: any) => {
  const normalized = normalizeText(value);
  return ESCAPE_KEYWORDS.includes(normalized);
};

export const isLifecycleResetOrEscape = (value: any) => isResetCommand(value) || isEscapeCommand(value);

