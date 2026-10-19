import { describe, expect, it } from 'vitest';
import { settlementGoal } from '../src/app/progression';
import { Expedition } from '../src/app/expedition';
import { Endgame } from '../src/app/endgame';
import { ForestJourney } from '../src/app/forest';
import { MemoryStorage, scriptedRng } from '../src/core';
import { economyRows, goalContents } from '../src/ui/economy';
import { missingKeys, uiStrings } from '../src/ui/strings';
import { expeditionState, makeGame, startGame, villageState } from './helpers';

function equipped(extra = {}) {
  return expeditionState({
    game: { buildings: { cart: 1, trap: 1, hut: 3, lodge: 1, tannery: 1, smokehouse: 1, workshop: 1 }, population: 8 },
    stores: { compass: 1, waterskin: 1, rucksack: 1, 'bone spear': 1, 'cured meat': 15, leather: 250, scales: 20 },
    ...extra
  });
}

describe('continuous progression from preparation to ascent', () => {
  it.each([
    { cask: 1, wagon: 1, 'iron sword': 1 },
    { 'water tank': 1, convoy: 1, 'steel sword': 1 },
    { 'fluid recycler': 1, 'cargo drone': 1, 'energy blade': 1 },
    { cask: 1, wagon: 1, rifle: 1, bullets: 1 }
  ])('accepts usable advanced equipment without replacing early versions: %j', gear => {
    const g = startGame(expeditionState({ stores: { ...gear, 'cured meat': 10 } }));
    expect(settlementGoal(g)).toMatchObject({ id: 'ready', target: 'expedition' });
    for (const id of ['waterskin','rucksack','bone spear']) expect(g.store.num(`stores["${id}"]`)).toBe(0);
    g.stop();
  });

  it.each([{ rifle:1,bullets:0 },{ bolas:1 },{ grenade:1 }])('does not count empty or utility-only loadouts as a usable primary weapon: %j', gear => {
    const g = startGame(equipped({ stores: { compass:1,waterskin:1,rucksack:1,'cured meat':10, ...gear } }));
    expect(settlementGoal(g).id).toBe('weapon'); g.stop();
  });

  it('sends an empty cold home to wood first, then to a real relight action', () => {
    const g = startGame(villageState({ game:{fire:{value:0,text:'dead'}},stores:{wood:0} }));
    expect(settlementGoal(g)).toMatchObject({ id:'rekindle',target:'forest',missing:{wood:5} });
    const journey=new ForestJourney(g); journey.travel('outside'); journey.gather('branches'); journey.gather('deadwood');
    expect(settlementGoal(g)).toMatchObject({ id:'rekindle',target:'fire',missing:{} });
    journey.travel('room'); expect(g.room.tendFire()).toBe(true); expect(g.store.num('stores.wood')).toBe(1);
    g.store.set('game.temperature',{value:0,text:'freezing'});g.store.set('stores.wood',30);
    expect(g.room.build('cart')).toBe(false);expect(settlementGoal(g).id).toBe('warm');
    g.tick(60000);expect(settlementGoal(g).id).toBe('cart');
    g.stop();
  });

  it('advances after a real expedition return and restores the suggestion without new quest flags', () => {
    const storage=new MemoryStorage(), g=startGame(equipped(),{storage,rng:scriptedRng([.99])});
    expect(settlementGoal(g).id).toBe('ready');
    const ex=new Expedition(g); ex.open(); ex.pack('cured meat',2); ex.pack('bone spear',1); ex.depart();
    expect(ex.move('east')).toBe(true); expect(ex.move('west')).toBe(true); ex.close();
    expect(settlementGoal(g)).toMatchObject({ id:'armour',target:'craft',item:'l armour' });
    g.saveNow();g.stop();const resumed=makeGame({storage});resumed.start();
    expect(settlementGoal(resumed).id).toBe('armour');resumed.stop();
  });

  it('follows discovered mines, production, containers and steel without exposing hidden map locations', () => {
    const g=startGame(equipped({stores:{compass:1,waterskin:1,rucksack:1,'bone spear':1,'cured meat':10,'l armour':1,wood:2000,leather:250}}));
    g.store.set('game.pixel.expeditionView',{trail:[[30,30],[31,30],[30,30]]});
    expect(settlementGoal(g).id).toBe('scout');
    // A hidden generated mine on the map does not enable jobs or change the suggestion.
    g.store.set('game.world.map[35][30]','I');expect(settlementGoal(g).id).toBe('scout');
    g.store.set('game.buildings["iron mine"]',1);expect(settlementGoal(g)).toMatchObject({id:'ironWorkers',target:'workers'});
    g.store.set('game.workers["iron miner"]',1);expect(settlementGoal(g)).toMatchObject({id:'ironWeapon',target:'workers',missing:{iron:20}});
    g.store.set('stores.iron',20);expect(settlementGoal(g)).toMatchObject({id:'ironWeapon',target:'craft'});
    g.store.set('stores["iron sword"]',1);expect(settlementGoal(g).id).toBe('cask');
    g.store.set('stores.cask',1);expect(settlementGoal(g).id).toBe('farther');
    g.store.set('game.buildings["coal mine"]',1);expect(settlementGoal(g)).toMatchObject({id:'steelworks',target:'workers'});
    g.store.set('stores.iron',100);g.store.set('stores.coal',100);expect(settlementGoal(g)).toMatchObject({id:'steelworks',target:'build'});
    g.store.set('game.buildings.steelworks',1);expect(settlementGoal(g).id).toBe('steelWorkers');
    g.store.set('game.workers.steelworker',1);expect(settlementGoal(g)).toMatchObject({id:'steelWeapon',target:'workers'});
    g.store.set('stores.steel',20);expect(settlementGoal(g)).toMatchObject({id:'steelWeapon',target:'craft'});
    g.store.set('stores["steel sword"]',1);expect(settlementGoal(g).id).toBe('deep');
    g.stop();
  });

  it('does not make a recovered device or starship repeat early settlement goals', () => {
    const g=startGame(villageState({features:{location:{fabricator:true}},stores:{'alien alloy':3}}));
    const before=JSON.stringify(g.store.state);
    expect(settlementGoal(g)).toMatchObject({id:'fabricate',target:'fabricator',item:'energy blade'});
    expect(JSON.stringify(g.store.state)).toBe(before);
    const m=new Endgame(g);m.open('fabricator');expect(m.fabricate('energy blade')).toBe(true);
    expect(settlementGoal(g)).toMatchObject({id:'recycler',target:'fabricator',item:'fluid recycler'});
    expect(m.fabricate('fluid recycler')).toBe(true);
    g.ship.init();g.store.set('game.spaceShip.hull',0);
    expect(settlementGoal(g)).toMatchObject({id:'shipAlloy',target:'ship',missing:{'alien alloy':1}});
    g.store.set('stores["alien alloy"]',1);expect(settlementGoal(g)).toMatchObject({id:'shipHull',target:'ship'});
    m.open('ship');expect(m.upgrade('hull')).toBe(true);
    expect(settlementGoal(g)).toMatchObject({id:'launch',target:'ship'});
    m.launch();g.events.click('fly');g.space.crash();
    expect(settlementGoal(g)).toMatchObject({id:'shipRecovery',target:'ship'});
    g.tick(120000);expect(settlementGoal(g).id).toBe('launch');g.stop();
  });

  it('uses the unlocked path to seek ship alloy and renders bilingual action labels', () => {
    expect(missingKeys()).toEqual([]);
    const g=startGame(equipped({features:{location:{spaceShip:true}},game:{spaceShip:{hull:0,thrusters:1}},stores:{compass:1,'alien alloy':0}}));
    expect(settlementGoal(g)).toMatchObject({id:'shipAlloy',target:'expedition'});
    g.store.set('stores["alien alloy"]',1);
    for(const lang of ['zh','en'] as const){
      const ui=uiStrings(lang),html=economyRows(g,ui)+goalContents(g,ui,settlementGoal(g));
      expect(html).toContain(ui('goal.action.ship'));expect(html).not.toMatch(/undefined|goal\.shipHull/);
    }
    g.stop();
  });
});
