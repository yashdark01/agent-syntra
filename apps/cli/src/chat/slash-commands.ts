import pc from 'picocolors';
import { LLMMessage, TokenUsage } from '@syntra/core';
import { ProviderRegistry } from '@syntra/providers';
import { ConfigManager } from '@syntra/config';
import { TerminalRenderer } from '../ui/terminal-renderer.js';
import { InputCancelledError, TerminalInput } from '../ui/terminal-input.js';

export const SLASH_COMPLETIONS = [
  '/help',
  '/clear',
  '/provider',
  '/model',
  '/config',
  '/status',
  '/exit',
];

export interface SlashContext {
  activeProviderId: string;
  activeModelId: string;
  workspaceDir: string;
  messages: LLMMessage[];
  totalUsage: TokenUsage;
  setActiveProvider: (providerId: string) => void;
  setActiveModel: (modelId: string) => void;
  clearMessages: () => void;
}

export interface SlashResult {
  handled: boolean;
  shouldExit: boolean;
}

export class SlashCommandHandler {
  private registry: ProviderRegistry;
  private configManager: ConfigManager;
  private renderer: TerminalRenderer;
  private input: TerminalInput;

  constructor(
    registry: ProviderRegistry,
    configManager: ConfigManager,
    renderer: TerminalRenderer,
    input: TerminalInput
  ) {
    this.registry = registry;
    this.configManager = configManager;
    this.renderer = renderer;
    this.input = input;
  }

  public async handle(inputLine: string, context: SlashContext): Promise<SlashResult> {
    const trimmed = inputLine.trim();
    if (!trimmed.startsWith('/')) {
      return { handled: false, shouldExit: false };
    }

    const [rawCommand, ...args] = trimmed.slice(1).split(/\s+/);
    const command = rawCommand?.toLowerCase();

    switch (command) {
      case '':
      case undefined: {
        return this.openCommandPicker(context);
      }

      case 'help': {
        this.renderer.renderHelp();
        return { handled: true, shouldExit: false };
      }

      case 'clear': {
        context.clearMessages();
        console.log();
        this.renderer.renderSuccess('Conversation history cleared.');
        console.log();
        return { handled: true, shouldExit: false };
      }

      case 'exit':
      case 'quit': {
        console.log(pc.dim('\nExiting Syntra. Goodbye.\n'));
        return { handled: true, shouldExit: true };
      }

      case 'status': {
        this.renderer.renderStatus({
          provider: context.activeProviderId,
          model: context.activeModelId,
          workspace: context.workspaceDir,
          messageCount: context.messages.length,
          usage: context.totalUsage,
        });
        return { handled: true, shouldExit: false };
      }

      case 'config': {
        const config = await this.configManager.loadConfig();
        console.log();
        console.log(pc.bold(pc.cyan('Syntra Configuration')));
        console.log();
        console.log(`  Config dir        ${this.configManager.getConfigDir()}`);
        console.log(`  Config file       ${this.configManager.getConfigPath()}`);
        console.log(`  Default provider  ${pc.green(config.defaultProvider)}`);
        console.log(`  Default model     ${pc.blue(config.defaultModel)}`);
        console.log(`  Streaming         ${config.streaming ? pc.green('on') : pc.red('off')}`);
        if (config.temperature !== undefined) {
          console.log(`  Temperature       ${config.temperature}`);
        }
        if (config.maxOutputTokens !== undefined) {
          console.log(`  Max output tokens ${config.maxOutputTokens}`);
        }
        console.log();
        return { handled: true, shouldExit: false };
      }

      case 'provider': {
        const target = args[0]?.toLowerCase();
        const debug = process.env.SYNTRA_DEBUG === '1' || process.env.SYNTRA_DEBUG === 'true';
        const available = this.registry.list().filter((p) => p.id !== 'mock' || debug);

        if (target) {
          const match = available.find((p) => p.id.toLowerCase() === target);
          if (match) {
            await this.switchProvider(context, match.id);
          } else {
            this.renderer.renderWarning(
              `Unknown provider '${target}'. Available: ${available.map((p) => p.id).join(', ')}`
            );
          }
          return { handled: true, shouldExit: false };
        }

        try {
          const choices = available.map((p) => ({
            label: p.displayName,
            value: p.id,
            description: p.id === context.activeProviderId ? 'active' : p.id,
          }));
          const selected = await this.input.select('Switch provider', choices);
          await this.switchProvider(context, selected);
        } catch (err) {
          if (!(err instanceof InputCancelledError)) {
            throw err;
          }
        }
        return { handled: true, shouldExit: false };
      }

      case 'model': {
        const target = args[0];
        const currentProvider = this.registry.get(context.activeProviderId);
        const models = await currentProvider.listModels();

        if (target) {
          const match = models.find((m) => m.id.toLowerCase() === target.toLowerCase());
          if (match) {
            await this.switchModel(context, match.id);
          } else {
            context.setActiveModel(target);
            this.renderer.renderInfo(`Set model to custom identifier '${target}'.`);
          }
          return { handled: true, shouldExit: false };
        }

        try {
          const defaultIndex = Math.max(
            0,
            models.findIndex((m) => m.id === context.activeModelId)
          );
          const choices = models.map((m) => ({
            label: m.displayName ?? m.id,
            value: m.id,
            description: m.id === context.activeModelId ? 'active' : m.id,
          }));
          const selected = await this.input.select('Switch model', choices, defaultIndex);
          await this.switchModel(context, selected);
        } catch (err) {
          if (!(err instanceof InputCancelledError)) {
            throw err;
          }
        }
        return { handled: true, shouldExit: false };
      }

      default: {
        this.renderer.renderWarning(
          `Unknown slash command '/${command}'. Type /help or / for the picker.`
        );
        return { handled: true, shouldExit: false };
      }
    }
  }

  private async openCommandPicker(context: SlashContext): Promise<SlashResult> {
    try {
      const selected = await this.input.select('Commands', [
        { label: 'Help', value: '/help', description: 'Show slash commands' },
        { label: 'Clear', value: '/clear', description: 'Reset conversation' },
        { label: 'Provider', value: '/provider', description: 'Switch LLM provider' },
        { label: 'Model', value: '/model', description: 'Switch model' },
        { label: 'Config', value: '/config', description: 'Show configuration' },
        { label: 'Status', value: '/status', description: 'Tokens and session' },
        { label: 'Exit', value: '/exit', description: 'Leave Syntra' },
      ]);
      return this.handle(selected, context);
    } catch (err) {
      if (err instanceof InputCancelledError) {
        return { handled: true, shouldExit: false };
      }
      throw err;
    }
  }

  private async switchProvider(context: SlashContext, providerId: string): Promise<void> {
    context.setActiveProvider(providerId);
    const selProvider = this.registry.get(providerId);
    const models = await selProvider.listModels();
    if (models[0]) {
      context.setActiveModel(models[0].id);
      await this.configManager.updateConfig({
        defaultProvider: providerId,
        defaultModel: models[0].id,
      });
    }
    this.renderer.renderSuccess(`Provider ${selProvider.displayName} · ${context.activeModelId}`);
  }

  private async switchModel(context: SlashContext, modelId: string): Promise<void> {
    context.setActiveModel(modelId);
    await this.configManager.updateConfig({ defaultModel: modelId });
    this.renderer.renderSuccess(`Model ${modelId}`);
  }
}
