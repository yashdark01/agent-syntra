import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry, MockLLMProvider } from '@syntra/providers';
import { InvalidConfigurationError } from '@syntra/core';

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('registers and retrieves providers case-insensitively', () => {
    const mock = new MockLLMProvider({ id: 'custom-provider', displayName: 'Custom Provider' });
    registry.register(mock);

    expect(registry.has('custom-provider')).toBe(true);
    expect(registry.has('CUSTOM-PROVIDER')).toBe(true);

    const retrieved = registry.get('Custom-Provider');
    expect(retrieved.id).toBe('custom-provider');
    expect(retrieved.displayName).toBe('Custom Provider');
  });

  it('throws an informative InvalidConfigurationError for unregistered provider', () => {
    expect(() => registry.get('nonexistent')).toThrowError(InvalidConfigurationError);
  });

  it('lists all registered providers and provider IDs', () => {
    const p1 = new MockLLMProvider({ id: 'p1' });
    const p2 = new MockLLMProvider({ id: 'p2' });

    registry.register(p1);
    registry.register(p2);

    expect(registry.list()).toHaveLength(2);
    expect(registry.listIds()).toEqual(['p1', 'p2']);
  });
});
