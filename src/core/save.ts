/** Save handling: original localStorage format, Base64 export codes and version migrations. */
import type { StateTree } from './store';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** in-memory storage (tests, or when localStorage is unavailable) */
export class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/**
 * This edition's own localStorage key. The original game and the 3D edition both use 'gameState',
 * so a same-origin preview of the pixel edition must never read or overwrite that slot.
 * The save format itself is unchanged (export codes stay compatible).
 */
export const SAVE_KEY = 'emberveil.pixel.save';
/** the original game's key, kept only so tests can assert the two never collide */
export const LEGACY_SAVE_KEY = 'gameState';
export const SAVE_VERSION = 1.3;

function utf8ToBinary(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function binaryToUtf8(s: string): string {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** same output as the original Base64.encode (UTF-8, standard alphabet) */
export function encodeSave(json: string): string {
  return btoa(utf8ToBinary(json)).replace(/\s/g, '').replace(/\./g, '');
}

/** decode an export code; returns null unless it is a plausible save */
export function decodeSave(code: string): StateTree | null {
  if (typeof code !== 'string') return null;
  const cleaned = code.replace(/\s/g, '').replace(/\./g, '');
  if (!cleaned) return null;
  try {
    const parsed = JSON.parse(binaryToUtf8(atob(cleaned)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!('stores' in parsed) && !('version' in parsed) && !('features' in parsed) && !('previous' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
