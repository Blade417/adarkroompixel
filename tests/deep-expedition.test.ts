import { describe, expect, it } from 'vitest';
import { Expedition } from '../src/app/expedition';
import { DEEP_SITES, landmarkArt, sitePresentation } from '../src/app/expedition-art';
import { MemoryStorage, scriptedRng } from '../src/core';
import type { GameEventDef } from '../src/core/types';
import { TILE, WORLD } from '../src/core/data';
import { expeditionState, makeGame, startGame } from './helpers';

const R = WORLD.RADIUS;
function prepare(id: keyof typeof DEEP_SITES) {
  const state = expeditionState({ stores: { 'kinetic armour': 1, 'cargo drone': 1, waterskin: 1,
    rifle: 1, bullets: 90, medicine: 35, torch: 4, charm: 1 } });
  state.game.world.map[R + 1][R] = DEEP_SITES[id].tile;
  const storage = new MemoryStorage(), g = startGame(state, { storage });
  const ex = new Expedition(g); ex.open();
  for (const [item,n] of Object.entries({ 'cured meat': 15, rifle: 1, bullets: 90, medicine: 30, torch: 3, charm: 1 })) ex.pack(item,n);
  expect(ex.depart()).toBe(true); g.rng = scriptedRng([.1]); expect(ex.move('east')).toBe(true);
  return { g, ex, storage };
}
function resume(g: ReturnType<typeof startGame>, storage: MemoryStorage) {
  const snapshot = g.events.snapshot(), outfit = { ...g.path.outfit }, hp = g.world.health;
  g.saveNow(); g.stop(); const next = makeGame({ storage, rng: scriptedRng([.1]) }); next.start();
  const ex = new Expedition(next); ex.restore();
  expect(ex.paused).toBe(g.active === 'world'); expect(next.events.snapshot()).toEqual(g.world.dead ? [] : snapshot);
  expect(next.path.outfit).toEqual(outfit);
  if(g.active === 'world') expect(next.world.health).toBe(hp);
  ex.paused = false; return { g: next, ex };
}
function win(g: ReturnType<typeof startGame>, ex: Expedition) {
  g.rng = scriptedRng([.1]);
  for (let i=0;i<200 && !g.events.active()?.afterCombat;i++) {
    const c=g.events.active()!.combat!;
    if(g.world.health<=65)c.use('meds');
    if(g.world.health<=45)c.use('eat');
    ex.attack('rifle'); g.tick(500); expect(g.world.dead).toBe(false);
  }
  expect(g.events.active()?.afterCombat).toBe(true);
  g.tick(7500);
  while(g.world.health<=65 && g.events.active()!.combat!.use('meds')) { /* Original victory healing, zero cooldown. */ }
}

type Step = { button: string; roll: number; scene: string };
/** Enumerate real buttons and probability intervals; no scene loading or combat flag assignment. */
function allRoutes(def: GameEventDef, terminal: (id:string)=>boolean): Step[][] {
  const routes: Step[][] = [];
  const walk = (id:string, path:Step[]) => {
    if(terminal(id)) { routes.push(path); return; }
    for(const [button,b] of Object.entries(def.scenes[id].buttons??{})) {
      if(!b.nextScene || b.nextScene==='end')continue;
      let lower=0;
      for(const [threshold,scene] of Object.entries(b.nextScene).sort((a,b)=>Number(a[0])-Number(b[0]))) {
        const roll=(lower+Number(threshold))/2; lower=Number(threshold);
        walk(scene,[...path,{button,roll,scene}]);
      }
    }
  };
  walk('start',[]); return routes;
}
const probe=startGame(expeditionState());
const cityDef=probe.content.events.Setpieces.city;
const candidates=allRoutes(cityDef,id=>/^end\d+$/.test(id));
const uncovered=new Set(Object.keys(cityDef.scenes).filter(id=>id!=='start'));
const cityRoutes:Step[][]=[];
while(uncovered.size) {
  candidates.sort((a,b)=>b.filter(s=>uncovered.has(s.scene)).length-a.filter(s=>uncovered.has(s.scene)).length);
  const best=candidates.shift(); if(!best || !best.some(s=>uncovered.has(s.scene)))throw Error('Unreachable city scene');
  cityRoutes.push(best); best.forEach(s=>uncovered.delete(s.scene));
}
const introRoutes=allRoutes(probe.content.events.Executioner['executioner-intro'],id=>id==='7');
probe.stop();

