import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifest from '../assets/pixel/expedition/v6/manifest.json';
import v2 from '../assets/pixel/expedition/v2/manifest.json';
import v3 from '../assets/pixel/expedition/v3/manifest.json';
import v4 from '../assets/pixel/expedition/v4/manifest.json';
import v5 from '../assets/pixel/expedition/v5/manifest.json';
import { SITE_ENEMY_ART, WARSHIP_BACKGROUNDS, sitePresentation } from '../src/app/expedition-art';
import { Expedition } from '../src/app/expedition';
import { ROOT } from '../src/node';
import { expeditionState, startGame } from './helpers';

describe('battleship accepted art and event identity', () => {
  it('preserves source hashes, dimensions, alpha and proportional bounded crops', () => {
    expect(Object.keys(manifest.assets)).toHaveLength(53);
    for (const [file, source] of Object.entries(manifest.sources)) {
      const bytes = fs.readFileSync(path.join(ROOT, 'assets/pixel/expedition/v6', file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(source.size);
      if (source.hasAlpha) expect(source.transparentFraction).toBeGreaterThan(.2);
    }
    for (const spec of Object.values(manifest.assets)) {
      const source = manifest.sources[spec.file as keyof typeof manifest.sources];
      const [x,y,w,h] = spec.sourceRect, [dw,dh] = spec.drawSize;
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0); expect(h).toBeGreaterThan(0);
      expect(x+w).toBeLessThanOrEqual(source.size[0]); expect(y+h).toBeLessThanOrEqual(source.size[1]);
      expect(Math.abs(dw/dh/(w/h)-1)).toBeLessThan(.06); expect(spec.hasAlpha).toBe(source.hasAlpha);
    }
    const files = [v2,v3,v4,v5,manifest].flatMap(m => Object.keys(m.sources));
    expect(new Set(files).size).toBe(files.length);
  });

  it('covers all sixteen original battleship enemies with three poses and translated names', () => {
    const g = startGame(expeditionState(), { language: 'zh' }), names = new Set<string>();
    for (const event of Object.values(g.content.events.Executioner)) for (const sc of Object.values(event.scenes)) {
      if (!sc.enemy) continue; names.add(sc.enemy);
      for (const pose of ['idle','attack','hurt']) expect(manifest.assets).toHaveProperty(SITE_ENEMY_ART[sc.enemy]+'-'+pose);
      expect(g.t(sc.enemyName ?? sc.enemy)).toMatch(/[\u4e00-\u9fff]/);
    }
    expect(names.size).toBe(16); g.stop();
  });

  it('resolves each deck from its event through every scene, including cleared-map endings', () => {
    const g = startGame(expeditionState()), ex = new Expedition(g);
    ex.open(); ex.pack('cured meat',10); ex.depart();
    for (const [id, background] of Object.entries(WARSHIP_BACKGROUNDS)) {
      expect(manifest.assets).toHaveProperty(background);
      g.events.startEvent(g.content.events.Executioner[id]);
      for (const scene of Object.keys(g.content.events.Executioner[id].scenes)) {
        g.events.loadScene(scene); const before = g.events.snapshot();
        expect(sitePresentation(g)).toEqual({ background, overlay: null, label: '残破战舰' });
        expect(g.events.snapshot()).toEqual(before);
      }
      g.events.endEvent();
    }
    g.events.startEvent(g.content.events.Encounters[0]); expect(sitePresentation(g)).toBeNull(); g.stop();
  });
});
