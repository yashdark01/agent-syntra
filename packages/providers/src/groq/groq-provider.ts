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

export interface GroqProviderOptions {
  apiKey?: string;
  credentialStore?: CredentialStore;
  baseURL?: string;
}

export class GroqProvider implements LLMProvider {
  public readonly id = 'groq';
  public readonly displayName = 'Groq';

  private explicitApiKey?: string;
  private credentialStore?: CredentialStore;
  private baseURL: string;

  constructor(options: GroqProviderOptions = {}) {
    this.explicitApiKey = options.apiKey;
    this.credentialStore = options.credentialStore;
    this.baseURL = options.baseURL ?? 'https://api.groq.com/openai/v1';
  }

  private async getApiKey(): Promise<string> {
    if (this.explicitApiKey) {
      return this.explicitApiKey;
    }
    if (this.credentialStore) {
      const storedKey = await this.credentialStore.get(this.id);
      if (storedKey) return storedKey;
    }
    const envKey = process.env.GROQ_API_KEY;
    if (envKey) return envKey;

    throw new AuthenticationError('Groq API key not found. Please run `syntra init` or set GROQ_API_KEY.', {
      provider: this.id,
    });
  }

  private async getClient(): Promise<OpenAI> {
    const apiKey = await this.getApiKey();
    return new OpenAI({
      apiKey,
      baseURL: this.baseURL,
    });
  }

  private mapError(error: unknown): LLMError {
    if (error instanceof LLMError) return error;

    if (error instanceof OpenAI.APIError) {
      const status = error.status;
      const message = error.message || 'Groq API error';

      if (status === 401) {
        return new AuthenticationError('Groq authentication failed. Invalid API key.', {
          provider: this.id,
          cause: error,
        });
      }
      if (status === 429) {
        return new RateLimitError('Groq rate limit or quota exceeded.', {
          provider: this.id,
          cause: error,
        });
      }
      if (status === 400 && message.toLowerCase().includes('context')) {
        return new ContextLengthError('Groq context length exceeded.', {
          provider: this.id,
          cause: error,
        });
      }
      if (status && status >= 500) {
        return new ProviderUnavailableError('Groq service is temporarily unavailable.', {
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
        return new CancellationError('Groq generation cancelled by user.', {
          provider: this.id,
          cause: error,
        });
      }
      return new LLMError(error.message, {
        provider: this.id,
        cause: error,
      });
    }

    return new LLMError('Unknown Groq provider failure', {
      provider: this.id,
      cause: error,
    });
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const client = await this.getClient();
      const messages: OpenAI.ChatCompletionMessageParam[] = request.messages.map((m) => {
        if (m.role === 'system') return { role: 'system', content: m.content, name: m.name };
        if (m.role === 'assistant') return { role: 'assistant', content: m.content, name: m.name };
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

      const usage = completion.usage
        ? {
            inputTokens: completion.usage.prompt_tokens,
            outputTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined;

      return {
        content,
        model: completion.model,
        provider: this.id,
        usage,
      };
    } catch (err: unknown) {
      throw this.mapError(err);
    }
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const client = await this.getClient();

    yield { type: 'response.started' };

    const messages: OpenAI.ChatCompletionMessageParam[] = request.messages.map((m) => {
      if (m.role === 'system') return { role: 'system', content: m.content, name: m.name };
      if (m.role === 'assistant') return { role: 'assistant', content: m.content, name: m.name };
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
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  public async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'llama-3.3-70b-versatile',
        provider: this.id,
        displayName: 'Llama 3.3 70B Versatile',
        contextWindow: 128_000,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: false,
          vision: false,
          structuredOutput: true,
        },
      },
      {
        id: 'llama-3.1-8b-instant',
        provider: this.id,
        displayName: 'Llama 3.1 8B Instant',
        contextWindow: 128_000,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: false,
          vision: false,
          structuredOutput: true,
        },
      },
      {
        id: 'mixtral-8x7b-32768',
        provider: this.id,
        displayName: 'Mixtral 8x7B',
        contextWindow: 32_768,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: false,
          vision: false,
          structuredOutput: true,
        },
      },
      {
        id: 'gemma2-9b-it',
        provider: this.id,
        displayName: 'Gemma 2 9B IT',
        contextWindow: 8_192,
        capabilities: {
          streaming: true,
          tools: true,
          reasoning: false,
          vision: false,
          structuredOutput: true,
        },
      },
    ];
  }
}
