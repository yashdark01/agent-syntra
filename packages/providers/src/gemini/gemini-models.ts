import { ModelInfo } from '@syntra/core';

export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';

/** Retired Gemini IDs mapped onto current replacements. */
export const GEMINI_MODEL_ALIASES: Record<string, string> = {
  'gemini-2.0-flash': GEMINI_DEFAULT_MODEL,
  'gemini-2.0-flash-001': GEMINI_DEFAULT_MODEL,
  'gemini-2.0-flash-exp': GEMINI_DEFAULT_MODEL,
  'gemini-2.0-flash-thinking-exp': GEMINI_DEFAULT_MODEL,
  'gemini-2.0-flash-thinking-exp-01-21': GEMINI_DEFAULT_MODEL,
  'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-1.5-flash-latest': 'gemini-2.5-flash',
  'gemini-1.5-pro': 'gemini-2.5-pro',
  'gemini-1.5-pro-latest': 'gemini-2.5-pro',
  'gemini-pro': 'gemini-2.5-pro',
  'gemini-pro-latest': 'gemini-2.5-pro',
};

export function normalizeGeminiModelId(model: string): string {
  return model.replace(/^models\//, '').trim();
}

export function resolveGeminiModelId(model: string): string {
  const normalized = normalizeGeminiModelId(model);
  return GEMINI_MODEL_ALIASES[normalized] ?? normalized;
}

export function listGeminiCatalog(providerId: string): ModelInfo[] {
  return [
    {
      id: GEMINI_DEFAULT_MODEL,
      provider: providerId,
      displayName: 'Gemini 3.8 Flash',
      contextWindow: 1048576,
      capabilities: {
        streaming: true,
        tools: true,
        reasoning: false,
        vision: true,
        structuredOutput: true,
      },
    },
    {
      id: 'gemini-2.5-flash',
      provider: providerId,
      displayName: 'Gemini 2.5 Flash',
      contextWindow: 1048576,
      capabilities: {
        streaming: true,
        tools: true,
        reasoning: false,
        vision: true,
        structuredOutput: true,
      },
    },
    {
      id: 'gemini-2.5-pro',
      provider: providerId,
      displayName: 'Gemini 2.5 Pro',
      contextWindow: 1048576,
      capabilities: {
        streaming: true,
        tools: true,
        reasoning: true,
        vision: true,
        structuredOutput: true,
      },
    },
  ];
}
