import { Command } from 'commander';
import pc from 'picocolors';
import { ConfigManager } from '@syntra/config';
import { ProviderRegistry } from '@syntra/providers';
import { TerminalRenderer } from '../ui/terminal-renderer.js';

export function registerModelsCommand(
  program: Command,
  configManager: ConfigManager,
  providerRegistry: ProviderRegistry,
  renderer: TerminalRenderer
): void {
  program
    .command('models')
    .description('List available models and capabilities for a provider')
    .option('-p, --provider <provider>', 'Provider to inspect (defaults to configured default)')
    .action(async (options: { provider?: string }) => {
      try {
        const config = await configManager.loadConfig();
        const targetProviderId = options.provider ?? config.defaultProvider;

        const provider = providerRegistry.get(targetProviderId);
        const models = await provider.listModels();

        console.log();
        console.log(
          pc.bold(pc.cyan(`Available Models for ${provider.displayName} (${provider.id}):`))
        );
        console.log();

        for (const model of models) {
          const name = model.displayName ?? model.id;
          const ctx = model.contextWindow
            ? pc.yellow(`${Math.round(model.contextWindow / 1000)}k ctx`)
            : pc.dim('n/a');

          const caps: string[] = [];
          if (model.capabilities?.streaming) caps.push(pc.green('stream'));
          if (model.capabilities?.tools) caps.push(pc.blue('tools'));
          if (model.capabilities?.reasoning) caps.push(pc.magenta('reasoning'));
          if (model.capabilities?.vision) caps.push(pc.cyan('vision'));
          if (model.capabilities?.structuredOutput) caps.push(pc.dim('json'));

          console.log(`  ${pc.bold(model.id.padEnd(30))} [${name}]`);
          console.log(`    Context:       ${ctx}`);
          console.log(`    Capabilities:  ${caps.join(', ') || pc.dim('none')}`);
          console.log();
        }
      } catch (err: unknown) {
        renderer.renderError(err);
      }
    });
}
