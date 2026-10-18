import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifest from '../assets/pixel/expedition/v3/manifest.json';
import { EARLY_SITES, landmarkArt, SITE_ENEMY_ART, sitePresentation } from '../src/app/expedition-art';
import { Expedition } from '../src/app/expedition';
import { MemoryStorage, scriptedRng } from '../src/core';
import { TILE, WORLD } from '../src/core/data';
import { ROOT } from '../src/node';
import { expeditionState, makeGame, startGame } from './helpers';

function journey() {
  const storage = new MemoryStorage();
  const g = startGame(expeditionState({ stores: { torch: 4, rucksack: 1 } }), { storage });
  const ex = new Expedition(g); ex.open(); ex.pack('cured meat', 10); ex.pack('torch', 3); ex.depart();
  return { g, ex, storage };
}

describe('early location presentation', () => {
  it.each(Object.entries(EARLY_SITES))('uses the real %s event for entrance and interior presentation', (id, spec) => {
    const { g } = journey();
    g.events.startEvent(g.content.events.Setpieces[id]);
    expect(sitePresentation(g)).toMatchObject({ background: 'background', overlay: 'site-' + spec.art });
    if (id !== 'outpost') {
      g.rng = scriptedRng([.99]);
      expect(g.events.click('enter')).toBe(true);
      expect(sitePresentation(g)).toEqual({ background: spec.art + '-background', overlay: null, label: spec.label });
    }
  });

  it('does not put a random fight indoors just because it starts on a visited house tile', () => {
    const { g } = journey();
    g.world.state!.map[WORLD.RADIUS][WORLD.RADIUS] = TILE.HOUSE + '!';
    g.events.startEvent(g.content.events.Encounters[0]);
    expect(sitePresentation(g)).toBeNull();
  });

  it('restores the interior and its enemy without paying for a second torch', () => {
    const { g, storage } = journey();
    g.events.startEvent(g.content.events.Setpieces.ironmine);
    g.events.click('enter');
    const snapshot = g.events.snapshot(), outfit = { ...g.path.outfit };
    expect(outfit.torch).toBe(2);
    expect(g.events.active()!.combat!.enemy.hp).toBe(10);
    for (let i = 0; i < 20; i++) expect(sitePresentation(g)?.background).toBe('mine-background');
    expect(g.events.snapshot()).toEqual(snapshot);
    g.saveNow(); g.stop();
    const next = makeGame({ storage }); next.start();
    expect(sitePresentation(next)?.background).toBe('mine-background');
    expect(next.path.outfit).toEqual(outfit);
    expect(next.events.active()!.scene.enemy).toBe('beastly matriarch');
    expect(next.events.active()!.combat!.enemy.hp).toBe(10);
  });

  it('retains a cave scene after dungeon clearing converts the tile to an outpost', () => {
    const { g } = journey();
    g.events.startEvent(g.content.events.Setpieces.cave);
    g.events.loadScene('end1');
    expect(g.world.state!.map[WORLD.RADIUS][WORLD.RADIUS]).toBe(TILE.OUTPOST);
    expect(sitePresentation(g)?.background).toBe('cave-background');
    g.tick(1000); expect(g.events.click('leave')).toBe(true);
    expect(sitePresentation(g)).toBeNull();
  });

  it('provides distinct art for uncleared, visited and converted early landmarks', () => {
    for (const site of Object.values(EARLY_SITES)) {
      expect(landmarkArt(site.tile)).toBe('landmark-' + site.art);
      expect(landmarkArt(site.tile + '!')).toBe(landmarkArt(site.tile));
    }
    expect(landmarkArt(TILE.CITY)).toBeNull();
  });
});

describe('generated early-site production assets', () => {
  it('preserves source hashes and valid alpha-backed crops at their recorded aspect ratios', () => {
    for (const [file, source] of Object.entries(manifest.sources)) {
      const bytes = fs.readFileSync(path.join(ROOT, 'assets/pixel/expedition/v3', file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(source.size);
      if (source.hasAlpha) expect(source.transparentFraction).toBeGreaterThan(.2);
    }
    for (const spec of Object.values(manifest.assets)) {
      const source = manifest.sources[spec.file as keyof typeof manifest.sources];
      const [x, y, w, h] = spec.sourceRect, [dw, dh] = spec.drawSize;
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0); expect(h).toBeGreaterThan(0);
      expect(x + w).toBeLessThanOrEqual(source.size[0]);
      expect(y + h).toBeLessThanOrEqual(source.size[1]);
      expect(Math.abs(dw / dh / (w / h) - 1)).toBeLessThan(.06);
      expect(spec.hasAlpha).toBe(source.hasAlpha);
    }
  });

  it('covers every static enemy in house, cave and iron mine with all three visual poses', () => {
    const g = startGame(expeditionState());
    for (const id of ['house', 'cave', 'ironmine']) {
      for (const scene of Object.values(g.content.events.Setpieces[id].scenes)) {
        if (!scene.enemy) continue;
        const prefix = SITE_ENEMY_ART[scene.enemy];
        expect(prefix, scene.enemy).toBeTruthy();
        for (const pose of ['idle', 'attack', 'hurt']) expect(manifest.assets).toHaveProperty(prefix + '-' + pose);
      }
    }
  });
});
