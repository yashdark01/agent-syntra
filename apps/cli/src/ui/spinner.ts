import pc from 'picocolors';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private label = '';
  private active = false;

  public start(label: string): void {
    this.stop();
    this.label = label;
    this.frame = 0;
    this.active = true;

    if (!process.stdout.isTTY) {
      process.stdout.write(`${label}\n`);
      return;
    }

    process.stdout.write(`${pc.cyan(FRAMES[0])} ${pc.dim(this.label)}`);
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % FRAMES.length;
      process.stdout.write(`\r\x1b[2K${pc.cyan(FRAMES[this.frame])} ${pc.dim(this.label)}`);
    }, 80);
  }

  public stop(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (process.stdout.isTTY) {
      process.stdout.write('\r\x1b[2K');
    }
  }
}
