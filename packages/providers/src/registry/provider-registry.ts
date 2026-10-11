import { LLMProvider, InvalidConfigurationError } from '@syntra/core';

export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  /**
   * Registers a provider adapter in the registry.
   */
  public register(provider: LLMProvider): void {
    const key = provider.id.toLowerCase();
    this.providers.set(key, provider);
  }

  /**
   * Retrieves a provider by id. Throws an error if provider is not registered.
   */
  public get(id: string): LLMProvider {
    const key = id.toLowerCase();
    const provider = this.providers.get(key);
    if (!provider) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new InvalidConfigurationError(
        `LLM Provider '${id}' is not registered. Available providers: [${available}]`
      );
    }
    return provider;
  }

  /**
   * Returns a provider by id, or undefined if not found.
   */
  public tryGet(id: string): LLMProvider | undefined {
    return this.providers.get(id.toLowerCase());
  }

  /**
   * Checks whether a provider with the given id is registered.
   */
  public has(id: string): boolean {
    return this.providers.has(id.toLowerCase());
  }

  /**
   * Returns a list of all registered providers.
   */
  public list(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Returns a list of all registered provider IDs.
   */
  public listIds(): string[] {
    return Array.from(this.providers.keys());
  }
}
