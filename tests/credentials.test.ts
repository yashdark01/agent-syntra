import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  EnvCredentialStore,
  EncryptedFileCredentialStore,
  CompositeCredentialStore,
  getEnvVarForProvider,
} from '@syntra/config';
import { redactSecret, redactString, sanitizeMetadata } from '@syntra/shared';

describe('Credential Storage and Secret Redaction', () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'syntra-test-creds-'));
    tempFilePath = path.join(tempDir, 'credentials.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('getEnvVarForProvider', () => {
    it('maps known and fallback provider names to standard env vars', () => {
      expect(getEnvVarForProvider('openai')).toBe('OPENAI_API_KEY');
      expect(getEnvVarForProvider('anthropic')).toBe('ANTHROPIC_API_KEY');
      expect(getEnvVarForProvider('gemini')).toBe('GEMINI_API_KEY');
      expect(getEnvVarForProvider('ollama')).toBe('OLLAMA_API_KEY');
    });
  });

  describe('EnvCredentialStore', () => {
    it('retrieves credentials from environment variables', async () => {
      const store = new EnvCredentialStore();
      const testKey = 'test-openai-key-12345';
      process.env.OPENAI_API_KEY = testKey;

      try {
        expect(await store.get('openai')).toBe(testKey);
        expect(await store.has('openai')).toBe(true);
        expect(await store.has('nonexistent_provider')).toBe(false);
      } finally {
        delete process.env.OPENAI_API_KEY;
      }
    });
  });

  describe('EncryptedFileCredentialStore', () => {
    it('stores, encrypts, and retrieves API keys securely', async () => {
      const store = new EncryptedFileCredentialStore(tempFilePath);
      const secret = 'sk-proj-1234567890abcdefghijklmnop';

      await store.set('openai', secret);

      // Verify file is encrypted and does not contain plain secret
      const rawDisk = await fs.readFile(tempFilePath, 'utf8');
      expect(rawDisk).not.toContain(secret);
      expect(rawDisk).toContain('iv');
      expect(rawDisk).toContain('tag');
      expect(rawDisk).toContain('encrypted');

      // Verify decrypted retrieval
      const retrieved = await store.get('openai');
      expect(retrieved).toBe(secret);
      expect(await store.has('openai')).toBe(true);

      // Test deletion
      await store.delete('openai');
      expect(await store.get('openai')).toBeNull();
      expect(await store.has('openai')).toBe(false);
    });
  });

  describe('CompositeCredentialStore', () => {
    it('prioritizes environment variables over file storage', async () => {
      const store = new CompositeCredentialStore(tempFilePath);
      const fileKey = 'file-key-value';
      const envKey = 'env-key-value';

      await store.set('anthropic', fileKey);

      // Without env var, returns file key
      expect(await store.get('anthropic')).toBe(fileKey);
      expect(await store.isFromEnv('anthropic')).toBe(false);

      // With env var, returns env key
      process.env.ANTHROPIC_API_KEY = envKey;
      try {
        expect(await store.get('anthropic')).toBe(envKey);
        expect(await store.isFromEnv('anthropic')).toBe(true);
      } finally {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });
  });

  describe('Secret Redaction Utilities', () => {
    it('redacts individual API keys with masked characters', () => {
      const key = 'sk-1234567890abcdef123456';
      const redacted = redactSecret(key);
      expect(redacted).not.toBe(key);
      expect(redacted).toContain('••••••••');
      expect(redacted.startsWith('sk-1')).toBe(true);
    });

    it('redacts secrets found inside arbitrary strings', () => {
      const text = 'Failed to connect with key sk-proj-1234567890abcdef12345678 to service';
      const redacted = redactString(text);
      expect(redacted).not.toContain('1234567890abcdef12345678');
      expect(redacted).toContain('••••••••');
    });

    it('sanitizes metadata objects and nested structures', () => {
      const payload = {
        apiKey: 'secret-key-to-hide',
        nested: {
          token: 'another-secret',
          safeValue: 42,
        },
      };

      const sanitized = sanitizeMetadata(payload) as Record<string, unknown>;
      expect(sanitized['apiKey']).toContain('••••••••');
      expect(sanitized['apiKey']).not.toBe('secret-key-to-hide');
      const nested = sanitized['nested'] as Record<string, unknown>;
      expect(nested['token']).toContain('••••••••');
      expect(nested['token']).not.toBe('another-secret');
      expect(nested['safeValue']).toBe(42);
    });
  });
});
