/**
 * Node-side loaders for the original content and dictionaries (tests and tools).
 * The browser build imports the same files with Vite `?raw`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLegacyStrings, type Dictionary } from './core/i18n';
import type { ContentSources } from './core/types';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINAL = path.join(ROOT, 'original');

const read = (p: string) => fs.readFileSync(path.join(ORIGINAL, p), 'utf8');

export function nodeContent(): ContentSources {
  return {
    audioLibrary: read('script/audioLibrary.js'),
    global: read('script/events/global.js'),
    room: read('script/events/room.js'),
    outside: read('script/events/outside.js'),
    encounters: read('script/events/encounters.js'),
    setpieces: read('script/events/setpieces.js'),
    marketing: read('script/events/marketing.js'),
    executioner: read('script/events/executioner.js')
  };
}

export function nodeZhDictionaries(): Dictionary[] {
  return [
    parseLegacyStrings(read('lang/zh_cn/strings.js')),
    JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/zh-extra.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/zh-village.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/zh-events.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/zh-expedition.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/zh-endgame.json'), 'utf8'))
  ];
}
