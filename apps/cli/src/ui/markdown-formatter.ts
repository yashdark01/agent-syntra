import pc from 'picocolors';
import { highlightCodeLine } from './code-highlighter.js';
import { renderBoxHeader, renderBoxLine, renderBoxFooter } from './box-frame.js';

export function formatInlineMarkdown(text: string): string {
  if (!text) return '';

  let formatted = text.replace(/`([^`]+)`/g, (_, code) => {
    return pc.bold(pc.cyan(` ${code} `));
  });

  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, (_, content) => {
    return pc.bold(content);
  });
  formatted = formatted.replace(/__([^_]+)__/g, (_, content) => {
    return pc.bold(content);
  });

  formatted = formatted.replace(/(^|[^*])\*([^*]+)\*/g, (_, prefix, content) => {
    return prefix + pc.italic(content);
  });

  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return pc.cyan(label) + pc.dim(` (${url})`);
  });

  return formatted;
}

export function formatMarkdownLine(line: string): string {
  const trimmed = line.trim();

  if (!trimmed) {
    return '';
  }

  if (line.startsWith('# ')) {
    return '\n' + pc.bold(pc.cyan('◆ ' + line.slice(2).trim())) + '\n';
  }

  if (line.startsWith('## ')) {
    return '\n' + pc.bold(pc.blue('■ ' + line.slice(3).trim()));
  }

  if (line.startsWith('### ')) {
    return '\n' + pc.bold(pc.magenta('▲ ' + line.slice(4).trim()));
  }

  if (/^#{4,6}\s/.test(line)) {
    const text = line.replace(/^#{4,6}\s+/, '');
    return pc.bold(pc.white(text));
  }

  if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
    const cols = process.stdout.columns || 80;
    return pc.dim('─'.repeat(Math.max(20, Math.min(cols - 4, 70))));
  }

  if (line.startsWith('> ') || line === '>') {
    const quote = line.slice(1).trim();
    return pc.dim('│ ') + pc.italic(formatInlineMarkdown(quote));
  }

  const ulMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
  if (ulMatch) {
    const indent = ulMatch[1];
    const itemContent = ulMatch[3];
    return `${indent}${pc.cyan('•')} ${formatInlineMarkdown(itemContent)}`;
  }

  const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
  if (olMatch) {
    const indent = olMatch[1];
    const num = olMatch[2];
    const itemContent = olMatch[3];
    return `${indent}${pc.dim(num + '.')} ${formatInlineMarkdown(itemContent)}`;
  }

  return formatInlineMarkdown(line);
}

export class StreamingMarkdownFormatter {
  private buffer = '';
  private inCodeBlock = false;
  private currentLanguage = '';
  private codeLineNumber = 1;

  constructor(private onOutput: (text: string) => void) {}

  public processDelta(delta: string): void {
    this.buffer += delta;

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.processLine(line);
    }
  }

  private processLine(rawLine: string): void {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      if (!this.inCodeBlock) {
        this.inCodeBlock = true;
        this.currentLanguage = trimmed.slice(3).trim() || 'code';
        this.codeLineNumber = 1;
        const header = renderBoxHeader(this.currentLanguage, {
          borderColor: pc.dim,
          badgeColor: pc.cyan,
        });
        this.onOutput('\n' + header + '\n');
      } else {
        this.inCodeBlock = false;
        const footer = renderBoxFooter({ borderColor: pc.dim });
        this.onOutput(footer + '\n\n');
        this.currentLanguage = '';
      }
      return;
    }

    if (this.inCodeBlock) {
      const highlighted = highlightCodeLine(rawLine, this.currentLanguage);
      const boxLine = renderBoxLine(highlighted, this.codeLineNumber++, {
        showLineNumbers: false,
        padding: 2,
        borderColor: pc.dim,
      });
      this.onOutput(boxLine + '\n');
    } else {
      const formatted = formatMarkdownLine(rawLine);
      this.onOutput(formatted + '\n');
    }
  }

  public flush(): void {
    if (this.buffer.length > 0) {
      const remaining = this.buffer;
      this.buffer = '';

      if (remaining.trim().startsWith('```')) {
        if (this.inCodeBlock) {
          this.inCodeBlock = false;
          this.onOutput(renderBoxFooter({ borderColor: pc.dim }) + '\n\n');
        }
      } else if (this.inCodeBlock) {
        const highlighted = highlightCodeLine(remaining, this.currentLanguage);
        this.onOutput(
          renderBoxLine(highlighted, this.codeLineNumber++, {
            showLineNumbers: false,
            padding: 2,
            borderColor: pc.dim,
          }) + '\n'
        );
      } else {
        this.onOutput(formatMarkdownLine(remaining));
      }
    }

    if (this.inCodeBlock) {
      this.inCodeBlock = false;
      this.onOutput(renderBoxFooter({ borderColor: pc.dim }) + '\n\n');
    }
  }

  public reset(): void {
    this.buffer = '';
    this.inCodeBlock = false;
    this.currentLanguage = '';
    this.codeLineNumber = 1;
  }
}

export function formatFullMarkdown(markdown: string): string {
  let output = '';
  const formatter = new StreamingMarkdownFormatter((text) => {
    output += text;
  });
  formatter.processDelta(markdown);
  formatter.flush();
  return output;
}
