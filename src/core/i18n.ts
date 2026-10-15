/**
 * Translation. Keys are the original English strings (same as the original `_()`),
 * so the original zh_cn dictionary is reused as-is and extended with src/i18n/zh-extra.json.
 * Supported languages: English (source) and Chinese.
 */
export type Language = 'en' | 'zh';
export type Dictionary = Record<string, string>;

export const LANGUAGES: Record<Language, string> = { en: 'English', zh: '简体中文' };

/** Parse an original lang/<code>/strings.js file: `_.setTranslation({...});` */
export function parseLegacyStrings(src: string): Dictionary {
  return JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
}

export function format(s: string, args: unknown[]): string {
  return s.replace(/\{([^}]+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m));
}

export class I18n {
  lang: Language = 'en';
  private dicts: Partial<Record<Language, Dictionary>> = {};

  /** merge entries into a language dictionary (later calls win) */
  addDictionary(lang: Language, dict: Dictionary): void {
    this.dicts[lang] = { ...(this.dicts[lang] ?? {}), ...dict };
  }

  setLanguage(lang: Language): void {
    this.lang = lang;
  }

  has(key: string): boolean {
    return this.lang === 'en' || key in (this.dicts[this.lang] ?? {});
  }

  /** translate + format; unknown keys fall back to the English source */
  t = (key: string, ...args: unknown[]): string => {
    if (key == null) return key;
    const dict = this.dicts[this.lang];
    const s = dict && dict[key] != null ? dict[key] : key;
    return args.length ? format(s, args) : s;
  };

  /** sentence-ending punctuation appropriate for the language */
  terminate(text: string): string {
    if (this.lang === 'zh') {
      return /[。！？…!?.」”]$/.test(text) ? text : text + '。';
    }
    return text.endsWith('.') ? text : text + '.';
  }
}
