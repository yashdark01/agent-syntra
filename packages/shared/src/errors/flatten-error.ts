/**
 * Unwrap nested JSON error payloads (common with Gemini / REST gateways)
 * into a single human-readable sentence.
 */
export function flattenNestedErrorMessage(raw: string): string {
  let current = raw.trim();

  for (let i = 0; i < 5; i += 1) {
    if (!current.startsWith('{') && !current.startsWith('"')) {
      break;
    }

    try {
      const parsed: unknown = JSON.parse(current);
      if (typeof parsed === 'string') {
        current = parsed.trim();
        continue;
      }
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        const nestedError = record.error;
        if (typeof nestedError === 'string') {
          current = nestedError.trim();
          continue;
        }
        if (nestedError && typeof nestedError === 'object') {
          const inner = nestedError as Record<string, unknown>;
          if (typeof inner.message === 'string') {
            current = inner.message.trim();
            continue;
          }
        }
        if (typeof record.message === 'string') {
          current = record.message.trim();
          continue;
        }
      }
      break;
    } catch {
      break;
    }
  }

  return current.replace(/\s+/g, ' ').trim();
}
