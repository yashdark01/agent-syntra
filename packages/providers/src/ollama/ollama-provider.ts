import OpenAI from 'openai';
import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  ProviderUnavailableError,
  ContextLengthError,
  InvalidRequestError,
  CancellationError,
  LLMError,
} from '@syntra/core';

export interface OllamaProviderOptions {
  baseURL?: string;
}

export class OllamaProvider implements LLMProvider {
  public readonly id = 'ollama';
  public readonly displayName = 'Ollama (Local)';

  private baseURL: string;

  constructor(options: OllamaProviderOptions = {}) {
    const rawUrl = options.baseURL ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
    this.baseURL = rawUrl.endsWith('/v1') ? rawUrl : `${rawUrl.replace(/\/+$/, '')}/v1`;
  }

  private getClient(): OpenAI {
    return new OpenAI({
      apiKey: 'ollama',
      baseURL: this.baseURL,
    });
  }

  private mapError(error: unknown): LLMError {
    if (error instanceof LLMError) return error;

    if (error instanceof OpenAI.APIError) {
      const status = error.status;
      const message = error.message || 'Ollama API error';

      if (status === 400 && message.toLowerCase().includes('context')) {
        return new ContextLengthError('Ollama context length exceeded.', {
          provider: this.id,
          cause: error,
        });
      }
      if (status && status >= 500) {
        return new ProviderUnavailableError('Ollama local daemon error.', {
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
        return new CancellationError('Ollama generation cancelled by user.', {
          provider: this.id,
          cause: error,
        });
      }
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        return new ProviderUnavailableError(
          `Cannot connect to local Ollama at ${this.baseURL}. Ensure 'ollama serve' is running.`,
          { provider: this.id, cause: error }
        );
      }
      return new LLMError(error.message, {
        provider: this.id,
        cause: error,
      });
    }

    return new LLMError('Unknown Ollama provider failure', {
      provider: this.id,
      cause: error,
    });
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const client = this.getClient();
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
    const client = this.getClient();

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
      const hostBase = this.baseURL.replace(/\/v1\/?$/, '');
      const res = await fetch(`${hostBase}/api/tags`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async listModels(): Promise<ModelInfo[]> {
    try {
      const hostBase = this.baseURL.replace(/\/v1\/?$/, '');
      const res = await fetch(`${hostBase}/api/tags`, { method: 'GET' });
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        if (data.models && data.models.length > 0) {
          return data.models.map((m) => ({
            id: m.name,
            provider: this.id,
            displayName: m.name,
            contextWindow: 32_768,
            capabilities: {
              streaming: true,
              tools: true,
              reasoning: false,
              vision: false,
              structuredOutput: true,
            },
          }));
        }
      }
    } catch {
      // ignore network error and fall back
    }

    return [
      {
        id: 'qwen3:4b',
        provider: this.id,
        displayName: 'Qwen 3 (4B)',
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
        id: 'gemma:2b',
        provider: this.id,
        displayName: 'Gemma (2B)',
        contextWindow: 8_192,
        capabilities: {
          streaming: true,
          tools: false,
          reasoning: false,
          vision: false,
          structuredOutput: true,
        },
      },
      {
        id: 'qwen2.5:3b',
        provider: this.id,
        displayName: 'Qwen 2.5 (3B)',
        contextWindow: 32_768,
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
