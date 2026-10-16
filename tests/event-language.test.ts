import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import reviewed from '../src/i18n/zh-events.json';
import { ROOT } from '../src/node';
import { makeGame } from './helpers';

describe('reviewed village event language', () => {
  it('covers every static story, choice and notification in all 18 random events including the original cameo', () => {
    const keys = new Set<string>();
    for (const file of ['room', 'outside', 'global', 'marketing']) {
      const source = fs.readFileSync(path.join(ROOT, `original/script/events/${file}.js`), 'utf8');
      for (const match of source.matchAll(/_\(\s*(["'])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g)) {
        const key = match[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
        keys.add(key);
        expect(reviewed, key).toHaveProperty([key]);
      }
    }
    expect(keys.size).toBe(160);
  });

  it('preserves every scene, choice, cost, reward and probability while changing wording', () => {
    const en = makeGame().content.events, zh = makeGame({ language: 'zh' }).content.events;
    for (const group of ['Room', 'Outside', 'Global', 'Marketing'] as const) {
      expect(zh[group]).toHaveLength(en[group].length);
      en[group].forEach((event, i) => {
        const translated = zh[group][i];
        expect(Object.keys(translated.scenes)).toEqual(Object.keys(event.scenes));
        for (const [id, scene] of Object.entries(event.scenes)) {
          const other = translated.scenes[id];
          expect(other.reward).toEqual(scene.reward);
          expect(Object.keys(other.buttons ?? {})).toEqual(Object.keys(scene.buttons ?? {}));
          for (const [button, choice] of Object.entries(scene.buttons ?? {})) {
            expect(other.buttons![button].cost).toEqual(choice.cost);
            expect(other.buttons![button].reward).toEqual(choice.reward);
            expect(other.buttons![button].nextScene).toEqual(choice.nextScene);
          }
        }
      });
    }
  });
});
