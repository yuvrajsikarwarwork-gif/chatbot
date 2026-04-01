import { API_URL } from "../config/apiConfig";
import { notify } from "../store/uiStore";

export type ApiErrorInfo = {
  title: string;
  message: string;
  details: string[];
  status: number | null;
  code: string | null;
  requestId: string | null;
};

function dedupeDetails(items: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

export function extractApiErrorInfo(
  error: any,
  fallbackMessage = "Request failed.",
  fallbackTitle = "Request Failed"
): ApiErrorInfo {
  if (!error?.response) {
    return {
      title: fallbackTitle,
      message: "Cannot reach the backend service.",
      details: dedupeDetails([
        error?.message || null,
        API_URL ? `API URL: ${API_URL}` : null,
        "Check whether the backend server is running and reachable from the frontend.",
      ]),
      status: null,
      code: null,
      requestId: null,
    };
  }

  const payload = error.response?.data && typeof error.response.data === "object"
    ? error.response.data
    : {};
  const status = Number.isFinite(Number(error.response?.status))
    ? Number(error.response.status)
    : null;
  const code = payload?.code ? String(payload.code).trim() : null;
  const requestId = payload?.requestId ? String(payload.requestId).trim() : null;
  const message = String(
    payload?.error ||
      payload?.message ||
      error?.message ||
      fallbackMessage
  ).trim() || fallbackMessage;

  return {
    title: fallbackTitle,
    message,
    details: dedupeDetails([
      ...(Array.isArray(payload?.details) ? payload.details : []),
      status ? `HTTP ${status}` : null,
      code ? `Code: ${code}` : null,
      requestId ? `Request ID: ${requestId}` : null,
    ]),
    status,
    code,
    requestId,
  };
}

export function notifyApiError(
  error: any,
  fallbackMessage = "Request failed.",
  fallbackTitle = "Request Failed"
) {
  const info = extractApiErrorInfo(error, fallbackMessage, fallbackTitle);
  notify({
    tone: "error",
    title: info.title,
    message: info.message,
    details: info.details,
    durationMs: info.details.length > 0 ? 9000 : 5000,
  });
  return info;
}
