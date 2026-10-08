import { Command } from 'commander';
import dotenv from 'dotenv';
import { ConfigManager, CompositeCredentialStore } from '@syntra/config';
import {
  ProviderRegistry,
  OpenAIProvider,
  AnthropicProvider,
  GeminiProvider,
  MockLLMProvider,
} from '@syntra/providers';
import { defaultLogger } from '@syntra/shared';
import { TerminalRenderer } from './ui/terminal-renderer.js';
import { TerminalInput } from './ui/terminal-input.js';
import { registerInitCommand } from './commands/init.js';
import { registerChatCommand, runChatSession } from './commands/chat.js';
import { registerConfigCommand } from './commands/config.js';
import { registerProvidersCommand } from './commands/providers.js';
import { registerModelsCommand } from './commands/models.js';

// Load environment variables silently from current working directory or ancestors
dotenv.config();

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name('syntra')
    .description(
      'Syntra is a local-first autonomous agent runtime and CLI platform designed to execute complex user goals using LLMs, tools, skills, context engineering, and eventually multi-agent orchestration.'
    )
    .version('0.1.0')
    .option('--debug', 'Enable debug diagnostics and detailed error logs', false);

  const configManager = new ConfigManager();
  const credentialStore = new CompositeCredentialStore();
  const providerRegistry = new ProviderRegistry();
  const renderer = new TerminalRenderer();
  const input = new TerminalInput();

  // Register all core provider adapters with credential store integration
  providerRegistry.register(new OpenAIProvider({ credentialStore }));
  providerRegistry.register(new AnthropicProvider({ credentialStore }));
  providerRegistry.register(new GeminiProvider({ credentialStore }));
  providerRegistry.register(new MockLLMProvider());

  // Hook before execution to handle --debug
  program.hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts<{ debug?: boolean }>();
    if (opts.debug || process.env.SYNTRA_DEBUG === 'true' || process.env.SYNTRA_DEBUG === '1') {
      renderer.setDebugMode(true);
      defaultLogger.setLevel('debug');
      defaultLogger.debug('Debug mode enabled');
    }
  });

  // Register CLI subcommands
  registerInitCommand(program, configManager, credentialStore, providerRegistry, renderer, input);
  registerChatCommand(program, configManager, credentialStore, providerRegistry, renderer, input);
  registerConfigCommand(program, configManager, renderer);
  registerProvidersCommand(program, credentialStore, providerRegistry, renderer);
  registerModelsCommand(program, configManager, providerRegistry, renderer);

  // Default action when running `syntra` without subcommands:
  // Enters interactive chat session (or onboarding on first run)
  program.action(async () => {
    try {
      await runChatSession(
        configManager,
        credentialStore,
        providerRegistry,
        renderer,
        input
      );
    } catch (err: unknown) {
      renderer.renderError(err);
      process.exit(1);
    }
  });

  await program.parseAsync(argv);
}

// Execute when invoked directly as CLI binary
if (process.argv[1]?.endsWith('syntra') || process.argv[1]?.endsWith('index.js')) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Fatal CLI Error:', message);
    process.exit(1);
  });
}
