# ADR 002: Provider Adapter and Registry Pattern

## Status
Accepted

## Context
Syntra must support multiple disparate LLM providers (OpenAI, Anthropic, Google Gemini) in Phase 1, and be prepared to add open-weights and local endpoints (Ollama, Groq, Mistral, OpenRouter, vLLM) in subsequent phases. Coupling the CLI application directly to vendor SDKs would result in vendor lock-in, leaky abstractions, and fragile codebase refactoring.

## Decision
We implemented a strict **Hexagonal / Adapter Architecture** and **Provider Registry**:
1. `@syntra/core` defines a canonical `LLMProvider` interface and vendor-neutral domain types (`LLMMessage`, `LLMRequest`, `LLMResponse`, `ModelInfo`, `LLMStreamEvent`).
2. `@syntra/providers` implements concrete adapters: `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider`, and `MockLLMProvider`.
3. A centralized `ProviderRegistry` allows registering, enumerating, and querying providers by identifier.
4. The application and CLI layers only interact with `LLMProvider` contracts, never touching vendor SDK classes or objects.

## Alternatives Considered
- **Direct vendor SDK calls in CLI commands**: Extremely fast to scaffold, but results in tight coupling, inconsistent error handling, and unmaintainable branching logic (`if (provider === 'openai') ... else if (provider === 'anthropic') ...`).
- **Third-party monolithic LLM wrappers (e.g. LangChain, LlamaIndex)**: Heavyweight abstractions that introduce excessive layers of indirection, break streaming consistency, and hinder low-level token and cancellation control.

## Consequences
- Adding new providers requires implementing a single adapter class implementing `LLMProvider` and registering it in the registry.
- Zero vendor SDK leaks into `@syntra/core` or `@syntra/cli`.
- Error mapping is normalized into standard Syntra domain exceptions (`AuthenticationError`, `RateLimitError`, etc.).
