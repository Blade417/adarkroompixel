import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import manifest from '../assets/pixel/expedition/v4/manifest.json';
import earlyManifest from '../assets/pixel/expedition/v3/manifest.json';
import { Expedition } from '../src/app/expedition';
import { landmarkArt, MID_SITES, SITE_ENEMY_ART, sitePresentation } from '../src/app/expedition-art';
import { MemoryStorage, scriptedRng } from '../src/core';
import { SAVE_KEY } from '../src/core/save';
import { TILE, WORLD } from '../src/core/data';
import { ROOT } from '../src/node';
import { expeditionState, makeGame, startGame } from './helpers';

const R = WORLD.RADIUS;
function prepare(id: keyof typeof MID_SITES) {
  const state = expeditionState({ stores: { 's armour': 1, 'cargo drone': 1, waterskin: 1,
    rifle: 1, bullets: 60, medicine: 15, torch: 4 } });
  state.game.world.map[R + 1][R] = MID_SITES[id].tile;
  const storage = new MemoryStorage();
  const g = startGame(state, { storage });
  const ex = new Expedition(g);
  ex.open();
  for (const [item, n] of Object.entries({ 'cured meat': 10, rifle: 1, bullets: 60, medicine: 10, torch: 3 })) ex.pack(item, n);
  expect(ex.depart()).toBe(true);
  g.rng = scriptedRng([.1]);
  expect(ex.move('east')).toBe(true);
  return { g, ex, storage };
}

function resume(g: ReturnType<typeof startGame>, storage: MemoryStorage) {
  g.saveNow(); g.stop();
  const next = makeGame({ storage, rng: scriptedRng([.1]) }); next.start();
  const ex = new Expedition(next); ex.restore();
  expect(ex.paused).toBe(true);
  return { g: next, ex };
}

/** Legal combat actions only; never assign health, damage, rewards or victory flags. */
function winFight(g: ReturnType<typeof startGame>, ex: Expedition) {
  for (let step = 0; step < 120 && !g.events.active()?.afterCombat; step++) {
    const c = g.events.active()!.combat!;
    if (g.world.health <= 25) c.use('meds');
    ex.attack('rifle'); g.tick(500);
    expect(g.world.dead).toBe(false);
  }
  expect(g.events.active()?.afterCombat).toBe(true);
  g.tick(1500);
}

