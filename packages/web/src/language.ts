export type Language = 'en' | 'zh';

export function resolveLanguage(saved: string | null, navigatorLanguage: string): Language {
  if (saved === 'en' || saved === 'zh') return saved;
  return /^zh(?:-|$)/i.test(navigatorLanguage) ? 'zh' : 'en';
}
