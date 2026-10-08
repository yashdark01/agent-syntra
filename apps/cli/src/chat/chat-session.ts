import { LLMMessage, TokenUsage, CancellationError } from '@syntra/core';
import { ProviderRegistry, resolveGeminiModelId } from '@syntra/providers';
import { ConfigManager, AppConfig } from '@syntra/config';
import { TerminalRenderer } from '../ui/terminal-renderer.js';
import { InputCancelledError, TerminalInput } from '../ui/terminal-input.js';
import { SlashCommandHandler, SlashContext, SLASH_COMPLETIONS } from './slash-commands.js';
import { Spinner } from '../ui/spinner.js';

export interface ChatSessionOptions {
  config: AppConfig;
  configManager: ConfigManager;
  registry: ProviderRegistry;
  renderer: TerminalRenderer;
  input: TerminalInput;
  workspaceDir?: string;
}

export class ChatSession {
  private config: AppConfig;
  private configManager: ConfigManager;
  private registry: ProviderRegistry;
  private renderer: TerminalRenderer;
  private input: TerminalInput;
  private slashHandler: SlashCommandHandler;

  private activeProviderId: string;
  private activeModelId: string;
  private workspaceDir: string;
  private messages: LLMMessage[] = [];
  private totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  private activeAbortController: AbortController | null = null;
  private isGenerating = false;

  constructor(options: ChatSessionOptions) {
    this.config = options.config;
    this.configManager = options.configManager;
    this.registry = options.registry;
    this.renderer = options.renderer;
    this.input = options.input;
    this.workspaceDir = options.workspaceDir ?? process.cwd();

    this.activeProviderId = this.config.defaultProvider;
    this.activeModelId = this.config.defaultModel;

    this.slashHandler = new SlashCommandHandler(
      this.registry,
      this.configManager,
      this.renderer,
      this.input
    );
  }

  public getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  public getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  public cancelActiveGeneration(): boolean {
    if (this.isGenerating && this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      return true;
    }
    return false;
  }

  public isBusy(): boolean {
    return this.isGenerating;
  }

  public async start(): Promise<void> {
    await this.migrateRetiredModels();

    const initialProvider = this.registry.get(this.activeProviderId);

    this.renderer.renderWelcomeBanner({
      provider: initialProvider.displayName,
      model: this.activeModelId,
      workspace: this.workspaceDir,
    });

    const slashContext: SlashContext = {
      activeProviderId: this.activeProviderId,
      activeModelId: this.activeModelId,
      workspaceDir: this.workspaceDir,
      messages: this.messages,
      totalUsage: this.totalUsage,
      setActiveProvider: (id: string) => {
        this.activeProviderId = id;
        slashContext.activeProviderId = id;
      },
      setActiveModel: (id: string) => {
        this.activeModelId = id;
        slashContext.activeModelId = id;
      },
      clearMessages: () => {
        this.messages = [];
        slashContext.messages = this.messages;
      },
    };

    while (true) {
      let result: { text: string; exit: boolean };

      try {
        const currentProvider = this.registry.get(this.activeProviderId);
        result = await this.input.askChat(
          `${currentProvider.displayName} · ${this.activeModelId}`,
          SLASH_COMPLETIONS
        );
      } catch (err) {
        if (err instanceof InputCancelledError) {
          break;
        }
        break;
      }

      if (result.exit) {
        console.log();
        break;
      }

      const trimmed = result.text.trim();
      if (!trimmed) {
        continue;
      }

      if (trimmed.startsWith('/')) {
        const commandResult = await this.slashHandler.handle(trimmed, slashContext);
        if (commandResult.shouldExit) {
          break;
        }
        continue;
      }

      await this.handleUserPrompt(trimmed);
    }
  }

