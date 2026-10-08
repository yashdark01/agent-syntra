import OpenAI from 'openai';
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

export interface OpenAIProviderOptions {
  apiKey?: string;
  credentialStore?: CredentialStore;
  baseURL?: string;
  organization?: string;
}

export class OpenAIProvider implements LLMProvider {
  public readonly id = 'openai';
  public readonly displayName = 'OpenAI';

  private explicitApiKey?: string;
  private credentialStore?: CredentialStore;
  private baseURL?: string;
  private organization?: string;

  constructor(options: OpenAIProviderOptions = {}) {
    this.explicitApiKey = options.apiKey;
    this.credentialStore = options.credentialStore;
    this.baseURL = options.baseURL;
    this.organization = options.organization;
  }

  private async getApiKey(): Promise<string> {
    if (this.explicitApiKey) {
      return this.explicitApiKey;
    }
    if (this.credentialStore) {
      const storedKey = await this.credentialStore.get(this.id);
      if (storedKey) return storedKey;
    }
    const envKey = process.env.OPENAI_API_KEY;
    if (envKey) return envKey;

    throw new AuthenticationError('OpenAI API key not found. Please run `syntra init` or set OPENAI_API_KEY.', {
      provider: this.id,
    });
  }

  private async getClient(): Promise<OpenAI> {
    const apiKey = await this.getApiKey();
    return new OpenAI({
      apiKey,
      baseURL: this.baseURL,
      organization: this.organization,
    });
  }

  private mapError(error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    if (error instanceof OpenAI.APIError) {
      const status = error.status;
      const message = error.message || 'OpenAI API error';

      if (status === 401) {
        return new AuthenticationError('OpenAI authentication failed. Invalid API key.', {
          provider: this.id,
          cause: error,
        });
      }
      if (status === 429) {
        return new RateLimitError('OpenAI rate limit or quota exceeded.', {
          provider: this.id,
          cause: error,
        });
      }
      if (status === 400 && message.toLowerCase().includes('context_length_exceeded')) {
        return new ContextLengthError('OpenAI context length exceeded.', {
          provider: this.id,
          cause: error,
        });
      }
      if (status && status >= 500) {
        return new ProviderUnavailableError('OpenAI service is temporarily unavailable.', {
          provider: this.id,
          statusCode: status,
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
        return new CancellationError('OpenAI generation cancelled by user.', {
          provider: this.id,
          cause: error,
        });
      }
      return new LLMError(error.message, {
        provider: this.id,
        cause: error,
      });
    }

    return new LLMError('Unknown OpenAI provider failure', {
      provider: this.id,
      cause: error,
    });
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const client = await this.getClient();
      const messages: OpenAI.ChatCompletionMessageParam[] = request.messages.map((m) => {
        if (m.role === 'system') {
          return { role: 'system', content: m.content, name: m.name };
        }
        if (m.role === 'assistant') {
          return { role: 'assistant', content: m.content, name: m.name };
        }
        return { role: 'user', content: m.content, name: m.name };
      });

      const completion = await client.chat.completions.create(
        {
          model: request.model,
          messages,
          temperature: request.temperature,
          max_completion_tokens: request.maxOutputTokens,
        },
        {
          signal: request.signal,
        }
      );

      const choice = completion.choices[0];
      const content = choice?.message?.content ?? '';

      return {
        content,
        model: completion.model || request.model,
        provider: this.id,
        usage: {
          inputTokens: completion.usage?.prompt_tokens,
          outputTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
        },
      };
    } catch (err: unknown) {
      throw this.mapError(err);
    }
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    yield { type: 'response.started' };

    let client: OpenAI;
    try {
      client = await this.getClient();
    } catch (err: unknown) {
      const error = this.mapError(err);
      yield { type: 'response.error', error };
      throw error;
    }

    const messages: OpenAI.ChatCompletionMessageParam[] = request.messages.map((m) => {
      if (m.role === 'system') {
        return { role: 'system', content: m.content, name: m.name };
      }
      if (m.role === 'assistant') {
        return { role: 'assistant', content: m.content, name: m.name };
      }
      return { role: 'user', content: m.content, name: m.name };
    });

    let streamResponse: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    try {
      streamResponse = await client.chat.completions.create(
        {
          model: request.model,
          messages,
          temperature: request.temperature,
          max_completion_tokens: request.maxOutputTokens,
          stream: true,
          stream_options: { include_usage: true },
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
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    try {
      for await (const chunk of streamResponse) {
        if (request.signal?.aborted) {
          throw new CancellationError('Generation cancelled.', { provider: this.id });
        }

        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          accumulatedContent += delta;
          yield {
            type: 'content.delta',
            delta,
          };
        }

        if (chunk.usage) {
          totalPromptTokens = chunk.usage.prompt_tokens ?? totalPromptTokens;
          totalCompletionTokens = chunk.usage.completion_tokens ?? totalCompletionTokens;
        }
      }

      const usage = {
        inputTokens: totalPromptTokens,
        outputTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
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
      // Test listing models with limit 1 to verify credentials
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  public async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'gpt-4o',
        provider: this.id,
        displayName: 'GPT-4o (Omni)',
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
        id: 'gpt-4o-mini',
        provider: this.id,
        displayName: 'GPT-4o Mini',
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
        id: 'o1',
        provider: this.id,
        displayName: 'o1 (Reasoning)',
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
        id: 'o3-mini',
        provider: this.id,
        displayName: 'o3-mini',
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
