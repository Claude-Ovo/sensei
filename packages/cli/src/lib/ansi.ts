// 去掉 ANSI/OSC 控制序列，把终端流变成 agent 能读的纯文本。
// 保留 \n，把 \r 处理成"回车覆盖"（进度条最后一帧优先）。
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>NOM78HcDE]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

// 处理 \r：同一行内被 \r 覆盖的内容只留最后一次写入
export function normalizeCarriage(s: string): string {
  return s
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      const parts = line.split('\r');
      // 最后一个非空片段就是屏幕上最终显示的内容
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].length) return parts[i];
      return '';
    })
    .join('\n');
}

export function cleanTerminal(s: string): string {
  return normalizeCarriage(stripAnsi(s)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}
