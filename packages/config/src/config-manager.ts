import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AppConfig, AppConfigSchema, DEFAULT_CONFIG } from './schema.js';
import { InvalidConfigurationError } from '@syntra/core';

export class ConfigManager {
  private configDir: string;
  private configPath: string;

  constructor(customDir?: string) {
    if (customDir) {
      this.configDir = customDir;
    } else if (process.env.SYNTRA_CONFIG_DIR) {
      this.configDir = path.resolve(
        process.env.SYNTRA_CONFIG_DIR.replace(/^~(?=$|\/|\\)/, os.homedir())
      );
    } else {
      this.configDir = path.join(os.homedir(), '.syntra');
    }
    this.configPath = path.join(this.configDir, 'config.json');
  }

  public getConfigDir(): string {
    return this.configDir;
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
  }

  public async isConfigured(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      const content = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(content);
      const result = AppConfigSchema.safeParse(parsed);
      return result.success;
    } catch {
      return false;
    }
  }

  public async loadConfig(): Promise<AppConfig> {
    let fileConfig: Partial<AppConfig> = {};

    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(content);
      const validated = AppConfigSchema.parse(parsed);
      fileConfig = validated;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'EACCES' && code !== 'EPERM') {
        throw new InvalidConfigurationError(
          `Configuration file at ${this.configPath} is malformed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const merged: AppConfig = {
      defaultProvider:
        process.env.SYNTRA_DEFAULT_PROVIDER || fileConfig.defaultProvider || DEFAULT_CONFIG.defaultProvider,
      defaultModel:
        process.env.SYNTRA_DEFAULT_MODEL || fileConfig.defaultModel || DEFAULT_CONFIG.defaultModel,
      streaming:
        fileConfig.streaming !== undefined ? fileConfig.streaming : DEFAULT_CONFIG.streaming,
      ...(fileConfig.temperature !== undefined ? { temperature: fileConfig.temperature } : {}),
      ...(fileConfig.maxOutputTokens !== undefined ? { maxOutputTokens: fileConfig.maxOutputTokens } : {}),
    };

    return AppConfigSchema.parse(merged);
  }

  public async saveConfig(config: AppConfig): Promise<void> {
    const validated = AppConfigSchema.parse(config);
    try {
      await this.ensureDir();
      await fs.writeFile(this.configPath, JSON.stringify(validated, null, 2), {
        mode: 0o644,
        encoding: 'utf8',
      });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM') {
        return;
      }
      throw err;
    }
  }

  public async updateConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.loadConfig();
    const updated: AppConfig = {
      ...current,
      ...partial,
    };
    await this.saveConfig(updated);
    return updated;
  }
}
