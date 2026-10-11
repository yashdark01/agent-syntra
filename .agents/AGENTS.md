# Syntra Agents Guide

Syntra is designed from the ground up as a local-first autonomous agent platform.

## Agent System Overview

While Phase 1 focuses strictly on foundational CLI, Provider Abstraction, and Streaming infrastructure, the repository structure and domain models are engineered for upcoming agent layers:

- **Syntra Core**: Provider contracts, event streaming primitives, normalized message types.
- **Syntra Provider Layer**: Pluggable vendor adapters (OpenAI, Anthropic, Gemini, Ollama, etc.).
- **Syntra Runtime**: In-flight state machines, session management, and signal coordination.
- **Syntra Tools (Phase 2)**: Local-first tool definitions, filesystem inspection, sandboxed shell execution.
- **Syntra Planner (Phase 3)**: High-level goal decomposition, task graphs, state checkpoints.
- **Syntra Memory (Phase 4-5)**: Context engineering, indexing, session resumption.

## Agent Development Principles

1. **Local-First Security**: Never transmit user secrets, workspace tokens, or unreviewed commands across insecure channels. Redact all tokens at runtime.
2. **Provider Agnosticism**: No agent code should depend on vendor-specific payloads. All agent interaction occurs via `LLMProvider` contracts and `LLMStreamEvent` streams.
3. **Event-Driven Streaming**: Agents publish typed events rather than blocking on monolithic responses.
4. **Deterministic Testing**: All agents and tools must be testable offline with `MockLLMProvider`.
