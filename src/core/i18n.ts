import type { GameData, Lang } from '../contracts';

/** t(key, {n: 3}) -> looks up the key in the active language, falls back to English, then to the key. */
export function createTranslator(data: GameData, lang: () => Lang) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const s = data.i18n[lang()][key] ?? data.i18n.en[key] ?? key;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
  };
}
