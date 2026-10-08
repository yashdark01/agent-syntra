import { describe, it, expect, vi } from 'vitest';
import { SlashCommandHandler, SlashContext } from '../apps/cli/src/chat/slash-commands.js';
import { ProviderRegistry, MockLLMProvider } from '@syntra/providers';
import { ConfigManager } from '@syntra/config';
import { TerminalRenderer } from '../apps/cli/src/ui/terminal-renderer.js';
import { TerminalInput } from '../apps/cli/src/ui/terminal-input.js';

describe('SlashCommandHandler', () => {
  it('handles /clear by clearing conversation history', async () => {
    const registry = new ProviderRegistry();
    const configManager = new ConfigManager();
    const renderer = new TerminalRenderer();
    const input = new TerminalInput();

    const handler = new SlashCommandHandler(registry, configManager, renderer, input);

    let messages = [{ role: 'user' as const, content: 'hello' }];
    const context: SlashContext = {
      activeProviderId: 'mock',
      activeModelId: 'mock-fast',
      workspaceDir: '/test',
      messages,
      totalUsage: {},
      setActiveProvider: vi.fn(),
      setActiveModel: vi.fn(),
      clearMessages: () => {
        messages = [];
      },
    };

    const result = await handler.handle('/clear', context);
    expect(result.handled).toBe(true);
    expect(result.shouldExit).toBe(false);
    expect(messages).toHaveLength(0);
  });

  it('handles /exit with shouldExit true', async () => {
    const registry = new ProviderRegistry();
    const configManager = new ConfigManager();
    const renderer = new TerminalRenderer();
    const input = new TerminalInput();

    const handler = new SlashCommandHandler(registry, configManager, renderer, input);
    const context: SlashContext = {
      activeProviderId: 'mock',
      activeModelId: 'mock-fast',
      workspaceDir: '/test',
      messages: [],
      totalUsage: {},
      setActiveProvider: vi.fn(),
      setActiveModel: vi.fn(),
      clearMessages: vi.fn(),
    };

    const result = await handler.handle('/exit', context);
    expect(result.handled).toBe(true);
    expect(result.shouldExit).toBe(true);
  });

  it('handles switching model via /model <id>', async () => {
    const registry = new ProviderRegistry();
    const mock = new MockLLMProvider({ id: 'mock' });
    registry.register(mock);

    const configManager = new ConfigManager();
    const renderer = new TerminalRenderer();
    const input = new TerminalInput();

    const handler = new SlashCommandHandler(registry, configManager, renderer, input);
    let currentModel = 'mock-fast';

    const context: SlashContext = {
      activeProviderId: 'mock',
      activeModelId: currentModel,
      workspaceDir: '/test',
      messages: [],
      totalUsage: {},
      setActiveProvider: vi.fn(),
      setActiveModel: (m) => {
        currentModel = m;
      },
      clearMessages: vi.fn(),
    };

    const result = await handler.handle('/model mock-reasoner', context);
    expect(result.handled).toBe(true);
    expect(currentModel).toBe('mock-reasoner');
  });

  it('ignores non-slash commands', async () => {
    const registry = new ProviderRegistry();
    const configManager = new ConfigManager();
    const renderer = new TerminalRenderer();
    const input = new TerminalInput();

    const handler = new SlashCommandHandler(registry, configManager, renderer, input);
    const context: SlashContext = {
      activeProviderId: 'mock',
      activeModelId: 'mock-fast',
      workspaceDir: '/test',
      messages: [],
      totalUsage: {},
      setActiveProvider: vi.fn(),
      setActiveModel: vi.fn(),
      clearMessages: vi.fn(),
    };

    const result = await handler.handle('Hello, how are you?', context);
    expect(result.handled).toBe(false);
    expect(result.shouldExit).toBe(false);
  });
});
