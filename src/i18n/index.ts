/**
 * Tiny i18n: typed dictionaries, {var} interpolation, CLDR plurals via
 * Intl.PluralRules. The active language is module state; App re-renders the
 * tree when it changes.
 */
import de from './de';
import en from './en';
import es from './es';
import fr from './fr';
import it from './it';
import ru from './ru';
import zh from './zh';

export const LANGS = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  zh: '中文',
  ru: 'Русский',
} as const;

export type Lang = keyof typeof LANGS;
export type LangPref = Lang | 'auto';
export type Key = keyof typeof en;
type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Dict = { [K in Key]: (typeof en)[K] extends string ? string : Plural };

const dicts: Record<Lang, Dict> = { en, de, fr, it, es, zh, ru };

let current: Lang = 'en';

export function detectLang(prefs: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): Lang {
  for (const tag of prefs) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (base in LANGS) return base as Lang;
  }
  return 'en';
}

export const resolveLang = (pref: LangPref): Lang => (pref === 'auto' ? detectLang() : pref);

export function setLang(lang: Lang) {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
}

export const getLang = () => current;

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  let entry: string | Plural = dicts[current][key] ?? en[key];
  if (typeof entry !== 'string') {
    const rule = new Intl.PluralRules(current).select(Number(vars.n ?? 0));
    entry = entry[rule] ?? entry.other;
  }
  return entry.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return typeof v === 'number' ? v.toLocaleString(current) : String(v ?? '');
  });
}

/** locale-aware short date, e.g. "6 Oct" / "10月6日" */
export const fmtDate = (ms: number, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Date(ms).toLocaleDateString(current, opts);
