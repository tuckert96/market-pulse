const SECRET_KEY_PATTERN = /(api[_-]?key|client[_-]?secret|secret|token|refresh[_-]?token|password|cookie|authorization|session|\bitem[_-]?id\b)/i;
const ACCOUNT_KEY_PATTERN = /(account[_-]?(number|id)|acct[_-]?(number|id)|accountNumber|accountId)$/i;
const SECRET_VALUE_PATTERN = /(access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|apikey|password|cookie|authorization|session(?:[_-]?id)?)["':=\s]+[^"',\s]+/gi;
const CAMEL_SECRET_VALUE_PATTERN = /(accessToken|refreshToken|clientSecret|apiKey)["':=\s]+[^"',\s]+/g;
const RAW_SECRET_VALUE_PATTERNS = Object.freeze([
  /sk-[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g
]);
const MAX_EXPORTED_STRING_LENGTH = 2000;

export function sanitizeStateForBackup(value) {
  return sanitizeValue(value);
}

export function sanitizeImportedState(value) {
  return sanitizeValue(value);
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? sanitizeStringValue(value) : value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, ACCOUNT_KEY_PATTERN.test(key) ? maskAccountValue(item) : sanitizeValue(item)])
  );
}

function sanitizeStringValue(value) {
  return redactLongOpaqueTokens(RAW_SECRET_VALUE_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(SECRET_VALUE_PATTERN, "$1 [redacted]")
    .replace(CAMEL_SECRET_VALUE_PATTERN, "$1 [redacted]")))
    .slice(0, MAX_EXPORTED_STRING_LENGTH);
}

function redactLongOpaqueTokens(value = "") {
  return String(value).replace(/\b[A-Za-z0-9_-]{48,}\b/g, (token) =>
    looksLikeOpaqueToken(token) ? "[redacted]" : token
  );
}

function looksLikeOpaqueToken(token = "") {
  const text = String(token);
  const classes = [
    /[a-z]/.test(text),
    /[A-Z]/.test(text),
    /\d/.test(text),
    /[_-]/.test(text)
  ].filter(Boolean).length;
  const uniqueChars = new Set(text).size;
  return text.length >= 48 && classes >= 2 && uniqueChars >= 12;
}

function maskAccountValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const last4 = text.replace(/\D/g, "").slice(-4);
  return last4 ? `masked-${last4}` : "masked";
}
