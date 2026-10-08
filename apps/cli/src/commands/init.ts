import { Command } from 'commander';
import { ConfigManager, CompositeCredentialStore } from '@syntra/config';
import { ProviderRegistry, OpenAIProvider, AnthropicProvider, GeminiProvider } from '@syntra/providers';
import { InputCancelledError, TerminalInput } from '../ui/terminal-input.js';
import { TerminalRenderer } from '../ui/terminal-renderer.js';
import { OnboardingWizard } from '../onboarding/onboarding-wizard.js';

export function registerInitCommand(
  program: Command,
  configManager: ConfigManager,
  credentialStore: CompositeCredentialStore,
  providerRegistry: ProviderRegistry,
  renderer: TerminalRenderer,
  input: TerminalInput
): void {
  program
    .command('init')
    .description('Initialize Syntra and configure AI provider credentials')
    .action(async () => {
      // Ensure providers are registered with credential store
      if (!providerRegistry.has('openai')) {
        providerRegistry.register(new OpenAIProvider({ credentialStore }));
      }
      if (!providerRegistry.has('anthropic')) {
        providerRegistry.register(new AnthropicProvider({ credentialStore }));
      }
      if (!providerRegistry.has('gemini')) {
        providerRegistry.register(new GeminiProvider({ credentialStore }));
      }

      const wizard = new OnboardingWizard({
        configManager,
        credentialStore,
        providerRegistry,
        terminalInput: input,
        terminalRenderer: renderer,
      });

      try {
        await wizard.run();
      } catch (err: unknown) {
        if (
          err instanceof InputCancelledError ||
          (err instanceof Error && err.message.includes('aborted'))
        ) {
          console.log('\nInitialization aborted.\n');
        } else {
          renderer.renderError(err);
        }
      } finally {
        input.close();
      }
    });
}
