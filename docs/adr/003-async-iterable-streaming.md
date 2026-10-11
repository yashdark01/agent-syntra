# ADR 003: AsyncIterable-First Event Streaming

## Status
Accepted

## Context
Interactive agent developer experience demands low latency token rendering. Waiting for full completions degrades user responsiveness. Furthermore, future phases will introduce tool calls, sub-agent spawning, and approval events that must be interleaved with token generation.

## Decision
We adopted **`AsyncIterable<LLMStreamEvent>`** using standard TypeScript `async function*` generators:
- Streaming returns an `AsyncIterable` yielding strongly typed event objects (`response.started`, `content.delta`, `usage`, `response.completed`, `response.error`).
- Rather than streaming raw strings, events carry metadata and error payloads.
- Cancellation is coordinated through standard web `AbortSignal` instances passed down to HTTP transports and checked in event loops.

## Alternatives Considered
- **EventEmitter**: Classic Node.js pattern, but lacks backpressure, introduces unhandled error edge cases, and provides weaker compile-time type safety compared to async generators.
- **RxJS Observables**: Powerful for complex reactive event streams, but introduces an external dependency and steep learning curve without providing clear advantages over native `for await (...)` loops.
- **Plain String Generators**: Streaming only raw tokens prevents passing token counts, model identifiers, or structured errors through the same channel.

## Consequences
- Clean consumption using standard `for await (const event of stream)` loops.
- Clean cancellation via `AbortController.abort()`.
- Future agent events (`tool.started`, `task.completed`, etc.) can be added directly to the event union without changing loop mechanics.
