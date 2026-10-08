import { LLMMessage } from './message.js';
import { TokenUsage } from './usage.js';

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  usage?: TokenUsage;
}
