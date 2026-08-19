// 把连续的终端输出按"安静 idleMs 或 攒够 maxBytes"切成 chunk。
export class Chunker {
  private buf = '';
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private readonly onFlush: (text: string) => void,
    private readonly idleMs = 400,
    private readonly maxBytes = 4096,
  ) {}
  push(s: string) {
    this.buf += s;
    if (this.buf.length >= this.maxBytes) return this.flush();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.idleMs);
  }
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.buf) return;
    const out = this.buf;
    this.buf = '';
    this.onFlush(out);
  }
}
