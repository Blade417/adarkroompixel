import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Expedition } from '../src/app/expedition';
import { EARLY_ENCOUNTERS } from '../src/app/expedition-catalog';
import { landmarkArt, SITE_ENEMY_ART, sitePresentation } from '../src/app/expedition-art';
import { MemoryStorage, scriptedRng } from '../src/core';
import { PRESTIGE_STORES, TILE, WORLD } from '../src/core/data';
import { ROOT } from '../src/node';
import { expeditionState, makeGame, startGame } from './helpers';
import v8 from '../assets/pixel/expedition/v8/manifest.json';

const wild=[
  {enemy:'shivering man',terrain:TILE.BARRENS,distance:11,hp:20},
  {enemy:'man-eater',terrain:TILE.FOREST,distance:11,hp:25},
  {enemy:'feral terror',terrain:TILE.FOREST,distance:21,hp:45}
];
const R=WORLD.RADIUS;
const inherited=PRESTIGE_STORES.map((_,i)=>i===0?123:i===4?7:0);
function prepare(tile: string = TILE.SWAMP, charm=1, previous=inherited) {
  const state=expeditionState({previous:{stores:previous},stores:{'kinetic armour':1,'cargo drone':1,waterskin:1,
    'plasma rifle':1,'energy cell':20,medicine:20,charm}});
  state.game.world.map[R+1][R]=tile;
  const storage=new MemoryStorage(),g=startGame(state,{storage,language:'zh'}),ex=new Expedition(g);ex.open();
  for(const [id,n] of Object.entries({'plasma rifle':1,'energy cell':20,medicine:20,'cured meat':12,charm}))ex.pack(id,n);
  expect(ex.depart()).toBe(true); g.rng=scriptedRng([.1]);return {g,ex,storage};
}
function resume(g:ReturnType<typeof startGame>,storage:MemoryStorage) {
  const events=g.events.snapshot(),outfit={...g.path.outfit};g.saveNow();g.stop();
  const next=makeGame({storage,language:'zh',rng:scriptedRng([.1])});next.start();const ex=new Expedition(next);ex.restore();
  expect(next.events.snapshot()).toEqual(events);expect(next.path.outfit).toEqual(outfit);expect(ex.paused).toBe(true);
  ex.paused=false;return {g:next,ex};
}

describe('remaining wild encounters keep original rules and real persistence',()=>{
  it.each(wild)('$enemy respects tier/terrain, completes real combat and deposits loot once',({enemy,terrain,distance,hp})=>{
    let {g,ex,storage}=prepare(terrain);
    const def=g.content.events.Encounters.find(e=>e.scenes.start.enemy===enemy)!;
    g.world.curPos=[R+distance,R];g.world.state!.map[R+distance][R]=terrain;
    expect(def.isAvailable?.()).toBe(true);expect(sitePresentation(g)).toBeNull();
    g.world.state!.map[R+distance][R]=TILE.FIELD;expect(def.isAvailable?.()).toBe(false);
    g.world.state!.map[R+distance][R]=terrain;g.events.startEvent(def);
    expect(g.events.active()!.combat!.enemy.hp).toBe(hp);expect(ex.attack('plasma rifle')).toBe(true);g.tick(100);
    const paid=g.path.outfit['energy cell'];({g,ex}=resume(g,storage));g.tick(150);
    expect(g.events.active()!.combat!.enemy.hp).toBe(hp-12);expect(g.path.outfit['energy cell']).toBe(paid);
    for(let i=0;i<8&&!g.events.active()!.afterCombat;i++) {g.tick(1000);ex.attack('plasma rifle');g.tick(250);}
    expect(g.events.active()!.afterCombat).toBe(true);expect(g.world.dead).toBe(false);
    const offered={...g.events.active()!.loot};({g,ex}=resume(g,storage));expect(g.events.active()!.loot).toEqual(offered);
    const item=Object.keys(offered)[0];expect(item).toBeTruthy();const count=g.events.takeAll(item);expect(count).toBeGreaterThan(0);
    ({g,ex}=resume(g,storage));expect(g.events.takeAll(item)).toBe(0);
    g.tick(1500);expect(g.events.click('leaveBtn')).toBe(true);
    // Explicit test position places this completed encounter one step from home, not a natural long trek.
    g.world.curPos=[R+1,R];const before=g.store.num('stores["'+item+'"]');expect(ex.move('west')).toBe(true);
    expect(g.store.num('stores["'+item+'"]')).toBe(before+count);g.stop();
  });
});

