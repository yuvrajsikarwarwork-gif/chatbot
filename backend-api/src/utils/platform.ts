const LEGACY_PLATFORM_MAP: Record<string, string> = {
  web: "website",
};

export const SUPPORTED_PLATFORMS = [
  "whatsapp",
  "website",
  "facebook",
  "instagram",
  "api",
  "telegram",
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export function normalizePlatform(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return LEGACY_PLATFORM_MAP[normalized] || normalized;
}

export function isSupportedPlatform(value: string | null | undefined): value is SupportedPlatform {
  return SUPPORTED_PLATFORMS.includes(normalizePlatform(value) as SupportedPlatform);
}
