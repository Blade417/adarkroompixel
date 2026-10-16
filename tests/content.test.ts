import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeGame } from './helpers';
import { ROOT } from '../src/node';

describe('original content loads unchanged', () => {
  const g = makeGame();
  const c = g.content.events;

  it('has every event group with the original counts', () => {
    expect(c.Global).toHaveLength(1);
    expect(c.Room).toHaveLength(10);
    expect(c.Outside).toHaveLength(6);
    expect(c.Marketing).toHaveLength(1);
    expect(c.Encounters).toHaveLength(11);
    expect(Object.keys(c.Setpieces)).toHaveLength(13);
    expect(Object.keys(c.Executioner)).toHaveLength(6);
  });

  it('has the original scene graphs', () => {
    const scenes = Object.values(c.Setpieces).reduce((n, e) => n + Object.keys(e.scenes).length, 0);
    expect(scenes).toBe(115);
    expect(c.Setpieces.city.title).toBe('A Ruined City');
    expect(Object.keys(c.Executioner['executioner-command'].scenes)).toContain('6');
  });

  it('resolves AudioLibrary and the Executioner enemy templates', () => {
    expect(g.content.audio.MUSIC_FIRE_ROARING).toMatch(/fire-roaring\.flac$/);
    expect(Object.keys(g.content.enemies.Executioner)).toEqual(['guard', 'quadruped', 'medic', 'turret']);
    expect(g.audioKey(c.Setpieces.cave.audio!)).toBe('LANDMARK_CAVE');
  });

  it('the core never touches the DOM', () => {
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
      .flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
    for (const f of walk(path.join(ROOT, 'src/core'))) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\b(document|window|localStorage|requestAnimationFrame)\b\s*[.(]/);
    }
  });
});

describe('English <=> Chinese', () => {
  it('translates the base game and the expansion (which the original never translated)', () => {
    const g = makeGame({ language: 'zh' });
    const c = g.content.events;
    expect(c.Room[0].title).toBe('行商');
    expect(c.Executioner['executioner-intro'].title).toBe('残破的战舰');
    expect(c.Executioner['executioner-command'].scenes['5'].text![2]).toBe('说它不会死');
    expect(g.t('the fire is {0}', g.t('roaring'))).toMatch(/火/);
  });

  it('formats and terminates messages per language', () => {
    const en = makeGame();
    expect(en.i18n.terminate('the fire is dead')).toBe('the fire is dead.');
    const zh = makeGame({ language: 'zh' });
    expect(zh.i18n.terminate('火熄灭了')).toBe('火熄灭了。');
    expect(zh.i18n.terminate('有声音了！')).toBe('有声音了！');
  });

  it('a new Chinese game greets the player in Chinese', () => {
    const g = makeGame({ language: 'zh' });
    g.start();
    const log = g.notifications.texts().join('\n');
    expect(log).toMatch(/房间/);
    expect(log).not.toMatch(/the room is/);
  });
});
