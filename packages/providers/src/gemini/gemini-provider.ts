import { GoogleGenAI } from '@google/genai';
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
import { flattenNestedErrorMessage } from '@syntra/shared';
import {
  GEMINI_DEFAULT_MODEL,
  listGeminiCatalog,
  resolveGeminiModelId,
} from './gemini-models.js';

export { GEMINI_DEFAULT_MODEL, resolveGeminiModelId, GEMINI_MODEL_ALIASES } from './gemini-models.js';

export interface GeminiProviderOptions {
  apiKey?: string;
  credentialStore?: CredentialStore;
}

export class GeminiProvider implements LLMProvider {
  public readonly id = 'gemini';
  public readonly displayName = 'Google Gemini';

  private explicitApiKey?: string;
  private credentialStore?: CredentialStore;

  constructor(options: GeminiProviderOptions = {}) {
    this.explicitApiKey = options.apiKey;
    this.credentialStore = options.credentialStore;
  }

  private async getApiKey(): Promise<string> {
    if (this.explicitApiKey) {
      return this.explicitApiKey;
    }
    if (this.credentialStore) {
      const storedKey = await this.credentialStore.get(this.id);
      if (storedKey) return storedKey;
    }
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey) return envKey;

    throw new AuthenticationError(
      'Gemini API key not found. Please run `syntra init` or set GEMINI_API_KEY.',
      { provider: this.id }
    );
  }

  private async getClient(): Promise<GoogleGenAI> {
    const apiKey = await this.getApiKey();
    return new GoogleGenAI({ apiKey });
  }

  private mapError(error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = flattenNestedErrorMessage(rawMessage);
    const lower = message.toLowerCase();

    if (error instanceof Error && (error.name === 'AbortError' || lower.includes('abort'))) {
      return new CancellationError('Gemini generation cancelled by user.', {
        provider: this.id,
        cause: error,
      });
    }

    if (
      lower.includes('api_key') ||
      lower.includes('unauthenticated') ||
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('permission_denied')
    ) {
      return new AuthenticationError('Gemini authentication failed. Invalid or expired API key.', {
        provider: this.id,
        cause: error,
      });
    }

    if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('429')) {
      return new RateLimitError('Gemini quota or rate limit exceeded.', {
        provider: this.id,
        cause: error,
      });
    }

    if (lower.includes('context_length') || lower.includes('token count exceeds') || lower.includes('token_limit')) {
      return new ContextLengthError('Gemini context length limit exceeded.', {
        provider: this.id,
        cause: error,
      });
    }

    if (lower.includes('unavailable') || lower.includes('503') || lower.includes('500') || lower.includes('internal')) {
      return new ProviderUnavailableError('Gemini service is temporarily unavailable.', {
        provider: this.id,
        cause: error,
      });
    }

    if (lower.includes('404') || lower.includes('not found') || lower.includes('no longer available')) {
      return new InvalidRequestError(
        `${message} Switch models with /model.`,
        { provider: this.id, statusCode: 404, cause: error }
      );
    }

    return new InvalidRequestError(message, {
      provider: this.id,
      cause: error,
    });
  }

  private formatContents(request: LLMRequest): {
    systemInstruction?: string;
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  } {
    const systemParts: string[] = [];
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        contents.push({
          role,
          parts: [{ text: msg.content }],
        });
      }
    }

    return {
      systemInstruction: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Hello' }] }],
    };
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const client = await this.getClient();
      const { systemInstruction, contents } = this.formatContents(request);
      const model = resolveGeminiModelId(request.model);

      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          abortSignal: request.signal,
        },
      });

      const text = response.text ?? '';
      const usage = response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount,
            outputTokens: response.usageMetadata.candidatesTokenCount,
            totalTokens: response.usageMetadata.totalTokenCount,
          }
        : undefined;

      return {
        content: text,
        model,
        provider: this.id,
        usage,
      };
    } catch (err: unknown) {
      throw this.mapError(err);
    }
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    yield { type: 'response.started' };

    let client: GoogleGenAI;
    try {
      client = await this.getClient();
    } catch (err: unknown) {
      const error = this.mapError(err);
      yield { type: 'response.error', error };
      throw error;
    }

    const { systemInstruction, contents } = this.formatContents(request);
    const model = resolveGeminiModelId(request.model);

    let streamResponse: AsyncGenerator<{ text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }>;
    try {
      streamResponse = await client.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          abortSignal: request.signal,
        },
      });
    } catch (err: unknown) {
      const error = this.mapError(err);
      yield { type: 'response.error', error };
      throw error;
    }

    let accumulatedContent = '';
    let lastUsage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;

    try {
      for await (const chunk of streamResponse) {
        if (request.signal?.aborted) {
          throw new CancellationError('Gemini generation cancelled.', { provider: this.id });
        }

        const delta = chunk.text;
        if (delta) {
          accumulatedContent += delta;
          yield {
            type: 'content.delta',
            delta,
          };
        }

        if (chunk.usageMetadata) {
          lastUsage = chunk.usageMetadata;
        }
      }

      const usage = lastUsage
        ? {
            inputTokens: lastUsage.promptTokenCount,
            outputTokens: lastUsage.candidatesTokenCount,
            totalTokens: lastUsage.totalTokenCount,
          }
        : undefined;

      if (usage) {
        yield {
          type: 'usage',
          usage,
        };
      }

      yield {
        type: 'response.completed',
        response: {
          content: accumulatedContent,
          model,
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
      await client.models.list({ config: { pageSize: 1 } });
      return true;
    } catch {
      try {
        const client = await this.getClient();
        await client.models.generateContent({
          model: GEMINI_DEFAULT_MODEL,
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          config: {
            maxOutputTokens: 1,
          },
        });
        return true;
      } catch {
        return false;
      }
    }
  }

  public async listModels(): Promise<ModelInfo[]> {
    return listGeminiCatalog(this.id);
  }
}
