import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '@syntra/providers';
import { LLMStreamEvent, CancellationError } from '@syntra/core';

describe('MockLLMProvider Streaming & Lifecycle', () => {
  it('streams typed events in strictly preserved sequence', async () => {
    const provider = new MockLLMProvider({
      fixedResponse: 'Hello World',
      chunkSize: 3,
      chunkDelayMs: 0,
    });

    const stream = provider.stream({
      model: 'mock-model',
      messages: [{ role: 'user', content: 'test prompt' }],
    });

    const events: LLMStreamEvent[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    // 1. First event must be response.started
    expect(events[0]?.type).toBe('response.started');

    // 2. Middle events are content.delta
    const deltas = events.filter((e) => e.type === 'content.delta');
    expect(deltas.length).toBeGreaterThan(1);
    const fullText = deltas.map((d) => (d as { delta: string }).delta).join('');
    expect(fullText).toBe('Hello World');

    // 3. Followed by usage event
    const usageEvent = events.find((e) => e.type === 'usage');
    expect(usageEvent).toBeDefined();

    // 4. Last event is response.completed
    const lastEvent = events[events.length - 1];
    expect(lastEvent?.type).toBe('response.completed');
    if (lastEvent?.type === 'response.completed') {
      expect(lastEvent.response.content).toBe('Hello World');
      expect(lastEvent.response.model).toBe('mock-model');
    }
  });

  it('handles cancellation cleanly via AbortSignal', async () => {
    const controller = new AbortController();
    const provider = new MockLLMProvider({
      fixedResponse: 'A very long string for cancellation testing',
      chunkSize: 2,
      chunkDelayMs: 20,
    });

    const stream = provider.stream({
      model: 'mock-model',
      messages: [{ role: 'user', content: 'cancel test' }],
      signal: controller.signal,
    });

    const receivedChunks: string[] = [];

    await expect(async () => {
      for await (const event of stream) {
        if (event.type === 'content.delta') {
          receivedChunks.push(event.delta);
          // Cancel stream mid-way
          if (receivedChunks.length === 2) {
            controller.abort();
          }
        }
      }
    }).rejects.toThrowError(CancellationError);
  });
});
