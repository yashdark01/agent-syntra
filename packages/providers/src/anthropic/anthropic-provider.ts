import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  AuthenticationError,
  RateLimitError,
  ProviderUnavailableError,
  ContextLengthError,
  InvalidRequestError,
  CancellationError,
  LLMError,
} from '@syntra/core';
import { CredentialStore } from '@syntra/config';

export interface AnthropicProviderOptions {
  apiKey?: string;
  credentialStore?: CredentialStore;
  baseURL?: string;
}

export class AnthropicProvider implements LLMProvider {
  public readonly id = 'anthropic';
  public readonly displayName = 'Anthropic';

  private explicitApiKey?: string;
  private credentialStore?: CredentialStore;
  private baseURL?: string;

  constructor(options: AnthropicProviderOptions = {}) {
    this.explicitApiKey = options.apiKey;
    this.credentialStore = options.credentialStore;
    this.baseURL = options.baseURL;
  }

  private async getApiKey(): Promise<string> {
    if (this.explicitApiKey) {
      return this.explicitApiKey;
    }
    if (this.credentialStore) {
      const storedKey = await this.credentialStore.get(this.id);
      if (storedKey) return storedKey;
    }
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) return envKey;

    throw new AuthenticationError(
      'Anthropic API key not found. Please run `syntra init` or set ANTHROPIC_API_KEY.',
      { provider: this.id }
    );
  }

  private async getClient(): Promise<Anthropic> {
    const apiKey = await this.getApiKey();
    return new Anthropic({
      apiKey,
      baseURL: this.baseURL,
    });
  }

  private mapError(error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      const message = error.message || 'Anthropic API error';

      if (status === 401) {
        return new AuthenticationError('Anthropic authentication failed. Invalid API key.', {
          provider: this.id,
          cause: error,
        });
      }
      if (status === 429) {
        return new RateLimitError('Anthropic rate limit exceeded.', {
          provider: this.id,
          cause: error,
        });
      }
      if (status === 529 || (status && status >= 500)) {
        return new ProviderUnavailableError(
          'Anthropic servers are currently overloaded or unavailable.',
          {
            provider: this.id,
            statusCode: status,
            cause: error,
          }
        );
      }
      if (status === 400 && message.toLowerCase().includes('max_tokens')) {
        return new ContextLengthError('Anthropic context length or token limit exceeded.', {
          provider: this.id,
          cause: error,
        });
      }
      return new InvalidRequestError(message, {
        provider: this.id,
        statusCode: status,
        cause: error,
      });
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.toLowerCase().includes('abort')) {
        return new CancellationError('Anthropic generation cancelled by user.', {
          provider: this.id,
          cause: error,
        });
      }
      return new LLMError(error.message, {
        provider: this.id,
        cause: error,
      });
    }

    return new LLMError('Unknown Anthropic provider failure', {
      provider: this.id,
      cause: error,
    });
  }

  private prepareMessages(request: LLMRequest): {
    system?: string;
    messages: Anthropic.MessageParam[];
  } {
    const systemParts: string[] = [];
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      } else {
        messages.push({ role: 'user', content: msg.content });
      }
    }

    return {
      system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      messages: messages.length > 0 ? messages : [{ role: 'user', content: 'Hello' }],
    };
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const client = await this.getClient();
      const { system, messages } = this.prepareMessages(request);

      const response = await client.messages.create(
        {
          model: request.model,
          messages,
          ...(system ? { system } : {}),
          max_tokens: request.maxOutputTokens ?? 4096,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        },
        {
          signal: request.signal,
        }
      );

      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        }
      }

      return {
        content: text,
        model: response.model,
        provider: this.id,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (err: unknown) {
      throw this.mapError(err);
    }
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    yield { type: 'response.started' };

    let client: Anthropic;
    try {
      client = await this.getClient();
    } catch (err: unknown) {
      const error = this.mapError(err);
      yield { type: 'response.error', error };
      throw error;
    }

    const { system, messages } = this.prepareMessages(request);

    let streamResponse: AsyncIterable<Anthropic.MessageStreamEvent>;
    try {
      streamResponse = await client.messages.create(
        {
          model: request.model,
          messages,
          ...(system ? { system } : {}),
          max_tokens: request.maxOutputTokens ?? 4096,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          stream: true,
        },
        {
          signal: request.signal,
        }
      );
    } catch (err: unknown) {
      const error = this.mapError(err);
      yield { type: 'response.error', error };
      throw error;
    }

    let accumulatedContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of streamResponse) {
        if (request.signal?.aborted) {
          throw new CancellationError('Anthropic generation cancelled.', { provider: this.id });
        }

        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens ?? 0;
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const delta = event.delta.text;
            accumulatedContent += delta;
            yield {
              type: 'content.delta',
              delta,
            };
          }
        } else if (event.type === 'message_delta') {
          if (event.usage) {
            outputTokens = event.usage.output_tokens ?? 0;
          }
        }
      }

      const usage = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      };

      if (usage.totalTokens > 0) {
        yield {
          type: 'usage',
          usage,
        };
      }

      yield {
        type: 'response.completed',
        response: {
          content: accumulatedContent,
          model: request.model,
          provider: this.id,
          usage,
        },
      };
    } catch (err: unknown) {
      const error = this.mapError(err);
      yield { type: 'response.error', error };
      throw error;
    }
  }

  public async validateCredentials(): Promise<boolean> {
    try {
      const client = await this.getClient();
      // Test sending a 1 token message to validate
      await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  public async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'claude-3-7-sonnet-20250219',
        provider: this.id,
        displayName: 'Claude 3.7 Sonnet (Hybrid Reasoning)',
        contextWindow: 200000,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: true,
          vision: true,
          structuredOutput: true,
        },
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        provider: this.id,
        displayName: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: false,
          vision: true,
          structuredOutput: true,
        },
      },
      {
        id: 'claude-3-5-haiku-20241022',
        provider: this.id,
        displayName: 'Claude 3.5 Haiku',
        contextWindow: 200000,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: false,
          vision: true,
          structuredOutput: true,
        },
      },
      {
        id: 'claude-3-opus-20240229',
        provider: this.id,
        displayName: 'Claude 3 Opus',
        contextWindow: 200000,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: false,
          vision: true,
          structuredOutput: true,
        },
      },
    ];
  }
}
