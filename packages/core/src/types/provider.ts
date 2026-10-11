import { LLMRequest, LLMResponse } from './request.js';
import { ModelInfo } from './model.js';
import { LLMStreamEvent } from '../events/stream-events.js';

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | (string & {});

export interface LLMProvider {
  /**
   * Unique machine identifier of the provider (e.g. 'openai', 'anthropic', 'gemini').
   */
  readonly id: string;

  /**
   * Human-friendly display name (e.g. 'OpenAI', 'Anthropic Claude', 'Google Gemini').
   */
  readonly displayName: string;

  /**
   * Generates a non-streaming completion for the given request.
   */
  generate(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Streams completion events incrementally as an async iterable.
   */
  stream(request: LLMRequest): AsyncIterable<LLMStreamEvent>;

  /**
   * Validates whether configured credentials for this provider are functional.
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Returns metadata and capability information for models supported by this provider.
   */
  listModels(): Promise<ModelInfo[]>;
}
