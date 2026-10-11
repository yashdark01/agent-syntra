import pc from 'picocolors';
import { Logger, LogLevel } from './logger.js';
import { redactString, sanitizeMetadata } from '../security/redact.js';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface ConsoleLoggerOptions {
  level?: LogLevel;
  prefix?: string;
  enableTimestamp?: boolean;
}

export class ConsoleLogger implements Logger {
  private level: LogLevel;
  private prefix?: string;
  private enableTimestamp: boolean;

  constructor(options: ConsoleLoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.prefix = options.prefix;
    this.enableTimestamp = options.enableTimestamp ?? false;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public debug(message: string, metadata?: unknown): void {
    this.log('debug', pc.gray('[DEBUG]'), message, metadata);
  }

  public info(message: string, metadata?: unknown): void {
    this.log('info', pc.blue('[INFO]'), message, metadata);
  }

  public warn(message: string, metadata?: unknown): void {
    this.log('warn', pc.yellow('[WARN]'), message, metadata);
  }

  public error(message: string, metadata?: unknown): void {
    this.log('error', pc.red('[ERROR]'), message, metadata);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  private log(level: LogLevel, tag: string, message: string, metadata?: unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = this.enableTimestamp ? pc.dim(`[${new Date().toISOString()}] `) : '';
    const prefixStr = this.prefix ? pc.cyan(`[${this.prefix}] `) : '';
    const safeMessage = redactString(message);

    const formattedPrefix = `${timestamp}${prefixStr}${tag} ${safeMessage}`;

    if (metadata !== undefined) {
      const safeMetadata = sanitizeMetadata(metadata);
      if (level === 'error') {
        console.error(formattedPrefix, safeMetadata);
      } else if (level === 'warn') {
        console.warn(formattedPrefix, safeMetadata);
      } else {
        console.log(formattedPrefix, safeMetadata);
      }
    } else {
      if (level === 'error') {
        console.error(formattedPrefix);
      } else if (level === 'warn') {
        console.warn(formattedPrefix);
      } else {
        console.log(formattedPrefix);
      }
    }
  }
}

/**
 * Global default logger instance for convenient runtime access.
 */
export const defaultLogger = new ConsoleLogger({
  level: (process.env.SYNTRA_DEBUG === 'true' || process.env.SYNTRA_DEBUG === '1') ? 'debug' : 'info',
  prefix: 'Syntra',
});
