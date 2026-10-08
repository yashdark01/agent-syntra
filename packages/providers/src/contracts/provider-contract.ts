import { describe, it, expect } from 'vitest';
import { LLMProvider, LLMStreamEvent } from '@syntra/core';

/**
 * Shared test suite verifying that an LLMProvider implementation adheres
 * strictly to the Syntra provider contract.
 */
export function describeProviderContract(
  providerName: string,
  createProvider: () => LLMProvider
) {
  describe(`LLMProvider Contract: ${providerName}`, () => {
    it('has valid identification and display name', () => {
      const provider = createProvider();
      expect(typeof provider.id).toBe('string');
      expect(provider.id.length).toBeGreaterThan(0);
      expect(typeof provider.displayName).toBe('string');
      expect(provider.displayName.length).toBeGreaterThan(0);
    });

    it('lists models with standardized capabilities and context windows', async () => {
      const provider = createProvider();
      const models = await provider.listModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      for (const model of models) {
        expect(typeof model.id).toBe('string');
        expect(model.provider).toBe(provider.id);
        if (model.contextWindow !== undefined) {
          expect(typeof model.contextWindow).toBe('number');
          expect(model.contextWindow).toBeGreaterThan(0);
        }
        if (model.capabilities) {
          if (model.capabilities.streaming !== undefined) {
            expect(typeof model.capabilities.streaming).toBe('boolean');
          }
        }
      }
    });

    it('executes generate returning valid LLMResponse', async () => {
      const provider = createProvider();
      const models = await provider.listModels();
      const firstModel = models[0]!;

      const response = await provider.generate({
        model: firstModel.id,
        messages: [{ role: 'user', content: 'Say hello' }],
      });

      expect(typeof response.content).toBe('string');
      expect(response.provider).toBe(provider.id);
      expect(response.model).toBeDefined();
      if (response.usage) {
        expect(typeof response.usage.inputTokens).toBe('number');
        expect(typeof response.usage.outputTokens).toBe('number');
      }
    });

    it('streams events in expected sequence and emits completed response', async () => {
      const provider = createProvider();
      const models = await provider.listModels();
      const firstModel = models[0]!;

      const stream = provider.stream({
        model: firstModel.id,
        messages: [{ role: 'user', content: 'Stream test' }],
      });

      const events: LLMStreamEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0]?.type).toBe('response.started');

      const completed = events.find((e) => e.type === 'response.completed');
      expect(completed).toBeDefined();
      if (completed && completed.type === 'response.completed') {
        expect(completed.response.provider).toBe(provider.id);
        expect(typeof completed.response.content).toBe('string');
      }
    });

    it('validates credentials returns a boolean', async () => {
      const provider = createProvider();
      const isValid = await provider.validateCredentials();
      expect(typeof isValid).toBe('boolean');
    });
  });
}
