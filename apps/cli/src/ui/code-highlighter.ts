import pc from 'picocolors';

export interface HighlightOptions {
  language?: string;
  forceColor?: boolean;
}

// Enable colors unless NO_COLOR is explicitly set
const isColorEnabled = !process.env.NO_COLOR;
const color = pc.createColors(isColorEnabled);

// Common keywords for major languages
const KEYWORDS_BY_LANG: Record<string, Set<string>> = {
  javascript: new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'default', 'try', 'catch', 'finally', 'throw',
    'class', 'extends', 'new', 'this', 'super', 'import', 'export', 'from', 'as',
    'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete',
  ]),
  typescript: new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'default', 'try', 'catch', 'finally', 'throw',
    'class', 'extends', 'new', 'this', 'super', 'import', 'export', 'from', 'as',
    'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete',
    'type', 'interface', 'enum', 'implements', 'declare', 'namespace', 'abstract', 'private',
    'protected', 'public', 'readonly', 'override', 'keyof', 'satisfies', 'infer', 'never',
  ]),
  python: new Set([
    'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'pass',
    'try', 'except', 'finally', 'raise', 'import', 'from', 'as', 'class', 'with', 'yield',
    'async', 'await', 'lambda', 'global', 'nonlocal', 'assert', 'del', 'in', 'is', 'not',
    'and', 'or',
  ]),
  bash: new Set([
    'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac',
    'in', 'function', 'return', 'exit', 'export', 'set', 'unset', 'alias', 'local',
    'echo', 'read', 'cd', 'pwd', 'source',
  ]),
  json: new Set([]),
  rust: new Set([
    'fn', 'let', 'mut', 'const', 'pub', 'use', 'mod', 'struct', 'enum', 'impl', 'trait',
    'type', 'if', 'else', 'match', 'while', 'for', 'loop', 'break', 'continue', 'return',
    'async', 'await', 'unsafe', 'where', 'as', 'in', 'move', 'ref', 'crate', 'self', 'Self',
  ]),
  go: new Set([
    'func', 'var', 'const', 'type', 'struct', 'interface', 'package', 'import', 'return',
    'if', 'else', 'switch', 'case', 'default', 'for', 'range', 'break', 'continue',
    'go', 'defer', 'select', 'chan', 'map',
  ]),
  sql: new Set([
    'select', 'from', 'where', 'insert', 'into', 'update', 'delete', 'create', 'table',
    'drop', 'alter', 'join', 'inner', 'left', 'right', 'outer', 'on', 'group', 'by',
    'order', 'having', 'limit', 'offset', 'and', 'or', 'not', 'in', 'as', 'distinct',
    'union', 'all', 'values', 'primary', 'key', 'references',
  ]),
};

// Aliases
KEYWORDS_BY_LANG.ts = KEYWORDS_BY_LANG.typescript;
KEYWORDS_BY_LANG.js = KEYWORDS_BY_LANG.javascript;
KEYWORDS_BY_LANG.py = KEYWORDS_BY_LANG.python;
KEYWORDS_BY_LANG.sh = KEYWORDS_BY_LANG.bash;
KEYWORDS_BY_LANG.zsh = KEYWORDS_BY_LANG.bash;
KEYWORDS_BY_LANG.shell = KEYWORDS_BY_LANG.bash;
KEYWORDS_BY_LANG.rs = KEYWORDS_BY_LANG.rust;
KEYWORDS_BY_LANG.golang = KEYWORDS_BY_LANG.go;

// Common literals across languages
const LITERALS = new Set([
  'true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'nil', 'NaN', 'Infinity',
]);

// Common built-in types
const TYPES = new Set([
  'string', 'number', 'boolean', 'symbol', 'bigint', 'any', 'unknown', 'never', 'void',
  'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'bytes',
  'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'usize', 'isize',
  'String', 'Vec', 'Option', 'Result', 'Some', 'None', 'Ok', 'Err',
  'Array', 'Object', 'Promise', 'Map', 'Set', 'Date', 'RegExp', 'Error',
]);

/**
 * Tokenize and highlight a single line of code according to language syntax.
 */
export function highlightCodeLine(line: string, language = ''): string {
  if (!line) {
    return '';
  }

  const lang = (language || '').toLowerCase().trim();
  const keywords = KEYWORDS_BY_LANG[lang] || KEYWORDS_BY_LANG.typescript;

  // Check full line comment first
  const trimmed = line.trimStart();
  if (
    trimmed.startsWith('//') ||
    (trimmed.startsWith('#') && lang !== 'markdown') ||
    trimmed.startsWith('--')
  ) {
    return color.dim(color.gray(line));
  }

  // Token regex matching strings, comments, numbers, identifiers/keywords, operators, and whitespace
  const tokenRegex =
    /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\/.*$|#.*$|--.*$|\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b|[a-zA-Z_$][a-zA-Z0-9_$]*|[!=<>&|+\-*/%^~?:]+|[^\s\w]+|\s+)/g;

  let result = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    const token = match[0];

    // String literals
    if (
      (token.startsWith('"') && token.endsWith('"') && token.length >= 2) ||
      (token.startsWith("'") && token.endsWith("'") && token.length >= 2) ||
      (token.startsWith('`') && token.endsWith('`') && token.length >= 2)
    ) {
      result += color.green(token);
    }
    // Comments
    else if (token.startsWith('//') || (token.startsWith('#') && lang !== 'markdown') || token.startsWith('--')) {
      result += color.dim(color.gray(token));
    }
    // Numbers
    else if (/^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)$/.test(token)) {
      result += color.yellow(token);
    }
    // Keywords
    else if (keywords.has(token.toLowerCase()) || keywords.has(token)) {
      result += color.magenta(color.bold(token));
    }
    // Literals (true, false, None, etc.)
    else if (LITERALS.has(token)) {
      result += color.yellow(color.bold(token));
    }
    // Built-in types
    else if (TYPES.has(token)) {
      result += color.cyan(token);
    }
    // Common punctuation & symbols
    else if (/^[{}()[\];,.:]$/.test(token)) {
      result += color.dim(token);
    }
    // Operators
    else if (/^[!=<>&|+\-*/%^~?]+$/.test(token)) {
      result += color.cyan(token);
    }
    // Default text & identifiers
    else {
      result += token;
    }
  }

  return result || line;
}

/**
 * Highlights a multi-line code block.
 */
export function highlightCode(code: string, language = ''): string[] {
  const lines = code.split('\n');
  return lines.map((line) => highlightCodeLine(line, language));
}