describe('swamp resident and inherited cache presentation',()=>{
  it('moves from swamp exterior to elder cabin and retains paid dialogue on reload',()=>{
    let {g,ex,storage}=prepare();ex.move('east');expect(sitePresentation(g)?.background).toBe('swamp-background');
    expect(sitePresentation(g)?.resident).toBeUndefined();g.events.click('enter');
    expect(sitePresentation(g)).toMatchObject({background:'swamp-cabin-background',resident:'swamp-elder',overlay:null});
    ({g,ex}=resume(g,storage));expect(g.events.click('talk')).toBe(true);expect(g.path.outfit.charm).toBe(0);
    const presentation=sitePresentation(g);({g,ex}=resume(g,storage));expect(sitePresentation(g)).toEqual(presentation);
    expect(g.hasPerk('gastronome')).toBe(true);expect(g.world.meatHeal()).toBe(16);expect(g.events.click('talk')).toBe(false);
    g.events.click('leave');ex.move('west');expect(g.store.get('game.world.map')[R+1][R]).toBe(TILE.SWAMP+'!');g.stop();
  });
  it('shows the same noncombat resident without inventing free dialogue when no charm is held',()=>{
    const {g,ex}=prepare(TILE.SWAMP,0);ex.move('east');g.events.click('enter');
    expect(sitePresentation(g)?.resident).toBe('swamp-elder');expect(g.events.click('talk')).toBe(false);
    expect(g.hasPerk('gastronome')).toBe(false);expect(g.events.active()?.combat).toBeNull();g.stop();
  });
  it('collects previous stores at the original moment, resumes exit, then returns without duplication',()=>{
    let {g,ex,storage}=prepare(TILE.CACHE);const before=g.store.num('stores.wood'),coal=g.store.num('stores.coal');
    ex.move('east');expect(sitePresentation(g)).toMatchObject({background:'barrens-background',overlay:'site-cache'});
    expect(g.events.click('enter')).toBe(true);expect(sitePresentation(g)?.background).toBe('cache-interior-background');
    ({g,ex}=resume(g,storage));expect(g.store.num('stores.wood')).toBe(before);expect(g.events.click('take')).toBe(true);
    expect(g.store.num('stores.wood')).toBe(before+123);expect(g.store.num('stores.coal')).toBe(coal+7);
    expect(g.store.get('previous.stores')).toEqual([]);expect(g.world.state!.map[R+1][R]).toBe(TILE.CACHE+'!');
    ({g,ex}=resume(g,storage));expect(sitePresentation(g)?.background).toBe('cache-interior-background');
    expect(g.events.click('take')).toBe(false);expect(g.store.num('stores.wood')).toBe(before+123);
    g.events.click('leave');ex.move('west');expect(g.store.num('stores.wood')).toBe(before+123);
    expect(g.store.get('game.world.map')[R+1][R]).toBe(TILE.CACHE+'!');g.stop();
  });
  it('leaving the cache before collection preserves inherited stores and an unvisited site',()=>{
    const {g,ex}=prepare(TILE.CACHE);ex.move('east');g.events.click('leave');ex.move('west');
    expect(g.store.get('previous.stores')).toEqual(inherited);expect(g.store.get('game.world.map')[R+1][R]).toBe(TILE.CACHE);g.stop();
  });
  it('an empty inherited cache cannot fabricate resources or gain a resident',()=>{
    const {g,ex}=prepare(TILE.CACHE,1,[]);const stores=structuredClone(g.store.get('stores'));
    ex.move('east');g.events.click('enter');g.events.click('take');expect(g.store.get('stores')).toEqual(stores);
    expect(sitePresentation(g)?.resident).toBeUndefined();g.stop();
  });
  it('does not reuse cabin/cache scenery for a random encounter on either visited tile',()=>{
    for(const tile of [TILE.CACHE,TILE.SWAMP]) {
      const {g}=prepare(tile);g.world.state!.map[R][R]=tile+'!';g.events.startEvent(g.content.events.Encounters[0]);
      expect(sitePresentation(g)).toBeNull();g.stop();
    }
    expect(landmarkArt(TILE.CACHE)).toBe('landmark-cache');expect(landmarkArt(TILE.CACHE+'!')).toBe('landmark-cache');
  });
});

describe('complete static enemy coverage and preserved v8 art',()=>{
  it('covers all eleven random encounters and every static world enemy in all three poses',()=>{
    const art:Record<string,unknown>={};
    for(let version=1;version<=8;version++)Object.assign(art,JSON.parse(fs.readFileSync(ROOT+`/assets/pixel/expedition/v${version}/manifest.json`,'utf8')).assets);
    const g=startGame(expeditionState(),{language:'zh'}),enemies=new Set<string>();
    for(const def of [...g.content.events.Encounters,...Object.values(g.content.events.Setpieces),...Object.values(g.content.events.Executioner)]) {
      for(const s of Object.values(def.scenes))if(s.enemy) {
        enemies.add(s.enemy);const prefix=SITE_ENEMY_ART[s.enemy]??EARLY_ENCOUNTERS.find(e=>e.id===s.enemy)?.art;
        expect(prefix,s.enemy).toBeTruthy();for(const pose of ['idle','attack','hurt'])expect(art).toHaveProperty(prefix+'-'+pose);
        expect(g.t(s.enemy)).toMatch(/[\u4e00-\u9fff]/);
      }
    }
    expect(g.content.events.Encounters).toHaveLength(11);expect(enemies.size).toBe(47);g.stop();
  });
  it('records all original sources, proportional crops and globally unique filenames',()=>{
    expect(Object.keys(v8.sources)).toHaveLength(7);expect(Object.keys(v8.assets)).toHaveLength(14);
    const names=new Set<string>();
    for(let version=2;version<=8;version++) {
      const m=JSON.parse(fs.readFileSync(ROOT+`/assets/pixel/expedition/v${version}/manifest.json`,'utf8'));
      for(const file of new Set<string>(Object.values(m.assets as Record<string,{file:string}>).map(s=>s.file))) {
        expect(names.has(file),file).toBe(false);names.add(file);
      }
    }
    for(const [file,source] of Object.entries(v8.sources)) {
      const bytes=fs.readFileSync(ROOT+'/assets/pixel/expedition/v8/'+file);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual(source.size);
      if(source.hasAlpha)expect(source.transparentFraction).toBeGreaterThan(.2);
    }
    for(const spec of Object.values(v8.assets)) {
      const [x,y,w,h]=spec.sourceRect,[dw,dh]=spec.drawSize,source=v8.sources[spec.file as keyof typeof v8.sources];
      expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);
      expect(x+w).toBeLessThanOrEqual(source.size[0]);expect(y+h).toBeLessThanOrEqual(source.size[1]);
      expect(Math.abs(dw/dh/(w/h)-1)).toBeLessThan(.065);
    }
  });
});
