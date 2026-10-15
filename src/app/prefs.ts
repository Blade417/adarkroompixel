/** Device preferences (separate from the save game) and a safe localStorage wrapper. */
import { MemoryStorage, type StorageLike } from '../core/save';
import type { Language } from '../core/i18n';

export function browserStorage(): StorageLike {
  try {
    const k = '__emberveil_pixel_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return new MemoryStorage();
  }
}

/** 'system' follows prefers-reduced-motion; 'reduce' / 'full' override it */
export type MotionPref = 'system' | 'reduce' | 'full';

export interface Prefs {
  language: Language;
  sound: boolean;
  volume: number;
  motion: MotionPref;
}

/** this edition's own key (the 3D edition uses 'adr.webgl.prefs') */
export const PREFS_KEY = 'emberveil.pixel.prefs';

function detectLanguage(): Language {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return langs.some((l) => /^zh/i.test(l)) ? 'zh' : 'en';
}

export function loadPrefs(storage: StorageLike): Prefs {
  let saved: Partial<Prefs> = {};
  try {
    saved = JSON.parse(storage.getItem(PREFS_KEY) || '{}');
  } catch {
    saved = {};
  }
  return {
    language: saved.language === 'zh' || saved.language === 'en' ? saved.language : detectLanguage(),
    sound: saved.sound ?? true,
    volume: typeof saved.volume === 'number' ? saved.volume : 0.8,
    motion: saved.motion === 'reduce' || saved.motion === 'full' ? saved.motion : 'system'
  };
}

export function savePrefs(storage: StorageLike, prefs: Prefs): void {
  storage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/** effective reduced-motion flag for a preference and the system setting */
export function reducedMotion(pref: MotionPref, systemReduce: boolean): boolean {
  return pref === 'reduce' || (pref === 'system' && systemReduce);
}
