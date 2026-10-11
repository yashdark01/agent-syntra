# ADR 004: Decoupling Presentation (Renderer) from Core Domain

## Status
Accepted

## Context
In terminal utilities, it is common to accidentally scatter `console.log` statements directly inside provider adapters or service routines. This prevents reuse of the provider logic in different frontends, complicates headless testing, and makes building future TUI, desktop, or web interfaces impossible without rewriting core modules.

## Decision
We enforce a strict separation between domain logic and presentation:
```text
Provider Adapter
      ↓
Stream Events (LLMStreamEvent)
      ↓
Application Service (ChatSession)
      ↓
Terminal Renderer (TerminalRenderer)
      ↓
stdout / Terminal
```
- Providers and core classes **never** output directly to `console.log` or `process.stdout`.
- All output is handled by a dedicated `TerminalRenderer` class.
- Colors and formatting are encapsulated using `picocolors`.

## Alternatives Considered
- **Direct stdout writes inside provider callbacks**: Simpler to write initially, but completely ties provider logic to terminal output and breaks non-interactive usage or headless testing.

## Consequences
- Testing providers produces no dirty terminal side-effects.
- Different renderers (e.g., Ink TUI, JSON streamer, WebSockets, or GUI frontends) can be plugged in without changing provider adapters or chat domain services.
