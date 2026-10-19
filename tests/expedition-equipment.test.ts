import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Expedition } from '../src/app/expedition';
import { ARMOUR_NAMES, ARMOUR_RIGS, WEAPON_RIGS, projectilePosition, visibleWeapon } from '../src/app/expedition-equipment';
import { WEAPON_ART } from '../src/app/expedition-catalog';
import { MemoryStorage, scriptedRng } from '../src/core';
import { WEAPONS } from '../src/core/data';
import { ROOT } from '../src/node';
import { expeditionState, makeGame, startGame } from './helpers';
import manifest from '../assets/pixel/expedition/v7/manifest.json';
import previous from '../assets/pixel/expedition/v2/manifest.json';

const late = ['bayonet','laser rifle','grenade','plasma rifle','energy blade','disruptor'];
const armourCases: {items: Record<string, number>; armour: string; hp: number}[] = [
  { items: {}, armour: 'none', hp: 10 },
  { items: { 'l armour': 1 }, armour: 'leather', hp: 15 },
  { items: { 'l armour': 1, 'i armour': 1 }, armour: 'iron', hp: 25 },
  { items: { 'l armour': 1, 'i armour': 1, 's armour': 1 }, armour: 'steel', hp: 45 },
  { items: { 's armour': 1, 'kinetic armour': 1 }, armour: 'kinetic', hp: 85 }
];
function prepare(weapons: Record<string, number>, armour: Record<string, number> = { 'kinetic armour': 1 }) {
  const storage = new MemoryStorage();
  const g = startGame(expeditionState({ stores: { ...armour, ...weapons, 'cargo drone': 1, 'cured meat': 6 } }), { storage, language: 'zh' });
  const ex = new Expedition(g); expect(ex.open()).toBe(true);
  for (const [id,n] of Object.entries({ ...weapons, 'cured meat': 6 })) ex.pack(id,n);
  expect(ex.depart()).toBe(true);
  g.events.startEvent(g.content.events.Executioner['executioner-command']); g.events.loadScene('6');
  g.rng = scriptedRng([.1]);
  return { g, ex, storage };
}
function reload(g: ReturnType<typeof startGame>, storage: MemoryStorage) {
  g.saveNow(); g.stop(); const next = makeGame({ storage, rng: scriptedRng([.1]), language: 'zh' }); next.start();
  const ex = new Expedition(next); ex.restore(); return { g: next, ex };
}

