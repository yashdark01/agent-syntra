# ADR 005: Configuration and Secret Storage Strategy

## Status
Accepted

## Context
Agent platforms require user preferences (default provider, default model, streaming behavior) and sensitive credentials (API keys). Storing credentials in plain text or alongside repository files risks accidental git commits or exposure.

## Decision
We implemented a strict separation between user configuration and credentials:
1. **User Configuration**:
   - Stored at `~/.syntra/config.json`.
   - Never contains secrets or API keys.
   - Strictly validated with Zod (`AppConfigSchema`).
   - Supports environment variable overrides (`SYNTRA_DEFAULT_PROVIDER`, `SYNTRA_DEFAULT_MODEL`, `SYNTRA_CONFIG_DIR`).
2. **Credential Storage**:
   - Governed by the `CredentialStore` interface (`get`, `set`, `delete`, `has`).
   - `CompositeCredentialStore` prioritizes process environment variables (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) for standard developer workflows.
   - Falls back to `~/.syntra/credentials.json` with POSIX `0600` permissions and AES-256-GCM encryption with local machine key derivation.
   - Interface is fully prepared for native OS keychain integration (e.g., Apple Keychain, Windows Credential Manager, Linux Secret Service).
3. **Secret Redaction**:
   - All console outputs, error traces, and logs pass through automatic redaction filters masking recognizable keys (`sk-••••`, `AIza••••`).

## Alternatives Considered
- **Saving API keys directly in `.env` or `config.json`**: High risk of accidental repository leaks and security vulnerabilities.
- **Requiring OS keychain binary dependencies in Phase 1**: Native C++ node-gyp bindings often cause installation failures on varied developer machines and CI environments. The interface allows dropping native keychain bindings in without changing consumer code.

## Consequences
- Clean separation of public settings and private credentials.
- Zero secrets committed to git.
- Full compatibility with containerized, CI, and serverless environments via environment variables.
