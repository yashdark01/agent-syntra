import readline from 'node:readline';
import readlinePromises from 'node:readline/promises';
import pc from 'picocolors';

export interface SelectOption<T = string> {
  label: string;
  value: T;
  description?: string;
}

export class InputCancelledError extends Error {
  constructor(message = 'Cancelled.') {
    super(message);
    this.name = 'InputCancelledError';
  }
}

export interface ChatAskResult {
  text: string;
  exit: boolean;
}

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

function isTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function write(text: string): void {
  process.stdout.write(text);
}

function eraseLines(count: number): void {
  if (count <= 0) return;
  for (let i = 0; i < count; i += 1) {
    write('\x1b[2K');
    if (i < count - 1) {
      write('\x1b[1A');
    }
  }
  write('\r');
}

export class TerminalInput {
  private rl: readlinePromises.Interface | null = null;
  private chatHistory: string[] = [];
  private lastCtrlC = 0;

  private getInterface(): readlinePromises.Interface {
    if (!this.rl) {
      this.rl = readlinePromises.createInterface({
        input: process.stdin,
        output: process.stdout,
        historySize: 0,
      });
    }
    return this.rl;
  }

  public pauseReadline(): void {
    if (this.rl) {
      this.rl.pause();
    }
  }

  public resumeReadline(): void {
    if (this.rl) {
      this.rl.resume();
    }
  }

  public async ask(promptText: string): Promise<string> {
    const rl = this.getInterface();
    const answer = await rl.question(promptText);
    return answer.trim();
  }

  /**
   * Prompts the user for sensitive input (such as an API key), masking each character
   * so secrets are never echoed.
   */
  public async askSecret(promptText: string): Promise<string> {
    this.pauseReadline();
    return new Promise((resolve, reject) => {
      write(promptText);

      if (!process.stdin.isTTY) {
        let buffer = '';
        const onData = (chunk: Buffer) => {
          const str = chunk.toString();
          if (str.includes('\n') || str.includes('\r')) {
            process.stdin.removeListener('data', onData);
            resolve(buffer.trim());
          } else {
            buffer += str;
          }
        };
        process.stdin.on('data', onData);
        return;
      }

      let input = '';
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const cleanup = () => {
        process.stdin.setRawMode(wasRaw ?? false);
        process.stdin.removeListener('keypress', onKeypress);
        write(SHOW_CURSOR);
      };

      const onKeypress = (chunk: string, key?: readline.Key) => {
        if (key?.ctrl && key.name === 'c') {
          cleanup();
          write('\n');
          reject(new InputCancelledError());
          return;
        }

        if (chunk === '\r' || chunk === '\n' || key?.name === 'return') {
          cleanup();
          write('\n');
          resolve(input.trim());
          return;
        }

        if (chunk === '\u0008' || chunk === '\x7f' || key?.name === 'backspace') {
          if (input.length > 0) {
            input = input.slice(0, -1);
            write('\b \b');
          }
          return;
        }

        if (chunk?.startsWith('\u001b')) {
          return;
        }

        if (chunk && chunk >= ' ') {
          input += chunk;
          write('•');
        }
      };

      readline.emitKeypressEvents(process.stdin);
      process.stdin.on('keypress', onKeypress);
    });
  }

  public async confirm(title: string, defaultYes = true): Promise<boolean> {
    const value = await this.select(
      title,
      [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
      defaultYes ? 0 : 1
    );
    return value === 'yes';
  }

  /**
   * Single-choice interactive radio list (arrow keys + checkbox glyphs).
   */
  public async select<T = string>(
    title: string,
    options: SelectOption<T>[],
    defaultIndex = 0
  ): Promise<T> {
    if (options.length === 0) {
      throw new Error('No options available.');
    }

    if (!isTTY()) {
      return this.selectFallback(title, options, defaultIndex);
    }

    const index = await this.runRadioMenu(title, options, defaultIndex);
    return options[index]!.value;
  }

  /**
   * Multi-choice checkbox list. Space toggles, Enter confirms.
   */
  public async checkbox<T = string>(
    title: string,
    options: SelectOption<T>[],
    initiallyChecked: boolean[] = []
  ): Promise<T[]> {
    if (options.length === 0) {
      throw new Error('No options available.');
    }

    if (!isTTY()) {
      const selected = await this.select(title, options, 0);
      return [selected];
    }

    return this.runCheckboxMenu(title, options, initiallyChecked);
  }

  public async askChat(hint?: string, completions: string[] = []): Promise<ChatAskResult> {
    if (!isTTY()) {
      try {
        const text = await this.ask(pc.cyan('❯ '));
        if (text === '/exit' || text === '/quit') {
          return { text, exit: false };
        }
        return { text, exit: false };
      } catch {
        return { text: '', exit: true };
      }
    }

    this.pauseReadline();
    return this.runChatEditor(hint, completions);
  }

  public close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    write(SHOW_CURSOR);
  }

