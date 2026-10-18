/** Browser-side content: the original scripts and dictionaries, bundled as raw text by Vite. */
import audioLibrary from '../../original/script/audioLibrary.js?raw';
import global from '../../original/script/events/global.js?raw';
import room from '../../original/script/events/room.js?raw';
import outside from '../../original/script/events/outside.js?raw';
import encounters from '../../original/script/events/encounters.js?raw';
import setpieces from '../../original/script/events/setpieces.js?raw';
import marketing from '../../original/script/events/marketing.js?raw';
import executioner from '../../original/script/events/executioner.js?raw';
import zhLegacy from '../../original/lang/zh_cn/strings.js?raw';
import zhExtra from '../i18n/zh-extra.json';
import zhEvents from '../i18n/zh-events.json';
import zhVillage from '../i18n/zh-village.json';
import zhExpedition from '../i18n/zh-expedition.json';
import zhEndgame from '../i18n/zh-endgame.json';
import { parseLegacyStrings, type Dictionary } from '../core/i18n';
import type { ContentSources } from '../core/types';

export const browserContent: ContentSources = { audioLibrary, global, room, outside, encounters, setpieces, marketing, executioner };

export const zhDictionaries: Dictionary[] = [parseLegacyStrings(zhLegacy), zhExtra as Dictionary, zhVillage, zhEvents, zhExpedition, zhEndgame];

/** AudioLibrary path ('audio/x.flac') -> served URL (the audio folder is Vite's public dir) */
export function audioUrl(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^audio\//, '');
}
