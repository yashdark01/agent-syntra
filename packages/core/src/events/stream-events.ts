import { LLMResponse } from '../types/request.js';
import { TokenUsage } from '../types/usage.js';
import { LLMError } from '../errors/domain-errors.js';

export type LLMStreamEvent =
  | {
      type: 'response.started';
    }
  | {
      type: 'content.delta';
      delta: string;
    }
  | {
      type: 'usage';
      usage: TokenUsage;
    }
  | {
      type: 'response.completed';
      response: LLMResponse;
    }
  | {
      type: 'response.error';
      error: LLMError;
    };
