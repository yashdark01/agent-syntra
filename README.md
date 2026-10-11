# agent-syntra
# Syntra

> Local-first autonomous intelligence runtime for your terminal.

Syntra currently provides a provider-independent terminal interface for interacting with multiple LLM providers using real-time streaming.

This is the foundation for the future Syntra autonomous agent runtime.

---

## Features (Phase 1)

- ⚡ **Local-First & Fast**: Built with Node.js 22+, TypeScript, and modern ESM.
- 🔄 **Streaming-First Architecture**: Real-time token streaming using typed `AsyncIterable<LLMStreamEvent>`.
- 🔌 **Provider-Agnostic**: First-class adapters for **OpenAI**, **Anthropic**, and **Google Gemini** (Gemini 3.8 Flash and 2.5 models), with simple extensibility for Ollama, Groq, and local models.
- 🎛️ **Interactive setup**: Arrow-key radios, checkbox provider selection, masked secrets, and a Claude Code-style chat prompt.
- 🛡️ **Secure Credentials**: Credentials stored separately from configuration, supporting environment variables and AES-256-GCM local storage with strict `0600` POSIX permissions and automated secret redaction.
- 💬 **Interactive Terminal REPL**: Full developer chat experience with responsive cancellation (`Ctrl+C`), in-memory conversation history, and slash commands.
- 📊 **Token & Status Monitoring**: Real-time tracking of prompt, completion, and total token usage.
- 🧪 **Offline & Deterministic Testing**: Zero-network test suite leveraging `MockLLMProvider` and contract testing.

---

## Prerequisites

- **Node.js**: `22.0.0` or higher
- **pnpm**: `9.0.0` or higher (`pnpm 11+` recommended)

---

## Installation & Getting Started

```bash
# Clone the repository
git clone https://github.com/agent-syntra/syntra.git
cd agent-syntra

# Install dependencies across all workspace packages
pnpm install

# Build all packages
pnpm build
```

---

## First-Run Onboarding

Run the onboarding wizard to configure your preferred LLM provider:

```bash
# Via global link or workspace script
pnpm syntra init
```

You will be prompted to:
1. Select an AI Provider (`OpenAI`, `Anthropic`, or `Gemini`).
2. Enter your API Key (masked with `••••••••`, never echoed to stdout or logs).
3. Validate credentials against provider test endpoints.
4. Select your default model.

---

## Interactive Chat

Start an interactive chat session:

```bash
pnpm syntra
```

Example interaction:

```text
   SYNTRA

Autonomous Intelligence Runtime

Provider: OpenAI
Model:    gpt-4o
Workspace: /Users/user/project

Type /help for commands.

❯ Explain dependency injection.

◆ Syntra

Dependency injection is a software engineering technique in which an object
receives other objects that it depends on, rather than creating them itself...
```

You can cancel an in-flight response at any time by pressing **`Ctrl+C`**. Syntra will abort the HTTP stream and return to the prompt without crashing your session.

---

## CLI Commands

| Command | Description |
| :--- | :--- |
| `syntra` | Starts interactive chat session (runs onboarding if unconfigured) |
| `syntra init` | Runs the interactive provider and credentials setup wizard |
| `syntra chat` | Starts chat session (supports `--provider` and `--model` flags) |
| `syntra config` | Inspects, gets, or updates configuration settings |
| `syntra providers` | Lists registered providers, model capabilities, and credential status |
| `syntra models` | Lists available models and capability flags (streaming, tools, vision, reasoning) |
| `syntra --version` | Prints installed Syntra version |
| `syntra --help` | Displays available CLI commands |
| `syntra --debug` | Enables diagnostic logs and stack traces with secret redaction |

---

## Interactive Slash Commands

Inside the interactive chat REPL, the following slash commands are available:

- `/help` — Show the command reference guide.
- `/clear` — Clear the current in-memory conversation history.
- `/provider` — View and dynamically switch between registered LLM providers.
- `/model` — View and select from available models for the active provider.
- `/config` — Display active configuration parameters.
- `/status` — View active session info and token usage statistics:
  ```text
  Syntra Status

  Provider: OpenAI
  Model:    gpt-4o
  Workspace: /Users/user/project
  Messages: 4

  Tokens
  Input:  1,420
  Output: 382
  Total:  1,802
  ```
- `/exit` — Cleanly terminate the session.

---

## Environment Variables

Syntra supports standard provider environment variables:

| Variable | Description |
| :--- | :--- |
| `OPENAI_API_KEY` | OpenAI API authentication key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API authentication key |
| `GEMINI_API_KEY` | Google Gemini API authentication key |
| `SYNTRA_DEFAULT_PROVIDER` | Override default provider (`openai`, `anthropic`, `gemini`) |
| `SYNTRA_DEFAULT_MODEL` | Override default model identifier |
| `SYNTRA_CONFIG_DIR` | Custom directory for configuration (default: `~/.syntra`) |
| `SYNTRA_DEBUG` | Set to `true` or `1` for verbose diagnostics |

---

## Monorepo Architecture

```text
syntra/
│
├── apps/
│   └── cli/                # Syntra CLI executable & Terminal REPL (@syntra/cli)
│
├── packages/
│   ├── core/               # Canonical domain types, errors & interfaces (@syntra/core)
│   ├── providers/          # OpenAI, Anthropic, Gemini & Mock adapters (@syntra/providers)
│   ├── config/             # Zod config schema & CredentialStore (@syntra/config)
│   └── shared/             # Logger, redaction & retry utilities (@syntra/shared)
│
├── docs/                   # Architecture, Provider guides & ADRs
│   ├── architecture.md
│   ├── providers.md
│   ├── phase-1.md
│   └── adr/
│
├── tests/                  # Monorepo unit, streaming & contract tests
├── .agents/                # Agent architecture definitions & skill specifications
└── package.json            # pnpm monorepo root
```

---

## Development & Testing

```bash
# Install dependencies
pnpm install

# Run all test suites
pnpm test

# Run typecheck across all packages
pnpm typecheck

# Run linter
pnpm lint

# Build all packages
pnpm build
```

---

## Roadmap

- [x] **Phase 1: Foundation** — CLI + TypeScript + LLM Provider APIs + Streaming
- [ ] **Phase 2: Local Tools & Agent Runtime** — Filesystem tools, sandboxed shell execution, single-agent loops, permission models
- [ ] **Phase 3: Autonomous Planner** — Goal decomposition, Task DAG, agent state machines, verification checkpoints
- [ ] **Phase 4: Code Intelligence & Indexing** — Tree-sitter AST, hybrid repository retrieval, context compaction
- [ ] **Phase 5: Multi-Agent Orchestration & Memory** — Specialized sub-agents, Model Context Protocol (MCP), cross-session persistence

---

## License

Apache-2.0