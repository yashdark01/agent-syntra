import { Command } from 'commander';
import { ConfigManager, CompositeCredentialStore } from '@syntra/config';
import { ProviderRegistry, OpenAIProvider, AnthropicProvider, GeminiProvider } from '@syntra/providers';
import { TerminalInput } from '../ui/terminal-input.js';
import { TerminalRenderer } from '../ui/terminal-renderer.js';
import { ChatSession } from '../chat/chat-session.js';
import { OnboardingWizard } from '../onboarding/onboarding-wizard.js';

export async function runChatSession(
  configManager: ConfigManager,
  credentialStore: CompositeCredentialStore,
  providerRegistry: ProviderRegistry,
  renderer: TerminalRenderer,
  input: TerminalInput,
  options: { provider?: string; model?: string } = {}
): Promise<void> {
  // Ensure default providers are registered
  if (!providerRegistry.has('openai')) {
    providerRegistry.register(new OpenAIProvider({ credentialStore }));
  }
  if (!providerRegistry.has('anthropic')) {
    providerRegistry.register(new AnthropicProvider({ credentialStore }));
  }
  if (!providerRegistry.has('gemini')) {
    providerRegistry.register(new GeminiProvider({ credentialStore }));
  }

  const isConfigured = await configManager.isConfigured();

  // If not configured, automatically run onboarding
  if (!isConfigured) {
    const wizard = new OnboardingWizard({
      configManager,
      credentialStore,
      providerRegistry,
      terminalInput: input,
      terminalRenderer: renderer,
    });
    await wizard.run();
  }

  let config = await configManager.loadConfig();

  // Override with CLI options if provided
  if (options.provider) {
    config = { ...config, defaultProvider: options.provider };
  }
  if (options.model) {
    config = { ...config, defaultModel: options.model };
  }

  // Ensure active provider has credentials
  const hasCreds = await credentialStore.has(config.defaultProvider);
  if (!hasCreds) {
    renderer.renderWarning(
      `No credentials found for provider '${config.defaultProvider}'. Launching onboarding...`
    );
    const wizard = new OnboardingWizard({
      configManager,
      credentialStore,
      providerRegistry,
      terminalInput: input,
      terminalRenderer: renderer,
    });
    config = await wizard.run();
  }

  const session = new ChatSession({
    config,
    configManager,
    registry: providerRegistry,
    renderer,
    input,
    workspaceDir: process.cwd(),
  });

  // Ctrl+C cancels an in-flight generation. The chat prompt handles exit itself.
  const sigintHandler = () => {
    session.cancelActiveGeneration();
  };

  process.on('SIGINT', sigintHandler);

  try {
    await session.start();
  } finally {
    process.removeListener('SIGINT', sigintHandler);
    input.close();
  }
}

export function registerChatCommand(
  program: Command,
  configManager: ConfigManager,
  credentialStore: CompositeCredentialStore,
  providerRegistry: ProviderRegistry,
  renderer: TerminalRenderer,
  input: TerminalInput
): void {
  program
    .command('chat')
    .description('Start interactive chat session with Syntra')
    .option('-p, --provider <provider>', 'Override LLM provider for this session')
    .option('-m, --model <model>', 'Override model for this session')
    .action(async (options) => {
      try {
        await runChatSession(
          configManager,
          credentialStore,
          providerRegistry,
          renderer,
          input,
          options
        );
      } catch (err: unknown) {
        renderer.renderError(err);
      }
    });
}
