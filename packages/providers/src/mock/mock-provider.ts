import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  CancellationError,
} from '@syntra/core';

export interface MockProviderOptions {
  id?: string;
  displayName?: string;
  fixedResponse?: string;
  chunkSize?: number;
  chunkDelayMs?: number;
  shouldFailWith?: Error;
  credentialsValid?: boolean;
}

export class MockLLMProvider implements LLMProvider {
  public readonly id: string;
  public readonly displayName: string;
  private fixedResponse: string;
  private chunkSize: number;
  private chunkDelayMs: number;
  private shouldFailWith?: Error;
  private credentialsValid: boolean;

  constructor(options: MockProviderOptions = {}) {
    this.id = options.id ?? 'mock';
    this.displayName = options.displayName ?? 'Mock Provider';
    this.fixedResponse = options.fixedResponse ?? 'Syntra is ready to assist you.';
    this.chunkSize = options.chunkSize ?? 3;
    this.chunkDelayMs = options.chunkDelayMs ?? 10;
    this.shouldFailWith = options.shouldFailWith;
    this.credentialsValid = options.credentialsValid ?? true;
  }

  public setFixedResponse(response: string): void {
    this.fixedResponse = response;
  }

  public setFailWith(error?: Error): void {
    this.shouldFailWith = error;
  }

  public setCredentialsValid(valid: boolean): void {
    this.credentialsValid = valid;
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    if (request.signal?.aborted) {
      throw new CancellationError('Request was aborted', { provider: this.id });
    }

    if (this.shouldFailWith) {
      throw this.shouldFailWith;
    }

    const content = this.fixedResponse;
    const inputTokens = request.messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);
    const outputTokens = Math.ceil(content.length / 4);

    return {
      content,
      model: request.model,
      provider: this.id,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    if (request.signal?.aborted) {
      const err = new CancellationError('Stream was aborted before start', { provider: this.id });
      yield { type: 'response.error', error: err };
      throw err;
    }

    if (this.shouldFailWith) {
      yield {
        type: 'response.error',
        error: this.shouldFailWith as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      };
      throw this.shouldFailWith;
    }

    yield { type: 'response.started' };

    const content = this.fixedResponse;
    let accumulated = '';
    const inputTokens = request.messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);

    for (let i = 0; i < content.length; i += this.chunkSize) {
      if (request.signal?.aborted) {
        const err = new CancellationError('Stream was cancelled during generation', { provider: this.id });
        yield { type: 'response.error', error: err };
        throw err;
      }

      const chunk = content.slice(i, i + this.chunkSize);
      accumulated += chunk;

      yield {
        type: 'content.delta',
        delta: chunk,
      };

      if (this.chunkDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.chunkDelayMs));
      }
    }

    const outputTokens = Math.ceil(accumulated.length / 4);
    const usage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };

    yield {
      type: 'usage',
      usage,
    };

    yield {
      type: 'response.completed',
      response: {
        content: accumulated,
        model: request.model,
        provider: this.id,
        usage,
      },
    };
  }

  public async validateCredentials(): Promise<boolean> {
    return this.credentialsValid;
  }

  public async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'mock-fast',
        provider: this.id,
        displayName: 'Mock Fast Model',
        contextWindow: 128000,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: false,
          vision: true,
          structuredOutput: true,
        },
      },
      {
        id: 'mock-reasoner',
        provider: this.id,
        displayName: 'Mock Reasoning Model',
        contextWindow: 200000,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: true,
          vision: false,
          structuredOutput: true,
        },
      },
    ];
  }
}
