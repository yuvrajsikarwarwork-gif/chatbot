export function mergeSettingsSources(...sources: any[]) {
  return sources.reduce((acc, source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return acc;
    }

    return { ...acc, ...source };
  }, {});
}