  private async migrateRetiredModels(): Promise<void> {
    if (this.activeProviderId !== 'gemini') {
      return;
    }

    const resolved = resolveGeminiModelId(this.activeModelId);
    if (resolved === this.activeModelId) {
      return;
    }

    this.renderer.renderWarning(
      `Model ${this.activeModelId} is retired. Switching to ${resolved}.`
    );
    this.activeModelId = resolved;
    this.config = { ...this.config, defaultModel: resolved };
    await this.configManager.updateConfig({ defaultModel: resolved });
  }

  private async handleUserPrompt(prompt: string): Promise<void> {
    this.messages.push({ role: 'user', content: prompt });

    const provider = this.registry.get(this.activeProviderId);
    this.activeAbortController = new AbortController();
    this.isGenerating = true;
    this.input.pauseReadline();

    try {
      if (this.config.streaming) {
        await this.streamResponse(provider, this.activeAbortController.signal);
      } else {
        await this.generateResponse(provider, this.activeAbortController.signal);
      }
    } catch (err: unknown) {
      if (err instanceof CancellationError || (err instanceof Error && err.name === 'AbortError')) {
        this.renderer.renderCancellation();
      } else {
        this.renderer.renderError(err);
      }
    } finally {
      this.isGenerating = false;
      this.activeAbortController = null;
    }
  }

  private async streamResponse(
    provider: ReturnType<typeof this.registry.get>,
    signal: AbortSignal
  ): Promise<void> {
    const stream = provider.stream({
      model: this.activeModelId,
      messages: this.messages,
      temperature: this.config.temperature,
      maxOutputTokens: this.config.maxOutputTokens,
      signal,
    });

    const spinner = new Spinner();
    spinner.start('Thinking');

    let headerRendered = false;
    let accumulatedText = '';

    try {
      for await (const event of stream) {
        if (signal.aborted) {
          throw new CancellationError('Generation cancelled.', { provider: provider.id });
        }

        switch (event.type) {
          case 'response.started': {
            break;
          }

          case 'content.delta': {
            if (!headerRendered) {
              spinner.stop();
              this.renderer.renderAgentHeader();
              headerRendered = true;
            }
            accumulatedText += event.delta;
            this.renderer.renderDelta(event.delta);
            break;
          }

          case 'usage': {
            this.accumulateUsage(event.usage);
            break;
          }

          case 'response.completed': {
            if (!headerRendered) {
              spinner.stop();
              this.renderer.renderAgentHeader();
              headerRendered = true;
              if (event.response.content) {
                this.renderer.renderDelta(event.response.content);
              }
            }
            this.renderer.renderCompletionEnd();
            this.messages.push({
              role: 'assistant',
              content: event.response.content || accumulatedText,
            });
            break;
          }

          case 'response.error': {
            spinner.stop();
            throw event.error;
          }
        }
      }
    } finally {
      spinner.stop();
    }
  }

  private async generateResponse(
    provider: ReturnType<typeof this.registry.get>,
    signal: AbortSignal
  ): Promise<void> {
    const spinner = new Spinner();
    spinner.start('Thinking');
    try {
      const response = await provider.generate({
        model: this.activeModelId,
        messages: this.messages,
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
        signal,
      });

      spinner.stop();
      this.renderer.renderAgentHeader();
      this.renderer.renderDelta(response.content);
      this.renderer.renderCompletionEnd();

      this.messages.push({ role: 'assistant', content: response.content });
      if (response.usage) {
        this.accumulateUsage(response.usage);
      }
    } finally {
      spinner.stop();
    }
  }

  private accumulateUsage(usage: TokenUsage): void {
    if (usage.inputTokens) {
      this.totalUsage.inputTokens = (this.totalUsage.inputTokens ?? 0) + usage.inputTokens;
    }
    if (usage.outputTokens) {
      this.totalUsage.outputTokens = (this.totalUsage.outputTokens ?? 0) + usage.outputTokens;
    }
    if (usage.totalTokens) {
      this.totalUsage.totalTokens = (this.totalUsage.totalTokens ?? 0) + usage.totalTokens;
    }
  }
}
