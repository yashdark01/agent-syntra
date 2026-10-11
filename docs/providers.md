# Syntra Provider Architecture Guide

This document describes how LLM providers are architected, integrated, and extended in Syntra.

---

## 1. The Provider Contract

Every provider adapter implements the `LLMProvider` interface defined in `@syntra/core`:

```typescript
export interface LLMProvider {
  /** Unique lowercase identifier (e.g., 'openai', 'anthropic', 'gemini', 'ollama') */
  readonly id: string;

  /** Human-friendly name displayed in terminal banners and menus */
  readonly displayName: string;

  /** Synchronous / non-streaming completion */
  generate(request: LLMRequest): Promise<LLMResponse>;

  /** Real-time event streaming generator */
  stream(request: LLMRequest): AsyncIterable<LLMStreamEvent>;

  /** Lightweight call to verify credentials */
  validateCredentials(): Promise<boolean>;

  /** Returns metadata and capability flags for models supported by this provider */
  listModels(): Promise<ModelInfo[]>;
}
```

---

## 2. Model Capabilities System

Syntra centralizes model capabilities into `ModelInfo`:

```typescript
export interface ModelInfo {
  id: string;
  provider: string;
  displayName?: string;
  contextWindow?: number;
  capabilities?: {
    streaming?: boolean;
    tools?: boolean;
    reasoning?: boolean;
    vision?: boolean;
    structuredOutput?: boolean;
  };
}
```

This guarantees that future autonomous features (tool execution, vision inspection, reasoning deliberation) can dynamically select optimal models without hardcoding vendor logic.

---

## 3. How to Add a New Provider (e.g. Ollama or Groq)

Adding a new provider does **not** require modifying `@syntra/core` or `@syntra/cli`. Follow these 4 steps:

### Step 1: Create the Adapter Class

Create `packages/providers/src/ollama/ollama-provider.ts`:

```typescript
import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  CancellationError,
} from '@syntra/core';

export class OllamaProvider implements LLMProvider {
  public readonly id = 'ollama';
  public readonly displayName = 'Ollama (Local)';
  private baseURL: string;

  constructor(baseURL = 'http://localhost:11434') {
    this.baseURL = baseURL;
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
      }),
      signal: request.signal,
    });
    const data = await res.json();
    return {
      content: data.message.content,
      model: request.model,
      provider: this.id,
    };
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    yield { type: 'response.started' };

    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: true,
      }),
      signal: request.signal,
    });

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream response');

    const decoder = new TextDecoder();
    let accumulated = '';

    while (true) {
      if (request.signal?.aborted) {
        throw new CancellationError('Stream aborted', { provider: this.id });
      }
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed.message?.content) {
          accumulated += parsed.message.content;
          yield { type: 'content.delta', delta: parsed.message.content };
        }
      }
    }

    yield {
      type: 'response.completed',
      response: {
        content: accumulated,
        model: request.model,
        provider: this.id,
      },
    };
  }

  public async validateCredentials(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseURL}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  public async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'llama3.3',
        provider: this.id,
        displayName: 'Llama 3.3 (70B)',
        contextWindow: 128000,
        capabilities: { streaming: true, tools: true, reasoning: true },
      },
    ];
  }
}
```

### Step 2: Export the Adapter

Export the class from `packages/providers/src/index.ts`:

```typescript
export * from './ollama/ollama-provider.js';
```

### Step 3: Register in the CLI Entrypoint

In `apps/cli/src/index.ts`, register the adapter with the centralized registry:

```typescript
providerRegistry.register(new OllamaProvider());
```

### Step 4: Verify with Contract Tests

Add a contract test in `tests/contract.test.ts`:

```typescript
describeProviderContract('OllamaProvider', () => new OllamaProvider());
```

Your new provider is now immediately available in `syntra`, `/provider`, `syntra models`, and all interactive commands.
