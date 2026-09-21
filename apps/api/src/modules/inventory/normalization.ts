export function normalizeStoredFact(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

export function normalizeIdentityMatchValue(
  value: string | null | undefined,
): string | null {
  const stored = normalizeStoredFact(value);
  return stored ? stored.toLowerCase() : null;
}

export function normalizeManufacturerMatchValue(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeIdentityMatchValue(value);
  return normalized === "speedqueen" ? "speed queen" : normalized;
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
