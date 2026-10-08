import { Command } from 'commander';
import pc from 'picocolors';
import { CompositeCredentialStore, getEnvVarForProvider } from '@syntra/config';
import { ProviderRegistry } from '@syntra/providers';
import { TerminalRenderer } from '../ui/terminal-renderer.js';

export function registerProvidersCommand(
  program: Command,
  credentialStore: CompositeCredentialStore,
  providerRegistry: ProviderRegistry,
  renderer: TerminalRenderer
): void {
  program
    .command('providers')
    .description('List registered LLM providers and credential status')
    .action(async () => {
      try {
        console.log();
        console.log(pc.bold(pc.cyan('Registered LLM Providers:')));
        console.log();

        const providers = providerRegistry.list();

        for (const provider of providers) {
          const hasKey = await credentialStore.has(provider.id);
          const isFromEnv = await credentialStore.isFromEnv(provider.id);
          const envVar = getEnvVarForProvider(provider.id);

          const statusBadge = hasKey
            ? pc.green('✓ configured')
            : pc.red('✗ missing credentials');

          const sourceInfo = hasKey
            ? isFromEnv
              ? pc.dim(`(via ${envVar})`)
              : pc.dim('(stored in ~/.syntra/credentials.json)')
            : pc.dim(`(set ${envVar} or run syntra init)`);

          console.log(`  ${pc.bold(provider.displayName.padEnd(18))} [${provider.id}]`);
          console.log(`    Status:      ${statusBadge} ${sourceInfo}`);

          try {
            const models = await provider.listModels();
            console.log(`    Models:      ${pc.dim(models.map((m) => m.id).join(', '))}`);
          } catch {
            // Ignore model listing errors if offline
          }
          console.log();
        }
      } catch (err: unknown) {
        renderer.renderError(err);
      }
    });
}
