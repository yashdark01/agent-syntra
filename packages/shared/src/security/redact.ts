/**
 * Redaction utilities for protecting API keys and sensitive tokens.
 */

// Patterns matching common AI provider tokens and sensitive headers
const SECRET_PATTERNS: RegExp[] = [
  /sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/g, // OpenAI
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,       // Anthropic
  /AIzaSy[a-zA-Z0-9_-]{33}/g,          // Google API Key
  /Bearer\s+[a-zA-Z0-9_.-]{20,}/gi,    // Bearer token
  /gsk_[a-zA-Z0-9_-]{20,}/g,          // Groq
];

const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'key',
  'secret',
  'password',
  'token',
  'authorization',
  'auth',
  'credential',
  'credentials',
]);

/**
 * Redacts a single secret string, showing only the first few characters and masking the rest.
 */
export function redactSecret(secret: string): string {
  if (!secret) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-3);
  return `${prefix}••••••••${suffix}`;
}

/**
 * Scans a string and replaces recognized secret patterns with redacted placeholders.
 */
export function redactString(text: string): string {
  if (!text) return '';
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match) => redactSecret(match));
  }
  return result;
}

/**
 * Deeply sanitizes objects, arrays, and primitive data to prevent sensitive values
 * from appearing in logs or error messages.
 */
export function sanitizeMetadata(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return redactString(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: redactString(data.message),
      stack: data.stack ? redactString(data.stack) : undefined,
    };
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeMetadata(item));
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        if (typeof value === 'string') {
          sanitizedObj[key] = redactSecret(value);
        } else {
          sanitizedObj[key] = '••••••••';
        }
      } else {
        sanitizedObj[key] = sanitizeMetadata(value);
      }
    }
    return sanitizedObj;
  }

  return String(data);
}
