import pc from 'picocolors';
import { LLMError, TokenUsage } from '@syntra/core';
import { flattenNestedErrorMessage, redactString } from '@syntra/shared';
import {
  renderBoxHeader,
  renderBoxLine,
  renderBoxDivider,
  renderBoxFooter,
  getTerminalWidth,
} from './box-frame.js';
import {
  StreamingMarkdownFormatter,
  formatFullMarkdown,
} from './markdown-formatter.js';

export interface BannerInfo {
  provider: string;
  model: string;
  workspace: string;
}

export interface SessionStatusInfo {
  provider: string;
  model: string;
  workspace: string;
  messageCount: number;
  usage: TokenUsage;
}

function formatError(error: unknown): string {
  if (error instanceof LLMError) {
    return flattenNestedErrorMessage(redactString(error.message));
  }
  if (error instanceof Error) {
    return flattenNestedErrorMessage(redactString(error.message));
  }
  return flattenNestedErrorMessage(redactString(String(error)));
}

export class TerminalRenderer {
  private debugMode: boolean;
  private streamFormatter: StreamingMarkdownFormatter;

  constructor(debugMode = false) {
    this.debugMode = debugMode;
    this.streamFormatter = new StreamingMarkdownFormatter((text) => {
      process.stdout.write(text);
    });
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  public renderWelcomeBanner(info: BannerInfo): void {
    const width = Math.min(getTerminalWidth(), 72);
    const borderColor = pc.dim;

    console.log();
    console.log(
      renderBoxHeader('SYNTRA · v0.1.0', {
        width,
        badgeColor: pc.cyan,
        borderColor,
      })
    );
    console.log(
      renderBoxLine(pc.dim('Autonomous Intelligence Runtime'), undefined, {
        width,
        borderColor,
      })
    );
    console.log(renderBoxDivider({ width, borderColor }));
    console.log(
      renderBoxLine(
        `${pc.dim('provider'.padEnd(12))} ${pc.green(info.provider)}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(
      renderBoxLine(
        `${pc.dim('model'.padEnd(12))} ${pc.blue(info.model)}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(
      renderBoxLine(
        `${pc.dim('workspace'.padEnd(12))} ${pc.yellow(info.workspace)}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(renderBoxFooter({ width, borderColor }));
    console.log(`  ${pc.dim('Type /help · Tab completes slash commands · Ctrl+C cancels')}`);
    console.log();
  }

  public renderAgentHeader(): void {
    console.log();
    console.log(pc.cyan(pc.bold('◆ Syntra')));
    console.log();
  }

  public renderDelta(delta: string): void {
    this.streamFormatter.processDelta(delta);
  }

  public renderMarkdown(markdown: string): void {
    const formatted = formatFullMarkdown(markdown);
    process.stdout.write(formatted);
  }

  public renderCompletionEnd(): void {
    this.streamFormatter.flush();
    this.streamFormatter.reset();
    console.log();
  }

  public renderCancellation(): void {
    this.streamFormatter.reset();
    console.log();
    console.log(pc.yellow('✗ Generation cancelled.'));
    console.log();
  }

  public renderError(error: unknown): void {
    console.log();
    const message = formatError(error);
    console.log(pc.red(`✗ ${message}`));

    if (error instanceof LLMError) {
      if (error.statusCode === 429) {
        console.log(
          pc.dim('\nTry again later or pick another provider with ') +
            pc.cyan('/provider')
        );
      } else if (error.statusCode === 401) {
        console.log(
          pc.dim('\nConfigure your API key with ') + pc.cyan('syntra init')
        );
      } else if (error.statusCode === 404) {
        console.log(pc.dim('\nPick a current model with ') + pc.cyan('/model'));
      }
    }

    if (this.debugMode && error instanceof Error && error.stack) {
      console.log(pc.dim('\nStack trace:'));
      console.log(pc.dim(redactString(error.stack)));
    }
    console.log();
  }

  public renderStatus(status: SessionStatusInfo): void {
    const width = Math.min(getTerminalWidth(), 68);
    const borderColor = pc.dim;

    console.log();
    console.log(
      renderBoxHeader('Syntra Status', {
        width,
        badgeColor: pc.cyan,
        borderColor,
      })
    );
    console.log(
      renderBoxLine(
        `${pc.dim('provider'.padEnd(12))} ${pc.green(status.provider)}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(
      renderBoxLine(
        `${pc.dim('model'.padEnd(12))} ${pc.blue(status.model)}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(
      renderBoxLine(
        `${pc.dim('workspace'.padEnd(12))} ${pc.yellow(status.workspace)}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(
      renderBoxLine(
        `${pc.dim('messages'.padEnd(12))} ${status.messageCount}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(renderBoxDivider({ width, borderColor }));
    console.log(
      renderBoxLine(pc.bold('Token Usage'), undefined, { width, borderColor })
    );
    console.log(
      renderBoxLine(
        `${pc.dim('Input'.padEnd(12))} ${(status.usage.inputTokens ?? 0).toLocaleString()}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(
      renderBoxLine(
        `${pc.dim('Output'.padEnd(12))} ${(status.usage.outputTokens ?? 0).toLocaleString()}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(
      renderBoxLine(
        `${pc.dim('Total'.padEnd(12))} ${(status.usage.totalTokens ?? 0).toLocaleString()}`,
        undefined,
        { width, borderColor }
      )
    );
    console.log(renderBoxFooter({ width, borderColor }));
    console.log();
  }

  public renderHelp(): void {
    const width = Math.min(getTerminalWidth(), 68);
    const borderColor = pc.dim;

    console.log();
    console.log(
      renderBoxHeader('Slash Commands', {
        width,
        badgeColor: pc.cyan,
        borderColor,
      })
    );
    const commands: [string, string][] = [
      ['/help', 'Command reference'],
      ['/clear', 'Clear conversation history'],
      ['/provider', 'Switch active provider'],
      ['/model', 'Switch active model'],
      ['/config', 'Show current configuration'],
      ['/status', 'Session details and token usage'],
      ['/exit', 'Leave the session'],
    ];

    for (const [cmd, desc] of commands) {
      console.log(
        renderBoxLine(
          `${pc.bold(pc.cyan(cmd.padEnd(12)))} ${pc.white(desc)}`,
          undefined,
          { width, borderColor }
        )
      );
    }
    console.log(renderBoxFooter({ width, borderColor }));
    console.log(
      pc.dim('  Tip: type / then Tab to autocomplete. / by itself opens a picker.')
    );
    console.log();
  }

  public renderInfo(message: string): void {
    console.log(pc.cyan(`ℹ  ${message}`));
  }

  public renderSuccess(message: string): void {
    console.log(pc.green(`✓  ${message}`));
  }

  public renderWarning(message: string): void {
    console.log(pc.yellow(`⚠  ${message}`));
  }
}
