import pc from 'picocolors';
import { ConfigManager, AppConfig, CredentialStore } from '@syntra/config';
import { ProviderRegistry, OpenAIProvider, AnthropicProvider, GeminiProvider } from '@syntra/providers';
import { TerminalInput, InputCancelledError } from '../ui/terminal-input.js';
import { TerminalRenderer } from '../ui/terminal-renderer.js';
import { Spinner } from '../ui/spinner.js';

export interface OnboardingOptions {
  configManager: ConfigManager;
  credentialStore: CredentialStore;
  providerRegistry: ProviderRegistry;
  terminalInput: TerminalInput;
  terminalRenderer: TerminalRenderer;
}

const PROVIDER_CHOICES = [
  { label: 'OpenAI', value: 'openai', description: 'GPT-4o, o1, o3-mini' },
  { label: 'Anthropic', value: 'anthropic', description: 'Claude 3.7 Sonnet, Claude 3.5' },
  { label: 'Gemini', value: 'gemini', description: 'Gemini 3.8 Flash, Gemini 2.5 Pro' },
];

export class OnboardingWizard {
  private configManager: ConfigManager;
  private credentialStore: CredentialStore;
  private providerRegistry: ProviderRegistry;
  private input: TerminalInput;
  private renderer: TerminalRenderer;

  constructor(options: OnboardingOptions) {
    this.configManager = options.configManager;
    this.credentialStore = options.credentialStore;
    this.providerRegistry = options.providerRegistry;
    this.input = options.terminalInput;
    this.renderer = options.terminalRenderer;
  }

  public async run(): Promise<AppConfig> {
    console.log();
    console.log(pc.bold(pc.cyan('Welcome to Syntra')));
    console.log(pc.dim('Configure providers with arrow keys, Space, and Enter.'));
    console.log();

    let selectedProviderIds: string[];
    try {
      const prechecked = await Promise.all(
        PROVIDER_CHOICES.map(async (choice) => Boolean(await this.credentialStore.get(choice.value)))
      );
      selectedProviderIds = await this.input.checkbox(
        'Which providers do you want to configure?',
        PROVIDER_CHOICES,
        prechecked.some(Boolean) ? prechecked : [true, false, false]
      );
    } catch (err) {
      if (err instanceof InputCancelledError) {
        throw new Error('Onboarding aborted by user.');
      }
      throw err;
    }

    for (const providerId of selectedProviderIds) {
      await this.configureProvider(providerId);
    }

    const defaultProviderId =
      selectedProviderIds.length === 1
        ? selectedProviderIds[0]!
        : await this.input.select(
            'Default provider:',
            PROVIDER_CHOICES.filter((choice) => selectedProviderIds.includes(choice.value)),
            0
          );

    const provider = this.ensureProvider(defaultProviderId);
    const models = await provider.listModels();
    const modelChoices = models.map((m) => ({
      label: m.displayName ?? m.id,
      value: m.id,
      description: m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k ctx` : undefined,
    }));

    const selectedModel = await this.input.select('Default model:', modelChoices, 0);

    const config: AppConfig = {
      defaultProvider: defaultProviderId,
      defaultModel: selectedModel,
      streaming: true,
    };

    await this.configManager.saveConfig(config);

    console.log();
    console.log(pc.bold(pc.green('✓  Syntra is ready.')));
    console.log();
    console.log(pc.dim('Run:'));
    console.log();
    console.log(`  ${pc.bold(pc.cyan('syntra'))}`);
    console.log();

    return config;
  }

  private ensureProvider(providerId: string) {
    let provider = this.providerRegistry.tryGet(providerId);
    if (!provider) {
      if (providerId === 'openai') {
        provider = new OpenAIProvider({ credentialStore: this.credentialStore });
      } else if (providerId === 'anthropic') {
        provider = new AnthropicProvider({ credentialStore: this.credentialStore });
      } else {
        provider = new GeminiProvider({ credentialStore: this.credentialStore });
      }
      this.providerRegistry.register(provider);
    }
    return provider;
  }

  private async configureProvider(providerId: string): Promise<void> {
    const meta = PROVIDER_CHOICES.find((choice) => choice.value === providerId);
    console.log();
    console.log(pc.bold(meta?.label ?? providerId));

    let apiKey = await this.credentialStore.get(providerId);
    let keyFromEnv = false;

    if (apiKey) {
      this.renderer.renderInfo(`Detected existing credential for ${providerId}.`);
      const useExisting = await this.input.select(
        'Use existing credential?',
        [
          { label: 'Use detected credential', value: 'use' },
          { label: 'Enter a new API key', value: 'new' },
        ],
        0
      );

      if (useExisting === 'new') {
        apiKey = null;
      } else {
        keyFromEnv = true;
      }
    }

    if (!apiKey) {
      try {
        apiKey = await this.input.askSecret(pc.bold('  API key: '));
      } catch (err) {
        if (err instanceof InputCancelledError) {
          throw new Error('Onboarding aborted by user.');
        }
        throw err;
      }

      if (!apiKey) {
        throw new Error('API key cannot be empty.');
      }
    }

    if (!keyFromEnv) {
      await this.credentialStore.set(providerId, apiKey);
    }

    const provider = this.ensureProvider(providerId);
    const spinner = new Spinner();
    spinner.start('Validating credentials...');

    let isValid = false;
    try {
      isValid = await provider.validateCredentials();
    } catch {
      isValid = false;
    }
    spinner.stop();

    if (!isValid) {
      this.renderer.renderWarning('Could not verify this API key against the provider.');
      const proceed = await this.input.confirm('Save this key anyway?', true);
      if (!proceed) {
        if (!keyFromEnv) {
          await this.credentialStore.delete(providerId);
        }
        throw new Error('Onboarding aborted by user.');
      }
    } else {
      this.renderer.renderSuccess(`${meta?.label ?? providerId} API key is valid.`);
    }
  }
}
