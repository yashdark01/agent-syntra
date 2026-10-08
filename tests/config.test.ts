import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConfigManager, AppConfigSchema, DEFAULT_CONFIG } from '@syntra/config';

describe('ConfigManager & AppConfigSchema', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'syntra-test-config-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('validates a correct configuration schema', () => {
    const valid = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      streaming: true,
      temperature: 0.7,
      maxOutputTokens: 2048,
    };
    const parsed = AppConfigSchema.parse(valid);
    expect(parsed.defaultProvider).toBe('openai');
    expect(parsed.temperature).toBe(0.7);
  });

  it('rejects an invalid configuration missing required fields', () => {
    const invalid = {
      streaming: true,
    };
    expect(() => AppConfigSchema.parse(invalid)).toThrow();
  });

  it('loads default configuration when file does not exist', async () => {
    const manager = new ConfigManager(tempDir);
    const config = await manager.loadConfig();
    expect(config.defaultProvider).toBe(DEFAULT_CONFIG.defaultProvider);
    expect(config.defaultModel).toBe(DEFAULT_CONFIG.defaultModel);
    expect(config.streaming).toBe(true);
  });

  it('persists and reloads configuration', async () => {
    const manager = new ConfigManager(tempDir);
    await manager.saveConfig({
      defaultProvider: 'anthropic',
      defaultModel: 'claude-3-5-sonnet',
      streaming: false,
    });

    expect(await manager.isConfigured()).toBe(true);

    const reloaded = await manager.loadConfig();
    expect(reloaded.defaultProvider).toBe('anthropic');
    expect(reloaded.defaultModel).toBe('claude-3-5-sonnet');
    expect(reloaded.streaming).toBe(false);
  });

  it('updates existing configuration with partial values', async () => {
    const manager = new ConfigManager(tempDir);
    await manager.saveConfig({
      defaultProvider: 'gemini',
      defaultModel: 'gemini-2.0-flash',
      streaming: true,
    });

    await manager.updateConfig({ defaultModel: 'gemini-1.5-pro' });

    const updated = await manager.loadConfig();
    expect(updated.defaultProvider).toBe('gemini');
    expect(updated.defaultModel).toBe('gemini-1.5-pro');
  });

  it('applies environment variable overrides', async () => {
    const originalProvider = process.env.SYNTRA_DEFAULT_PROVIDER;
    const originalModel = process.env.SYNTRA_DEFAULT_MODEL;

    try {
      process.env.SYNTRA_DEFAULT_PROVIDER = 'custom-provider';
      process.env.SYNTRA_DEFAULT_MODEL = 'custom-model';

      const manager = new ConfigManager(tempDir);
      const config = await manager.loadConfig();

      expect(config.defaultProvider).toBe('custom-provider');
      expect(config.defaultModel).toBe('custom-model');
    } finally {
      if (originalProvider !== undefined) {
        process.env.SYNTRA_DEFAULT_PROVIDER = originalProvider;
      } else {
        delete process.env.SYNTRA_DEFAULT_PROVIDER;
      }
      if (originalModel !== undefined) {
        process.env.SYNTRA_DEFAULT_MODEL = originalModel;
      } else {
        delete process.env.SYNTRA_DEFAULT_MODEL;
      }
    }
  });
});
