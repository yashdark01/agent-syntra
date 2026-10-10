import pc from 'picocolors';

export interface BoxOptions {
  width?: number;
  padding?: number;
  borderColor?: (str: string) => string;
  badgeColor?: (str: string) => string;
  showLineNumbers?: boolean;
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}

export function getTerminalWidth(preferredWidth?: number): number {
  if (preferredWidth && preferredWidth > 20) {
    return preferredWidth;
  }
  const columns = process.stdout.columns || 80;
  return Math.max(40, Math.min(columns - 4, 90));
}

export function renderBoxHeader(title = '', options: BoxOptions = {}): string {
  const width = getTerminalWidth(options.width);
  const color = options.borderColor || pc.dim;
  const badgeColor = options.badgeColor || pc.cyan;

  if (!title) {
    return color(`╭${'─'.repeat(Math.max(0, width - 2))}╮`);
  }

  const cleanTitle = stripAnsi(title);
  const prefix = '── ';
  const suffix = ' ';
  const used = 1 + prefix.length + cleanTitle.length + suffix.length + 1;
  const remaining = Math.max(2, width - used);

  return (
    color('╭' + prefix) +
    badgeColor(pc.bold(title)) +
    color(suffix + '─'.repeat(remaining) + '╮')
  );
}

export function renderBoxLine(
  content: string,
  lineNumber?: number,
  options: BoxOptions = {}
): string {
  const width = getTerminalWidth(options.width);
  const color = options.borderColor || pc.dim;
  const pad = options.padding ?? 2;

  let linePrefix = ' '.repeat(pad);
  if (options.showLineNumbers && lineNumber !== undefined) {
    const numStr = String(lineNumber).padStart(3, ' ');
    linePrefix = ` ${pc.dim(numStr)} │ `;
  }

  const prefixVisibleLen = visibleLength(linePrefix);
  const contentVisibleLen = visibleLength(content);
  const interiorWidth = Math.max(10, width - 2);

  if (prefixVisibleLen + contentVisibleLen <= interiorWidth) {
    const trailingSpaces = Math.max(0, interiorWidth - prefixVisibleLen - contentVisibleLen);
    return color('│') + linePrefix + content + ' '.repeat(trailingSpaces) + color('│');
  }

  return color('│') + linePrefix + content;
}

export function renderBoxDivider(options: BoxOptions = {}): string {
  const width = getTerminalWidth(options.width);
  const color = options.borderColor || pc.dim;
  return color(`├${'─'.repeat(Math.max(0, width - 2))}┤`);
}

export function renderBoxFooter(options: BoxOptions = {}): string {
  const width = getTerminalWidth(options.width);
  const color = options.borderColor || pc.dim;
  return color(`╰${'─'.repeat(Math.max(0, width - 2))}╯`);
}

export function renderFramedBox(
  lines: string[],
  title = '',
  options: BoxOptions = {}
): string {
  const parts: string[] = [];
  parts.push(renderBoxHeader(title, options));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    parts.push(renderBoxLine(line, i + 1, options));
  }

  parts.push(renderBoxFooter(options));
  return parts.join('\n');
}
