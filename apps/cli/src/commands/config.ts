import { Command } from 'commander';
import pc from 'picocolors';
import { ConfigManager } from '@syntra/config';
import { TerminalRenderer } from '../ui/terminal-renderer.js';

export function registerConfigCommand(
  program: Command,
  configManager: ConfigManager,
  renderer: TerminalRenderer
): void {
  const configCmd = program
    .command('config')
    .description('Manage Syntra configuration');

  configCmd
    .command('list', { isDefault: true })
    .description('Display all current configuration settings')
    .action(async () => {
      try {
        const config = await configManager.loadConfig();
        console.log();
        console.log(pc.bold(pc.cyan('Syntra Configuration:')));
        console.log();
        console.log(`  Config Dir:       ${thisDir(configManager.getConfigDir())}`);
        console.log(`  Config Path:      ${configManager.getConfigPath()}`);
        console.log(`  Default Provider: ${pc.green(config.defaultProvider)}`);
        console.log(`  Default Model:    ${pc.blue(config.defaultModel)}`);
        console.log(`  Streaming:        ${config.streaming ? pc.green('enabled') : pc.red('disabled')}`);
        if (config.temperature !== undefined) {
          console.log(`  Temperature:      ${config.temperature}`);
        }
        if (config.maxOutputTokens !== undefined) {
          console.log(`  Max Output Tokens:${config.maxOutputTokens}`);
        }
        console.log();
      } catch (err: unknown) {
        renderer.renderError(err);
      }
    });

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key: string) => {
      try {
        const config = await configManager.loadConfig();
        const value = (config as unknown as Record<string, unknown>)[key];
        if (value === undefined) {
          console.log(pc.yellow(`Configuration key '${key}' is not set.`));
        } else {
          console.log(`${key} = ${String(value)}`);
        }
      } catch (err: unknown) {
        renderer.renderError(err);
      }
    });

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      try {
        let parsedValue: unknown = value;
        if (value.toLowerCase() === 'true') parsedValue = true;
        else if (value.toLowerCase() === 'false') parsedValue = false;
        else if (!isNaN(Number(value))) parsedValue = Number(value);

        await configManager.updateConfig({
          [key]: parsedValue,
        });
        renderer.renderSuccess(`Updated ${key} to ${String(parsedValue)}`);
        console.log(pc.dim(`Saved to ${configManager.getConfigPath()}`));
      } catch (err: unknown) {
        renderer.renderError(err);
      }
    });

  function thisDir(dir: string): string {
    return dir;
  }
}