describe('middle expedition presentation and real mine progression', () => {
  it.each(Object.entries(MID_SITES))('keeps %s entrance and map identity independent of combat', (id, site) => {
    const { g } = prepare(id as keyof typeof MID_SITES);
    const snapshot = g.events.snapshot();
    expect(sitePresentation(g)).toEqual({ background: site.background, overlay: 'site-' + site.art, label: site.label });
    expect(landmarkArt(site.tile)).toBe('landmark-' + site.art);
    expect(landmarkArt(site.tile + '!')).toBe('landmark-' + site.art);
    for (let i = 0; i < 10; i++) sitePresentation(g);
    expect(g.events.snapshot()).toEqual(snapshot);
  });

  it.each(['coalmine', 'sulphurmine'] as const)('survives three %s fights, resumes each wave, commits once on return', id => {
    let { g, ex, storage } = prepare(id);
    const mine = id === 'coalmine' ? 'coal' : 'sulphur';
    expect(g.events.click('attack')).toBe(true);
    for (const wave of ['a1', 'a2', 'a3']) {
      expect(g.events.active()?.sceneName).toBe(wave);
      const old = g.events.active()!.combat!;
      const oldHealth = old.enemy.hp;
      expect(ex.attack('rifle')).toBe(true); g.tick(600);
      expect(old.enemy.hp).toBe(oldHealth - 5);
      const outfit = { ...g.path.outfit }, health = g.world.health;
      ({ g, ex } = resume(g, storage));
      expect(g.events.active()?.sceneName).toBe(wave);
      expect(g.events.active()?.combat?.enemy.hp).toBe(oldHealth - 5);
      expect(g.path.outfit).toEqual(outfit); expect(g.world.health).toBe(health);
      expect(sitePresentation(g)?.background).toBe('mine-yard-background');
      expect(ex.attack('rifle')).toBe(false);
      ex.paused = false; winFight(g, ex);
      const loot = { ...g.events.active()!.loot };
      ({ g, ex } = resume(g, storage));
      expect(g.events.active()?.loot).toEqual(loot);
      expect(g.events.active()?.afterCombat).toBe(true);
      ex.paused = false;
      expect(g.events.click('continue')).toBe(true);
    }
    expect(g.events.active()?.sceneName).toBe('cleared');
    expect(g.world.state![id]).toBe(true);
    expect(g.store.num(`game.buildings['${mine} mine']`)).toBe(0);
    const map = structuredClone(g.world.state!.map);
    ({ g, ex } = resume(g, storage)); ex.paused = false;
    expect(g.world.state!.map).toEqual(map);
    expect(g.events.click('leave')).toBe(true); expect(ex.move('west')).toBe(true);
    expect(g.store.num(`game.buildings['${mine} mine']`)).toBe(1);
    expect(g.outside.workers().map(w => w.name)).toContain(mine + ' miner');
    g.saveNow(); g.stop();
    const final = makeGame({ storage }); final.start();
    expect(final.store.num(`game.buildings['${mine} mine']`)).toBe(1);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).runtime?.expedition).toBeUndefined();
  });

  it.each(['coalmine', 'sulphurmine'] as const)('does not unlock %s after retreat or death', id => {
    let { g, ex, storage } = prepare(id);
    expect(g.events.click('attack')).toBe(true); winFight(g, ex);
    expect(g.events.click('run')).toBe(true); expect(ex.move('west')).toBe(true);
    const mine = id === 'coalmine' ? 'coal' : 'sulphur';
    expect(g.store.num(`game.buildings['${mine} mine']`)).toBe(0);
    ({ g, ex, storage } = prepare(id));
    expect(g.events.click('attack')).toBe(true);
    // Remain idle and let the original enemy kill the player.
    for (let n = 0; n < 100 && !g.world.dead; n++) g.tick(1000);
    expect(ex.phase).toBe('dead'); g.saveNow(); g.stop();
    const next = makeGame({ storage }); next.start();
    expect(next.store.num(`game.buildings['${mine} mine']`)).toBe(0);
    expect(next.path.outfit).toEqual({});
  });

  it('retains the town backdrop on its final screen after clearing creates an outpost', () => {
    const { g, storage } = prepare('town');
    g.events.loadScene('end1'); // Explicit terminal-branch fixture, not a natural route.
    expect(g.world.state!.map[R + 1][R]).toBe(TILE.OUTPOST);
    expect(sitePresentation(g)?.background).toBe('town-background');
    const loot = { ...g.events.active()!.loot };
    const next = resume(g, storage);
    expect(sitePresentation(next.g)?.background).toBe('town-background');
    expect(next.g.events.active()?.loot).toEqual(loot);
    next.ex.paused = false; next.g.tick(1500); next.g.events.click('leave');
    expect(sitePresentation(next.g)).toBeNull();
    expect(landmarkArt(next.g.world.state!.map[R + 1][R])).toBe('landmark-outpost');
  });

  it('keeps an unrelated encounter outdoors on a visited mine or town tile', () => {
    const { g } = prepare('coalmine'); g.events.click('leave');
    g.events.startEvent(g.content.events.Encounters[0]);
    expect(sitePresentation(g)).toBeNull();
    expect(landmarkArt(TILE.CACHE)).toBe('landmark-cache');
  });

  it.each([
    ['end1', ['a1','b1','c1','d1','end1'], [.1,.1,.1,.1,.1]],
    ['end2', ['a1','b2','c3','d1','end2'], [.1,.9,.9,.1,.9]],
    ['end3', ['a2','b3','c4','d2','end3'], [.9,.1,.1,.1,.1]],
    ['end4', ['a2','b4','c6','d2','end4'], [.9,.9,.9,.1,.9]],
    ['end5', ['a3','end5'], [.5,.9]],
    ['end6', ['a3','b5','end6'], [.5,.1,.9]],
    ['c2', ['a1','b2','c2','d1','end1'], [.1,.9,.1,.1,.1]],
    ['c5', ['a2','b4','c5','d2','end3'], [.9,.9,.1,.1,.1]]
  ] as const)('plays the town route through %s using original buttons and combat', (_name, route, rolls) => {
    let { g, ex, storage } = prepare('town');
    const torch = g.path.outfit.torch;
    for (let i = 0; i < route.length; i++) {
      if (g.events.active()?.combat) winFight(g, ex);
      else g.tick(1500); // Original non-combat loot scenes also have a leave/continue cooldown.
      const button = ['start','a1','a3'].includes(g.events.active()!.sceneName) ? 'enter' : 'continue';
      g.rng = scriptedRng([rolls[i]]);
      expect(g.events.click(button)).toBe(true);
      expect(g.events.active()?.sceneName).toBe(route[i]);
      expect(sitePresentation(g)?.background).toBe('town-background');
      const currentTorch = g.path.outfit.torch, loot = structuredClone(g.events.active()!.loot);
      ({ g, ex } = resume(g, storage)); ex.paused = false;
      expect(g.path.outfit.torch).toBe(currentTorch);
      expect(g.events.active()?.loot).toEqual(loot);
    }
    expect(g.path.outfit.torch).toBe(torch - (route[0] === 'a2' ? 0 : 1));
    expect(g.world.state!.map[R+1][R]).toBe(TILE.OUTPOST);
    g.tick(1500); expect(g.events.click('leave')).toBe(true);
    expect(ex.move('west')).toBe(true); expect(g.world.dead).toBe(false);
  });
});

