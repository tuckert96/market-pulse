const PLACEHOLDER_PATTERNS = [
  /^your[_-]?[a-z0-9_-]*$/,
  /your[_-]?[a-z0-9_-]*[_-]?here$/,
  /^replace[_-]?me$/,
  /^placeholder$/,
  /^change[_-]?me$/,
  /^changeme$/,
  /^example$/,
  /^demo$/,
  /^dummy$/,
  /^test$/,
  /api[_-]?key[_-]?here$/,
  /client[_-]?secret[_-]?here$/,
  /refresh[_-]?token[_-]?here$/
];

export function isUsableCredentialValue(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  const normalized = trimmed
    .replace(/^["']|["']$/g, "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function usableCredentialValue(value = "") {
  const trimmed = String(value || "").trim().replace(/^["']|["']$/g, "");
  return isUsableCredentialValue(trimmed) ? trimmed : "";
}
