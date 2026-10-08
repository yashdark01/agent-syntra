import { describe, it, expect } from 'vitest';
import { flattenNestedErrorMessage } from '@syntra/shared';
import { resolveGeminiModelId, GEMINI_DEFAULT_MODEL } from '@syntra/providers';
import { GeminiProvider } from '@syntra/providers';

describe('Gemini model catalog', () => {
  it('aliases retired Gemini 2.0 / 1.5 identifiers onto current models', () => {
    expect(resolveGeminiModelId('gemini-2.0-flash')).toBe(GEMINI_DEFAULT_MODEL);
    expect(resolveGeminiModelId('models/gemini-2.0-flash')).toBe(GEMINI_DEFAULT_MODEL);
    expect(resolveGeminiModelId('gemini-1.5-pro')).toBe('gemini-2.5-pro');
    expect(resolveGeminiModelId('gemini-3.8-flash')).toBe('gemini-3.8-flash');
  });

  it('lists current Gemini models instead of retired 2.0 ids', async () => {
    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const models = await provider.listModels();
    expect(models.map((m) => m.id)).toContain(GEMINI_DEFAULT_MODEL);
    expect(models.map((m) => m.id)).not.toContain('gemini-2.0-flash');
  });
});

describe('flattenNestedErrorMessage', () => {
  it('unwraps Gemini REST nested JSON error payloads', () => {
    const raw = JSON.stringify({
      error: {
        message: JSON.stringify({
          error: {
            code: 404,
            message:
              'This model models/gemini-2.0-flash is no longer available. Please update your code to use models/gemini-3.8-flash',
            status: 'NOT_FOUND',
          },
        }),
        code: 404,
        status: 'Not Found',
      },
    });

    const flat = flattenNestedErrorMessage(raw);
    expect(flat).toContain('no longer available');
    expect(flat).toContain('gemini-3.8-flash');
    expect(flat.startsWith('{')).toBe(false);
  });
});
