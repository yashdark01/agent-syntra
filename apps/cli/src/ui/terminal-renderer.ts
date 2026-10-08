import pc from 'picocolors';
import { LLMError, TokenUsage } from '@syntra/core';
import { flattenNestedErrorMessage, redactString } from '@syntra/shared';

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

  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  public renderWelcomeBanner(info: BannerInfo): void {
    console.log();
    console.log(pc.bold(pc.cyan('  SYNTRA')));
    console.log(pc.dim('  Autonomous Intelligence Runtime'));
    console.log();
    console.log(`  ${pc.dim('provider')}   ${pc.green(info.provider)}`);
    console.log(`  ${pc.dim('model')}      ${pc.blue(info.model)}`);
    console.log(`  ${pc.dim('workspace')}  ${pc.yellow(info.workspace)}`);
    console.log();
    console.log(pc.dim('  Type /help · Tab completes slash commands · Ctrl+C cancels'));
    console.log();
  }

  public renderAgentHeader(): void {
    console.log();
    console.log(pc.cyan(pc.bold('◆ Syntra')));
    console.log();
  }

  public renderDelta(delta: string): void {
    process.stdout.write(delta);
  }

  public renderCompletionEnd(): void {
    console.log();
    console.log();
  }

  public renderCancellation(): void {
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
        console.log(pc.dim('\nTry again later or pick another provider with ') + pc.cyan('/provider'));
      } else if (error.statusCode === 401) {
        console.log(pc.dim('\nConfigure your API key with ') + pc.cyan('syntra init'));
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
    console.log();
    console.log(pc.bold(pc.cyan('Syntra Status')));
    console.log();
    console.log(`  ${pc.dim('provider')}   ${pc.green(status.provider)}`);
    console.log(`  ${pc.dim('model')}      ${pc.blue(status.model)}`);
    console.log(`  ${pc.dim('workspace')}  ${pc.yellow(status.workspace)}`);
    console.log(`  ${pc.dim('messages')}   ${status.messageCount}`);
    console.log();
    console.log(pc.bold('  Tokens'));
    console.log(`  Input   ${(status.usage.inputTokens ?? 0).toLocaleString()}`);
    console.log(`  Output  ${(status.usage.outputTokens ?? 0).toLocaleString()}`);
    console.log(`  Total   ${(status.usage.totalTokens ?? 0).toLocaleString()}`);
    console.log();
  }

  public renderHelp(): void {
    console.log();
    console.log(pc.bold(pc.cyan('Slash commands')));
    console.log();
    console.log(`  ${pc.bold('/help')}      Command reference`);
    console.log(`  ${pc.bold('/clear')}     Clear conversation history`);
    console.log(`  ${pc.bold('/provider')}  Switch provider`);
    console.log(`  ${pc.bold('/model')}     Switch model`);
    console.log(`  ${pc.bold('/config')}    Show configuration`);
    console.log(`  ${pc.bold('/status')}    Session and token usage`);
    console.log(`  ${pc.bold('/exit')}      Leave the session`);
    console.log();
    console.log(pc.dim('  Tip: type / then Tab to autocomplete. / by itself opens a picker.'));
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
