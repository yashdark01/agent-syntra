import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface CredentialStore {
  get(provider: string): Promise<string | null>;
  set(provider: string, key: string): Promise<void>;
  delete(provider: string): Promise<void>;
  has(provider: string): Promise<boolean>;
}

export function getEnvVarForProvider(provider: string): string {
  const normalized = provider.toLowerCase();
  switch (normalized) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    case 'gemini':
    case 'google':
      return 'GEMINI_API_KEY';
    default:
      return `${normalized.toUpperCase()}_API_KEY`;
  }
}

export class EnvCredentialStore implements CredentialStore {
  public async get(provider: string): Promise<string | null> {
    const envVar = getEnvVarForProvider(provider);
    const value = process.env[envVar];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
    const genericVar = `${provider.toUpperCase()}_API_KEY`;
    const genericVal = process.env[genericVar];
    return genericVal && genericVal.trim().length > 0 ? genericVal.trim() : null;
  }

  public async set(_provider: string, _key: string): Promise<void> {
    throw new Error('Cannot persist credentials to environment variables. Use file credential store.');
  }

  public async delete(provider: string): Promise<void> {
    const envVar = getEnvVarForProvider(provider);
    delete process.env[envVar];
  }

  public async has(provider: string): Promise<boolean> {
    const key = await this.get(provider);
    return key !== null;
  }
}

function getDerivedKey(): Buffer {
  const machineIdentifier = `${os.hostname()}-${os.userInfo().username}-syntra-salt`;
  return crypto.scryptSync(machineIdentifier, 'syntra-local-salt-v1', 32);
}

function encrypt(text: string): { iv: string; tag: string; encrypted: string } {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    iv: iv.toString('hex'),
    tag,
    encrypted,
  };
}

function decrypt(encryptedData: { iv: string; tag: string; encrypted: string }): string {
  const key = getDerivedKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encryptedData.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export class EncryptedFileCredentialStore implements CredentialStore {
  private filePath: string;

  constructor(filePath?: string) {
    if (filePath) {
      this.filePath = filePath;
    } else {
      const configDir = process.env.SYNTRA_CONFIG_DIR
        ? path.resolve(process.env.SYNTRA_CONFIG_DIR.replace(/^~(?=$|\/|\\)/, os.homedir()))
        : path.join(os.homedir(), '.syntra');
      this.filePath = path.join(configDir, 'credentials.json');
    }
  }

  private async ensureDir(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  private async readAll(): Promise<Record<string, { iv: string; tag: string; encrypted: string }>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  public async get(provider: string): Promise<string | null> {
    const records = await this.readAll();
    const entry = records[provider.toLowerCase()];
    if (!entry) return null;
    try {
      return decrypt(entry);
    } catch {
      return null;
    }
  }

  public async set(provider: string, key: string): Promise<void> {
    await this.ensureDir();
    const records = await this.readAll();
    records[provider.toLowerCase()] = encrypt(key.trim());
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2), { mode: 0o600 });
    try {
      fsSync.chmodSync(this.filePath, 0o600);
    } catch {
      // Ignore on filesystems that don't support POSIX modes
    }
  }

  public async delete(provider: string): Promise<void> {
    const records = await this.readAll();
    delete records[provider.toLowerCase()];
    await this.ensureDir();
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2), { mode: 0o600 });
  }

  public async has(provider: string): Promise<boolean> {
    const val = await this.get(provider);
    return val !== null;
  }
}

export class CompositeCredentialStore implements CredentialStore {
  private envStore: EnvCredentialStore;
  private fileStore: EncryptedFileCredentialStore;

  constructor(filePath?: string) {
    this.envStore = new EnvCredentialStore();
    this.fileStore = new EncryptedFileCredentialStore(filePath);
  }

  public async get(provider: string): Promise<string | null> {
    const envKey = await this.envStore.get(provider);
    if (envKey) return envKey;
    return this.fileStore.get(provider);
  }

  public async set(provider: string, key: string): Promise<void> {
    await this.fileStore.set(provider, key);
  }

  public async delete(provider: string): Promise<void> {
    await this.fileStore.delete(provider);
  }

  public async has(provider: string): Promise<boolean> {
    const hasEnv = await this.envStore.has(provider);
    if (hasEnv) return true;
    return this.fileStore.has(provider);
  }

  public async isFromEnv(provider: string): Promise<boolean> {
    return this.envStore.has(provider);
  }
}
