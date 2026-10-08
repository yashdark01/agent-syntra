# Syntra Phase 1: Foundation Milestone

## Overview

Phase 1 establishes the production-grade foundation for **Syntra**, a local-first autonomous agent platform.

Phase 1 Scope:
> **CLI + TypeScript + LLM Provider APIs + Streaming**

---

## 1. Implemented Features

### CLI & Interactive Experience
- **Primary Executable**: `syntra`
- **Commands**:
  - `syntra`: Starts the interactive session (or launches onboarding on first run).
  - `syntra init`: First-run onboarding wizard for provider and credential configuration.
  - `syntra chat`: Interactive session with optional `-p / --provider` and `-m / --model` overrides.
  - `syntra config`: Subcommands to inspect (`list`), query (`get`), and update (`set`) user configuration.
  - `syntra providers`: Lists registered providers, availability status, model summaries, and credential locations.
  - `syntra models`: Lists model identifiers, context windows, and capability matrices.
  - `syntra --version` & `syntra --help`: Standard CLI metadata.
  - `syntra --debug`: Verbose diagnostic logging with secret redaction.

### Interactive Slash Commands
- `/help`: Displays available slash commands.
- `/clear`: Clears current session in-memory conversation history.
- `/provider`: Displays or switches active LLM provider.
- `/model`: Displays or switches active model for the current provider.
- `/config`: Prints active configuration parameters.
- `/status`: Displays provider, model, workspace path, message count, and accumulated token usage.
- `/exit`: Cleanly terminates the interactive session.

### Streaming-First Architecture
- Built on native `AsyncIterable<LLMStreamEvent>`.
- Yields strongly typed events: `response.started`, `content.delta`, `usage`, `response.completed`, `response.error`.
- Zero raw string streaming internally; cleanly decoupled from console output via `TerminalRenderer`.
- Full `AbortController` cancellation support via `Ctrl+C` without crashing the REPL session.

### Multi-Provider Support
- **OpenAI**: Supports GPT-4o, o1, o3-mini, and custom endpoints with token usage tracking.
- **Anthropic**: Supports Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus with system prompt extraction and usage tracking.
- **Google Gemini**: Supports Gemini 3.8 Flash, Gemini 2.5 Flash, and Gemini 2.5 Pro. Retired 1.5/2.0 IDs are aliased automatically.
- **Mock LLM Provider**: Deterministic streaming, delay simulation, and offline contract verification.

### Security Baseline
- `CredentialStore` interface separating credentials from non-sensitive configuration.
- Supports environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) and local AES-256-GCM encrypted storage at `~/.syntra/credentials.json` with `0600` permissions.
- Masked secret entry during interactive onboarding (`••••••••`).
- Automatic secret redaction across all logs, error messages, and debug output.

---

## 2. Intentional Boundaries (Phase 1 Limitations)

To maintain focus on rock-solid fundamentals, Phase 1 deliberately does **NOT** include:
- Multi-agent orchestration, manager agents, or sub-agents
- Autonomous coding tools, filesystem modification tools, or shell command execution
- Model Context Protocol (MCP) servers or clients
- Retrieval Augmented Generation (RAG), embeddings, or vector databases
- Tree-sitter code indexing or workspace knowledge graphs
- Browser automation
- Persistent session memory / checkpointing to disk

---

## 3. Phase 2 Readiness

The Phase 1 architecture has been designed specifically so that Phase 2 capabilities can be plugged in seamlessly:

1. **Tool System**:
   - `LLMMessage` already supports role `'tool'`.
   - `ModelInfo.capabilities.tools` already tracks tool calling capability.
   - Adding a `ToolRegistry` and `Tool` contract in `@syntra/tools` will feed into `LLMRequest` without modifying CLI entrypoints.
2. **Single Agent Runtime**:
   - `ChatSession`'s event loop will cleanly transition into an `AgentRuntime` that executes iterative tool calling loops.
3. **Permissions Architecture**:
   - The CLI renderer and terminal input abstraction (`TerminalInput.select`) provide the foundation for interactive approval prompts before running filesystem or shell operations.
