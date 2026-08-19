// 本地脱敏：任何东西离开机器之前先过这一层。宁可多删，不可漏。
const RULES: Array<[RegExp, string]> = [
  // 常见 API key / token 形态
  [/\b(sk|rk|pk)_(live|test|proj)?_?[A-Za-z0-9]{16,}\b/g, '<REDACTED_KEY>'],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, '<REDACTED_KEY>'],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, '<REDACTED_KEY>'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '<REDACTED_KEY>'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g, '<REDACTED_KEY>'],
  [/\bya29\.[A-Za-z0-9._-]{20,}\b/g, '<REDACTED_KEY>'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '<REDACTED_JWT>'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1<REDACTED_TOKEN>'],
  // KEY=value / "key": "value" 形态里的敏感值
  [/((?:api[_-]?key|secret|token|passw(?:or)?d|authorization)\s*[=:]\s*["']?)(?!Bearer\b|Basic\b)[^\s"'&]{6,}/gi, '$1<REDACTED>'],
  // 邮箱
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<EMAIL>'],
  // 私网 IP 保留，公网 IPv4 打码
  [/\b(?!10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<IP>'],
];

export function makeRedactor(extraSecrets: string[] = []) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const user = process.env.USERNAME || process.env.USER || '';
  const secrets = extraSecrets.filter((s) => s && s.length >= 6);
  return (input: string): string => {
    let s = input;
    for (const sec of secrets) s = s.split(sec).join('<REDACTED>');
    for (const [re, rep] of RULES) s = s.replace(re, rep);
    if (home) {
      s = s.split(home).join('~');
      s = s.split(home.replace(/\\/g, '/')).join('~');
    }
    if (user && user.length >= 3) {
      s = s.replace(new RegExp(`(?<=[\\\\/])${escapeRe(user)}(?=[\\\\/])`, 'g'), '<USER>');
    }
    return s;
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