describe('equipment visuals follow actual ownership and attacks', () => {
  it.each(late)('preserves %s in flight after reload without repeating damage or payment', id => {
    let { g, ex, storage } = prepare({ [id]: 1, 'energy cell': 1 });
    const damage = WEAPONS[id].damage, duration = WEAPONS[id].type === 'ranged' ? 200 : 100;
    expect(ex.attack(id)).toBe(true); expect(ex.attack(id)).toBe(false);
    g.tick(duration/2);
    const outfit = { ...g.path.outfit }, combat = g.events.snapshot();
    ({ g, ex } = reload(g,storage));
    expect(ex.paused).toBe(true); expect(ex.attack(id)).toBe(false);
    expect(g.path.outfit).toEqual(outfit); expect(g.events.snapshot()).toEqual(combat);
    expect(visibleWeapon(ex)).toBe(id);
    g.tick(duration/2);
    const c = g.events.active()!.combat!;
    if (damage === 'stun') expect(c.enemy.stunned).toBe(true);
    else expect(c.enemy.hp).toBe(500-damage);
    g.tick(130); expect(g.path.outfit).toEqual(outfit);
    if(typeof damage === 'number') expect(c.enemy.hp).toBe(500-damage);
    g.stop();
  });

  it('shows the final shot, falls back to fists, then carries that fallback through another reload', () => {
    let { g, ex, storage } = prepare({ 'plasma rifle': 1, 'energy cell': 1 });
    ex.attack('plasma rifle'); expect(g.path.outfit['energy cell']).toBe(0);
    expect(ex.displayWeapon).toBe('fists'); expect(visibleWeapon(ex)).toBe('plasma rifle');
    g.tick(320); expect(visibleWeapon(ex)).toBe('fists');
    ({g,ex} = reload(g,storage)); expect(ex.lastStrike).toBeNull(); expect(visibleWeapon(ex)).toBe('fists');
    ex.paused=false; expect(ex.attack('plasma rifle')).toBe(false); expect(ex.attack('fists')).toBe(true); g.stop();
  });

  it('switches to the actual melee weapon after cells are exhausted and restores its pending finish', () => {
    let { g, ex, storage } = prepare({ 'laser rifle': 1, 'energy blade': 1, 'energy cell': 1 });
    ex.attack('laser rifle'); g.tick(400); expect(ex.displayWeapon).toBe('energy blade');
    ex.attack('energy blade'); g.tick(150);
    ({g,ex} = reload(g,storage)); expect(visibleWeapon(ex)).toBe('energy blade');
    const hp = g.events.active()!.combat!.enemy.hp; g.tick(170);
    expect(g.events.active()!.combat!.enemy.hp).toBe(hp); expect(g.path.outfit['energy cell']).toBe(0); g.stop();
  });

  it.each(armourCases)('keeps the original $armour ownership priority and $hp max HP after reload', ({items,armour,hp}) => {
    let {g,ex,storage}=prepare({bayonet:1},items); expect(g.path.armour()).toBe(armour); expect(g.world.getMaxHealth()).toBe(hp);
    ({g,ex}=reload(g,storage)); expect(g.path.armour()).toBe(armour); expect(g.world.health).toBe(hp);
    expect(g.t(ARMOUR_NAMES[armour])).toMatch(/[\u4e00-\u9fff]/); g.stop();
  });

  it('restores kinetic shielding, absorbs exactly one real hit, and respects its cooldown', () => {
    let {g,ex,storage}=prepare({bayonet:1});
    const c=g.events.active()!.combat!; expect(c.use('shield')).toBe(true); expect(c.use('shield')).toBe(false); g.tick(1000);
    ({g,ex}=reload(g,storage)); expect(g.events.active()!.combat!.player.status).toBe('shield');
    g.tick(1200); expect(g.world.health).toBe(85); expect(g.events.active()!.combat!.player.status).toBe('none');
    g.tick(2000); expect(g.world.health).toBe(73); expect(g.events.active()!.combat!.use('shield')).toBe(false); g.stop();
  });
});

describe('complete equipment art and restrained feedback', () => {
  it('covers every damaging or stunning weapon and all armour poses with bounded proportional assets', () => {
    const assets: Record<string, unknown>={...previous.assets,...manifest.assets};
    for(const id of Object.keys(WEAPONS).filter(id=>id!=='fists')) {
      expect(assets).toHaveProperty(WEAPON_ART[id]); expect(WEAPON_RIGS).toHaveProperty(id);
    }
    for(const [armour,rig] of Object.entries(ARMOUR_RIGS)) {
      for(const pose of ['idle','attack','hurt'])expect(assets).toHaveProperty(rig+'-'+pose);
      for(const direction of ['north','south','east'])expect(assets).toHaveProperty((armour==='none'?'':rig+'-')+'map-'+direction);
    }
    expect(Object.keys(manifest.assets)).toHaveLength(30);
    for(const [file,source] of Object.entries(manifest.sources)) {
      const bytes=fs.readFileSync(ROOT+'/assets/pixel/expedition/v7/'+file);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual(source.size);
      expect(source.transparentFraction).toBeGreaterThan(.2);
    }
    for(const spec of Object.values(manifest.assets)) {
      const source=manifest.sources[spec.file as keyof typeof manifest.sources];
      const [x,y,w,h]=spec.sourceRect,[dw,dh]=spec.drawSize;
      expect(x).toBeGreaterThan(0);expect(y).toBeGreaterThan(0);
      expect(x+w).toBeLessThan(source.size[0]);expect(y+h).toBeLessThan(source.size[1]);
      expect(Math.abs(dw/dh/(w/h)-1)).toBeLessThan(.1);
    }
  });

  it('keeps thrown arcs and rotation out of reduced motion without hiding attack identity', () => {
    expect(projectilePosition(.5,'grenade',false).y).toBe(-36);
    for(const kind of ['grenade','bolas','laser','plasma','disruptor','bullet'] as const) {
      expect(projectilePosition(.5,kind,true)).toEqual({x:.75,y:0,angle:0});
      expect(projectilePosition(-1,kind,false).x).toBe(0); expect(projectilePosition(2,kind,false).x).toBe(1);
    }
  });
});