describe('city branches and resumable deep progression',()=>{
  it.each(cityRoutes.map((route,i)=>({name:`route ${i+1}: ${route.map(s=>s.scene).join(' / ')}`,route})))('$name',({route})=>{
    let {g,ex,storage}=prepare('city'); let torch=3;
    for(const step of route) {
      if(g.events.active()?.combat) {
        const hp=g.events.active()!.combat!.enemy.hp;
        g.rng=scriptedRng([.1]); expect(ex.attack('rifle')).toBe(true); g.tick(600);
        expect(g.events.active()!.combat!.enemy.hp).toBe(hp-5);
        ({g,ex}=resume(g,storage)); win(g,ex);
      } else g.tick(1500);
      const cost=g.events.active()!.scene.buttons![step.button].cost?.torch??0;
      g.rng=scriptedRng([step.roll,.1]); expect(g.events.click(step.button)).toBe(true);
      torch-=cost; expect(g.path.outfit.torch).toBe(torch);
      expect(g.events.active()?.sceneName).toBe(step.scene);
      const presentation=sitePresentation(g); expect(presentation?.overlay).toBeNull();
      const snapshot=g.events.snapshot(); for(let i=0;i<5;i++)sitePresentation(g);
      expect(g.events.snapshot()).toEqual(snapshot);
      ({g,ex}=resume(g,storage)); expect(sitePresentation(g)).toEqual(presentation);
    }
    expect(g.world.state!.map[R+1][R]).toBe(TILE.OUTPOST);
    expect(g.store.get('game.world.map')[R+1][R]).toBe(TILE.CITY);
    g.tick(1500); expect(g.events.click('leave')).toBe(true); expect(ex.move('west')).toBe(true);
    expect(g.store.get('game.world.map')[R+1][R]).toBe(TILE.OUTPOST); g.stop();
  });

  it('covers every city scene and all fifteen endings with the executed route set',()=>{
    expect(new Set(['start',...cityRoutes.flatMap(r=>r.map(s=>s.scene))])).toEqual(new Set(Object.keys(cityDef.scenes)));
    expect(new Set(cityRoutes.map(r=>r.at(-1)!.scene)).size).toBe(15);
  });

  it.each(['battlefield','borehole'] as const)('preserves %s loot and visited state and deposits salvage once',id=>{
    let {g,ex,storage}=prepare(id);
    expect(g.world.state!.map[R+1][R]).toBe(DEEP_SITES[id].tile+'!');
    expect(g.events.take('alien alloy',1)).toBe(1);
    const remaining=g.events.active()!.loot?.['alien alloy'];
    ({g,ex}=resume(g,storage)); expect(g.events.active()!.loot?.['alien alloy']).toBe(remaining);
    expect(g.path.outfit['alien alloy']).toBe(1); g.tick(1500); g.events.click('leave'); ex.move('west');
    expect(g.store.num('stores["alien alloy"]')).toBe(1);
    ({g,ex}=resume(g,storage)); expect(g.store.num('stores["alien alloy"]')).toBe(1);
    expect(g.store.get('game.world.map')[R+1][R]).toBe(DEEP_SITES[id].tile+'!'); g.stop();
  });

  it('finds the ship without unlocking its village screen until a living return',()=>{
    let {g,ex,storage}=prepare('ship');
    expect(g.world.state!.ship).toBe(true); expect(g.store.get('features.location.spaceShip')).toBeFalsy();
    ({g,ex}=resume(g,storage)); expect(g.store.get('features.location.spaceShip')).toBeFalsy();
    expect(g.events.click('leavel')).toBe(true); expect(ex.move('west')).toBe(true);
    expect(g.store.get('features.location.spaceShip')).toBe(true); g.stop();
  });

  it('pays one charm in the swamp, resumes the learned perk and commits visited state on return',()=>{
    let {g,ex,storage}=prepare('swamp');
    expect(g.events.click('enter')).toBe(true); ({g,ex}=resume(g,storage));
    expect(g.path.outfit.charm).toBe(1); expect(g.events.click('talk')).toBe(true);
    expect(g.path.outfit.charm).toBe(0); expect(g.hasPerk('gastronome')).toBe(true);
    expect(g.world.meatHeal()).toBe(16); ({g,ex}=resume(g,storage));
    expect(g.path.outfit.charm).toBe(0); expect(g.hasPerk('gastronome')).toBe(true);
    g.events.click('leave'); ex.move('west');
    expect(g.store.get('game.world.map')[R+1][R]).toBe(TILE.SWAMP+'!'); g.stop();
  });

  it.each(introRoutes.map((route,i)=>({name:`battleship introductory route ${i+1}`,route})))('$name',({route})=>{
    let {g,ex,storage}=prepare('executioner');
    for(const step of route) {
      if(g.events.active()?.combat)win(g,ex); else g.tick(1500);
      g.rng=scriptedRng([step.roll,.1]); expect(g.events.click(step.button)).toBe(true);
      expect(g.events.active()?.sceneName).toBe(step.scene);
      expect(sitePresentation(g)?.background).toBe('warship-corridor-background');
      ({g,ex}=resume(g,storage)); expect(g.path.outfit.torch).toBe(2);
    }
    expect(g.world.state!.executioner).toBe(true); expect(g.store.get('features.location.fabricator')).toBeFalsy();
    expect(g.events.click('leave')).toBe(true); expect(ex.move('west')).toBe(true);
    expect(g.store.get('features.location.fabricator')).toBe(true);
    ({g,ex}=resume(g,storage)); expect(g.store.get('features.location.fabricator')).toBe(true); g.stop();
  });

  it.each(['ship','executioner'] as const)('does not commit the discovered %s unlock on death',id=>{
    let {g,ex,storage}=prepare(id);
    if(id==='executioner')g.events.loadScene('7'); // Explicit discovery-state death fixture.
    g.world.die(); ({g,ex}=resume(g,storage));
    expect(g.store.get(id==='ship'?'features.location.spaceShip':'features.location.fabricator')).toBeFalsy();
    expect(g.path.outfit).toEqual({}); g.stop();
  });

  it.each(Object.entries(DEEP_SITES))('provides %s map/entrance identity without mutating original state',(id,site)=>{
    const {g}=prepare(id as keyof typeof DEEP_SITES), snapshot=g.events.snapshot();
    expect(landmarkArt(site.tile)).toBe('landmark-'+site.art);
    expect(landmarkArt(site.tile+'!')).toBe('landmark-'+site.art);
    expect(sitePresentation(g)).toEqual({background:site.background,overlay:id==='swamp'?null:'site-'+site.art,label:site.label});
    for(let i=0;i<5;i++)sitePresentation(g); expect(g.events.snapshot()).toEqual(snapshot);
    g.events.endEvent(); g.events.startEvent(g.content.events.Encounters[0]); expect(sitePresentation(g)).toBeNull(); g.stop();
  });
});