describe('preserved middle-expedition art', () => {
  it('keeps hashes, transparent source bounds and proportional runtime crops verifiable', () => {
    for (const [file,source] of Object.entries(manifest.sources)) {
      const bytes=fs.readFileSync(path.join(ROOT,'assets/pixel/expedition/v4',file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      expect(bytes.subarray(1,4).toString()).toBe('PNG');
      expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual(source.size);
      if(source.hasAlpha) expect(source.transparentFraction).toBeGreaterThan(.2);
    }
    for(const spec of Object.values(manifest.assets)) {
      const source=manifest.sources[spec.file as keyof typeof manifest.sources];
      const [x,y,w,h]=spec.sourceRect,[dw,dh]=spec.drawSize;
      expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0);expect(h).toBeGreaterThan(0);
      expect(x+w).toBeLessThanOrEqual(source.size[0]);expect(y+h).toBeLessThanOrEqual(source.size[1]);
      expect(Math.abs(dw/dh/(w/h)-1)).toBeLessThan(.06);
      expect(spec.hasAlpha).toBe(source.hasAlpha);
    }
  });

  it('covers all static mine and town enemies, three poses, and entrance/map art', () => {
    const g=startGame(expeditionState()), art={...earlyManifest.assets,...manifest.assets};
    for(const [id,site] of Object.entries(MID_SITES)) {
      for(const scene of Object.values(g.content.events.Setpieces[id].scenes)) {
        if(!scene.enemy) continue;
        const rig=SITE_ENEMY_ART[scene.enemy];expect(rig,scene.enemy).toBeTruthy();
        for(const pose of ['idle','attack','hurt'])expect(art).toHaveProperty(rig+'-'+pose);
      }
      expect(art).toHaveProperty(site.background);
      expect(art).toHaveProperty('site-'+site.art);
      expect(art).toHaveProperty('landmark-'+site.art);
    }
    g.stop();
  });
});
