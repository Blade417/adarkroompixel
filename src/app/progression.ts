import type { Game } from '../core/game';
import { CRAFTABLES, FABRICATOR, SHIP, TRADE_GOODS, WEAPONS } from '../core/data';
import type { UiKey } from '../ui/strings';

export type GoalTarget = 'fire' | 'forest' | 'home' | 'build' | 'workers' | 'craft' | 'buy' | 'expedition' | 'ship' | 'fabricator' | 'none';
export interface SettlementGoal { id: string; title: UiKey; detail: UiKey; target: GoalTarget; item?: string; missing: Record<string, number> }

/** Suggested milestones only; never grants resources, unlocks recipes or changes the save. */
export function settlementGoal(g: Game): SettlementGoal {
  const have = (id: string) => g.store.num(`stores["${id}"]`);
  const built = (id: string) => g.store.num(`game.buildings["${id}"]`);
  const workers = (id: string) => g.store.num(`game.workers["${id}"]`);
  const waterReady = ['waterskin', 'cask', 'water tank', 'fluid recycler'].some(id => have(id) > 0);
  const bagReady = ['rucksack', 'wagon', 'convoy', 'cargo drone'].some(id => have(id) > 0);
  const weaponDamage = Math.max(0, ...Object.entries(WEAPONS).filter(([id, w]) =>
    id !== 'fists' && have(id) > 0 && typeof w.damage === 'number' && w.cost?.[id] === undefined &&
    (!w.cost || Object.entries(w.cost).every(([ammo, n]) => have(ammo) >= n)))
    .map(([, w]) => typeof w.damage === 'number' ? w.damage : 0));
  const leatherNeeded = (built('workshop') ? 0 : 100) + (waterReady ? 0 : 50) + (bagReady ? 0 : 200);
  const goal = (id: string, target: GoalTarget, item?: string, explicitCost?: Record<string, number>): SettlementGoal => {
    const recipe = item && (CRAFTABLES[item] ?? TRADE_GOODS[item] ?? FABRICATOR[item]);
    const cost = explicitCost ?? (recipe ? recipe.cost(recipe.type === 'building' ? built(item!) : have(item!)) : {});
    const missing = Object.fromEntries(Object.entries(cost).filter(([key, amount]) => have(key) < amount).map(([key, amount]) => [key, amount - have(key)]));
    // When a recipe is still hidden or unaffordable, lead to its inputs instead of an empty build list.
    if (missing.wood || missing.scales || missing.teeth) target = 'forest';
    else if ((missing.fur || missing.meat || missing.leather) && built('lodge') && built('hut')) target = 'workers';
    else if ((missing.fur || missing.meat) && built('trap')) target = 'forest';
    else if (Object.keys(missing).some(id => ['iron', 'coal', 'sulphur'].includes(id) && built(`${id} mine`)) || (missing.steel && built('steelworks'))) target = 'workers';
    return { id, title: `goal.${id}.title` as UiKey, detail: `goal.${id}.detail` as UiKey, target, item, missing };
  };
  if (!g.outside.initialized) return goal(g.room.fire === 0 ? 'fire' : 'warm', 'fire');
  if (g.room.fire === 0) return goal('rekindle', 'fire', undefined, { wood: 5 });
  if (!g.store.get('game.pixel.foraged') && g.room.builderLevel < 4) return goal('forage', 'forest');
  if (g.room.builderLevel < 4) return goal('recover', 'home');
  // Late discoveries outrank replacing early supplies that a player no longer needs.
  if (g.ship.initialized) {
    if (g.ship.hull < 1) return goal(have('alien alloy') >= SHIP.ALLOY_PER_HULL ? 'shipHull' : 'shipAlloy',
      have('alien alloy') >= SHIP.ALLOY_PER_HULL || !g.path.initialized ? 'ship' : 'expedition', undefined, { 'alien alloy': SHIP.ALLOY_PER_HULL });
    return goal(g.cooldowns.isCooling('liftoffButton') ? 'shipRecovery' : 'launch', 'ship');
  }
  if (g.fabricator.initialized) {
    if (!have('energy blade') && have('alien alloy') >= FABRICATOR['energy blade'].cost(0)['alien alloy']) return goal('fabricate', 'fabricator', 'energy blade');
    if (!have('fluid recycler') && have('alien alloy') >= FABRICATOR['fluid recycler'].cost(0)['alien alloy']) return goal('recycler', 'fabricator', 'fluid recycler');
    if (g.path.initialized) return goal('deep', 'expedition');
  }
  if (g.path.initialized && waterReady && bagReady && weaponDamage >= Number(WEAPONS['bone spear'].damage) && have('cured meat') >= 10) {
    const returned = (g.store.get('game.pixel.expeditionView.trail')?.length ?? 0) > 1;
    if (!returned && !built('iron mine')) return goal('ready', 'expedition');
    if (g.path.armour() === 'none' && built('workshop')) return goal('armour', 'craft', 'l armour');
    if (!built('iron mine')) return goal('scout', 'expedition');
    if (!workers('iron miner') && have('iron') < 20 && g.outside.population > 0) return goal('ironWorkers', 'workers');
    if (weaponDamage < 4 && built('workshop')) return goal('ironWeapon', 'craft', 'iron sword');
    if (!['cask', 'water tank', 'fluid recycler'].some(id => have(id) > 0) && built('workshop')) return goal('cask', 'craft', 'cask');
    if (!built('coal mine')) return goal('farther', 'expedition');
    if (!built('steelworks')) return goal('steelworks', 'build', 'steelworks');
    if (!workers('steelworker') && have('steel') < 20 && weaponDamage < 6 && g.outside.population > 0) return goal('steelWorkers', 'workers');
    if (weaponDamage < 6 && built('workshop')) return goal('steelWeapon', 'craft', 'steel sword');
    return goal('deep', 'expedition');
  }
  if (g.room.temperature <= 1) return goal('warm', 'fire');
  if (!built('cart')) return goal('cart', 'build', 'cart');
  if (!built('trap')) return goal('trap', 'build', 'trap');
  if (!built('hut')) return goal('hut', 'build', 'hut');
  if (!g.outside.population) return goal('residents', 'none');
  if (!built('lodge')) return goal('lodge', 'build', 'lodge');
  if (built('hut') < 20 && g.outside.population >= g.outside.maxPopulation() && g.outside.numGatherers() < 1) return goal('housing', 'build', 'hut');
  if (workers('hunter') < 2 && (have('leather') < leatherNeeded || have('cured meat') < 10 || !have('compass'))) return goal('hunters', 'workers');
  if (!built('tannery')) return goal('tannery', 'build', 'tannery');
  if (!workers('tanner') && have('leather') < leatherNeeded) return goal('tanners', 'workers');
  if (!built('smokehouse')) return goal('smokehouse', 'build', 'smokehouse');
  if (!workers('charcutier') && have('cured meat') < 10) return goal('food', 'workers');
  if (!built('workshop')) return goal('workshop', 'build', 'workshop');
  if (!waterReady) return goal('waterskin', 'craft', 'waterskin');
  if (!bagReady) return goal('rucksack', 'craft', 'rucksack');
  if (weaponDamage < 2) return goal('weapon', 'craft', 'bone spear');
  if (have('cured meat') < 10) return goal('food', 'workers');
  if (!have('compass')) return built('trading post') ? goal('compass', 'buy', 'compass') : goal('trade', 'build', 'trading post');
  return goal('ready', 'expedition');
}
