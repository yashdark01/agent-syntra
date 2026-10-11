# ADR 001: TypeScript and Node.js 22+ Runtime

## Status
Accepted

## Context
Syntra is an open-source, local-first autonomous agent platform. It requires a modern, robust, cross-platform runtime environment with first-class asynchronous streaming capabilities, strong typing, wide ecosystem compatibility, and minimal native compilation friction for users on macOS, Linux, and Windows.

## Decision
We chose **Node.js 22+** with **TypeScript** in native ECMAScript Modules (ESM) mode:
- **Node.js 22+** includes native support for modern primitives including standard `AbortSignal`, native fetch, fast JSON parsing, and stable async iterators.
- **TypeScript 5.8+** with strict mode (`strict: true`, `noUncheckedIndexedAccess: true`) guarantees end-to-end type safety across the domain, reducing runtime bugs.
- **pnpm** is used as the monorepo package manager for fast, deterministic, space-efficient dependency linking.
- **tsup** (backed by esbuild) is used for fast bundle compilation and declaration generation.

## Alternatives Considered
- **Python**: Popular in early AI scripts, but distributes poorly as a native CLI executable to non-technical end users compared to Node packaged CLIs, and lacks native type verification without heavy external tooling.
- **Rust / Go**: Excellent for single binary distribution, but slower iteration speed and narrower access to the fast-moving AI SDK ecosystem (Anthropic, Google Gen AI, and OpenAI maintain first-tier TypeScript SDKs).
- **Bun / Deno**: Promising modern runtimes, but enterprise environments and npm packaging are still overwhelmingly standardized around Node.js.

## Consequences
- Developers must have Node.js 22+ installed.
- Full type safety is maintained across packages (`@syntra/core`, `@syntra/shared`, `@syntra/config`, `@syntra/providers`, `@syntra/cli`).
- Pure ESM imports with `.js` extensions are enforced across the workspace.