  private async selectFallback<T>(
    title: string,
    options: SelectOption<T>[],
    defaultIndex: number
  ): Promise<T> {
    console.log();
    console.log(pc.bold(title));
    console.log();

    options.forEach((opt, idx) => {
      const num = pc.cyan(`[${idx + 1}]`);
      const defaultTag = idx === defaultIndex ? pc.dim(' (default)') : '';
      const desc = opt.description ? pc.dim(` - ${opt.description}`) : '';
      console.log(`  ${num} ${opt.label}${defaultTag}${desc}`);
    });

    console.log();

    while (true) {
      const raw = await this.ask(pc.bold('❯ Select option: '));
      if (!raw) {
        return options[defaultIndex]!.value;
      }
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= options.length) {
        return options[parsed - 1]!.value;
      }
      console.log(pc.yellow(`Please enter a number between 1 and ${options.length}.`));
    }
  }

  private renderRadio(
    title: string,
    options: SelectOption[],
    cursor: number,
    hint: string
  ): number {
    const lines: string[] = ['', pc.bold(title), pc.dim(hint), ''];
    for (let i = 0; i < options.length; i += 1) {
      const opt = options[i]!;
      const active = i === cursor;
      const marker = active ? pc.green('●') : pc.dim('○');
      const prefix = active ? pc.cyan('❯') : ' ';
      const label = active ? pc.bold(opt.label) : opt.label;
      const desc = opt.description ? pc.dim(`  ${opt.description}`) : '';
      lines.push(` ${prefix} ${marker} ${label}${desc}`);
    }
    lines.push('');
    write(lines.join('\n'));
    return lines.length;
  }

  private renderCheckbox(
    title: string,
    options: SelectOption[],
    cursor: number,
    checked: boolean[],
    hint: string
  ): number {
    const lines: string[] = ['', pc.bold(title), pc.dim(hint), ''];
    for (let i = 0; i < options.length; i += 1) {
      const opt = options[i]!;
      const active = i === cursor;
      const box = checked[i] ? pc.green('[x]') : pc.dim('[ ]');
      const prefix = active ? pc.cyan('❯') : ' ';
      const label = active ? pc.bold(opt.label) : opt.label;
      const desc = opt.description ? pc.dim(`  ${opt.description}`) : '';
      lines.push(` ${prefix} ${box} ${label}${desc}`);
    }
    lines.push('');
    write(lines.join('\n'));
    return lines.length;
  }

  private async runRadioMenu<T>(
    title: string,
    options: SelectOption<T>[],
    defaultIndex: number
  ): Promise<number> {
    this.pauseReadline();
    const hint = '↑/↓ navigate · Enter confirm · Esc cancel';
    let cursor = Math.min(Math.max(defaultIndex, 0), options.length - 1);
    write(HIDE_CURSOR);
    let painted = this.renderRadio(title, options, cursor, hint);

    return new Promise((resolve, reject) => {
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();
      readline.emitKeypressEvents(process.stdin);

      const finish = (fn: () => void) => {
        process.stdin.setRawMode(wasRaw ?? false);
        process.stdin.removeListener('keypress', onKeypress);
        eraseLines(painted);
        write(SHOW_CURSOR);
        fn();
      };

      const onKeypress = (_chunk: string, key?: readline.Key) => {
        if (!key) return;

        if (key.ctrl && key.name === 'c') {
          finish(() => reject(new InputCancelledError()));
          return;
        }
        if (key.name === 'escape') {
          finish(() => reject(new InputCancelledError()));
          return;
        }
        if (key.name === 'up' || key.name === 'k') {
          cursor = (cursor - 1 + options.length) % options.length;
          eraseLines(painted);
          painted = this.renderRadio(title, options, cursor, hint);
          return;
        }
        if (key.name === 'down' || key.name === 'j') {
          cursor = (cursor + 1) % options.length;
          eraseLines(painted);
          painted = this.renderRadio(title, options, cursor, hint);
          return;
        }
        if (key.name === 'return') {
          const chosen = options[cursor]!;
          finish(() => {
            console.log(`${pc.green('✓')} ${pc.bold(title.replace(/:$/, ''))}  ${pc.cyan(chosen.label)}`);
            resolve(cursor);
          });
        }
      };

      process.stdin.on('keypress', onKeypress);
    });
  }

  private async runCheckboxMenu<T>(
    title: string,
    options: SelectOption<T>[],
    initiallyChecked: boolean[]
  ): Promise<T[]> {
    this.pauseReadline();
    const hint = '↑/↓ navigate · Space toggle · Enter confirm · Esc cancel';
    let cursor = 0;
    const checked = options.map((_, i) => Boolean(initiallyChecked[i]));
    write(HIDE_CURSOR);
    let painted = this.renderCheckbox(title, options, cursor, checked, hint);

    return new Promise((resolve, reject) => {
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();
      readline.emitKeypressEvents(process.stdin);

      const finish = (fn: () => void) => {
        process.stdin.setRawMode(wasRaw ?? false);
        process.stdin.removeListener('keypress', onKeypress);
        eraseLines(painted);
        write(SHOW_CURSOR);
        fn();
      };

      const onKeypress = (_chunk: string, key?: readline.Key) => {
        if (!key) return;

        if (key.ctrl && key.name === 'c') {
          finish(() => reject(new InputCancelledError()));
          return;
        }
        if (key.name === 'escape') {
          finish(() => reject(new InputCancelledError()));
          return;
        }
        if (key.name === 'up' || key.name === 'k') {
          cursor = (cursor - 1 + options.length) % options.length;
          eraseLines(painted);
          painted = this.renderCheckbox(title, options, cursor, checked, hint);
          return;
        }
        if (key.name === 'down' || key.name === 'j') {
          cursor = (cursor + 1) % options.length;
          eraseLines(painted);
          painted = this.renderCheckbox(title, options, cursor, checked, hint);
          return;
        }
        if (key.name === 'space') {
          checked[cursor] = !checked[cursor];
          eraseLines(painted);
          painted = this.renderCheckbox(title, options, cursor, checked, hint);
          return;
        }
        if (key.name === 'return') {
          const values = options.filter((_, i) => checked[i]).map((opt) => opt.value);
          if (values.length === 0) {
            return;
          }
          finish(() => {
            const labels = options.filter((_, i) => checked[i]).map((opt) => opt.label);
            console.log(`${pc.green('✓')} ${pc.bold(title.replace(/:$/, ''))}  ${pc.cyan(labels.join(', '))}`);
            resolve(values);
          });
        }
      };

      process.stdin.on('keypress', onKeypress);
    });
  }

  private runChatEditor(hint?: string, completions: string[] = []): Promise<ChatAskResult> {
    return new Promise((resolve) => {
      let value = '';
      let historyIndex = this.chatHistory.length;
      const prompt = pc.cyan('❯ ');

      const paint = () => {
        write(`\r\x1b[2K${prompt}${value}`);
      };

      if (hint) {
        write(pc.dim(`${hint}\n`));
      }
      write(prompt);

      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      readline.emitKeypressEvents(process.stdin);

      const cleanup = () => {
        process.stdin.setRawMode(wasRaw ?? false);
        process.stdin.removeListener('keypress', onKeypress);
        write(SHOW_CURSOR);
      };

      const submit = (text: string, exit = false) => {
        cleanup();
        write('\n');
        const trimmed = text.trim();
        if (trimmed && !exit) {
          this.chatHistory.push(trimmed);
        }
        resolve({ text: trimmed, exit });
      };

      const onKeypress = (chunk: string, key?: readline.Key) => {
        if (key?.ctrl && key.name === 'c') {
          if (value.length > 0) {
            value = '';
            paint();
            return;
          }
          const now = Date.now();
          if (now - this.lastCtrlC < 1500) {
            submit('', true);
            return;
          }
          this.lastCtrlC = now;
          write(`\n${pc.dim('Press Ctrl+C again to exit.')}\n`);
          write(prompt);
          return;
        }

        if (key?.ctrl && key.name === 'd') {
          if (value.length === 0) {
            submit('', true);
          }
          return;
        }

        if (key?.name === 'return') {
          submit(value);
          return;
        }

        if (key?.name === 'backspace' || chunk === '\x7f' || chunk === '\u0008') {
          value = value.slice(0, -1);
          paint();
          return;
        }

        if (key?.name === 'up') {
          if (this.chatHistory.length === 0) return;
          historyIndex = Math.max(0, historyIndex - 1);
          value = this.chatHistory[historyIndex] ?? '';
          paint();
          return;
        }

        if (key?.name === 'down') {
          historyIndex = Math.min(this.chatHistory.length, historyIndex + 1);
          value = historyIndex >= this.chatHistory.length ? '' : (this.chatHistory[historyIndex] ?? '');
          paint();
          return;
        }

        if (key?.name === 'tab') {
          const prefix = value.trim();
          if (prefix.startsWith('/')) {
            const match = completions.find((c) => c.startsWith(prefix));
            if (match) {
              value = match;
              paint();
            }
          }
          return;
        }

        if (key?.name === 'left' || key?.name === 'right' || key?.name === 'home' || key?.name === 'end') {
          return;
        }

        if (chunk?.startsWith('\u001b')) {
          return;
        }

        if (chunk && chunk >= ' ') {
          value += chunk;
          write(chunk);
        }
      };

      process.stdin.on('keypress', onKeypress);
    });
  }
}
