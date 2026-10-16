import type { Game } from '../core/game';
import { CRAFTABLES, TRADE_GOODS } from '../core/data';
import type { UiKey } from '../ui/strings';

export type GoalTarget = 'fire' | 'forest' | 'home' | 'build' | 'workers' | 'craft' | 'buy' | 'expedition' | 'none';
export interface SettlementGoal { id: string; title: UiKey; detail: UiKey; target: GoalTarget; item?: string; missing: Record<string, number> }

/** Suggested milestones only; never grants resources, unlocks recipes or changes the save. */
export function settlementGoal(g: Game): SettlementGoal {
  const have = (id: string) => g.store.num(`stores["${id}"]`);
  const built = (id: string) => g.store.num(`game.buildings["${id}"]`);
  const workers = (id: string) => g.store.num(`game.workers["${id}"]`);
  const leatherNeeded = (built('workshop') ? 0 : 100) + (have('waterskin') ? 0 : 50) + (have('rucksack') ? 0 : 200);
  const goal = (id: string, target: GoalTarget, item?: string): SettlementGoal => {
    const recipe = item && (CRAFTABLES[item] ?? TRADE_GOODS[item]);
    const cost = recipe ? recipe.cost(recipe.type === 'building' ? built(item!) : have(item!)) : {};
    const missing = Object.fromEntries(Object.entries(cost).filter(([key, amount]) => have(key) < amount).map(([key, amount]) => [key, amount - have(key)]));
    // When a recipe is still hidden or unaffordable, lead to its inputs instead of an empty build list.
    if (missing.wood || missing.scales || missing.teeth) target = 'forest';
    else if ((missing.fur || missing.meat || missing.leather) && built('lodge') && built('hut')) target = 'workers';
    else if ((missing.fur || missing.meat) && built('trap')) target = 'forest';
    return { id, title: `goal.${id}.title` as UiKey, detail: `goal.${id}.detail` as UiKey, target, item, missing };
  };
  if (!g.outside.initialized) return goal(g.room.fire === 0 ? 'fire' : 'warm', 'fire');
  if (!g.store.get('game.pixel.foraged') && g.room.builderLevel < 4) return goal('forage', 'forest');
  if (g.room.builderLevel < 4) return goal('recover', 'home');
  if (have('compass') && have('waterskin') && have('rucksack') && have('bone spear') && have('cured meat') >= 10) return goal('ready', 'expedition');
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
  if (!have('waterskin')) return goal('waterskin', 'craft', 'waterskin');
  if (!have('rucksack')) return goal('rucksack', 'craft', 'rucksack');
  if (!have('bone spear')) return goal('weapon', 'craft', 'bone spear');
  if (have('cured meat') < 10) return goal('food', 'workers');
  if (!have('compass')) return built('trading post') ? goal('compass', 'buy', 'compass') : goal('trade', 'build', 'trading post');
  return goal('ready', 'expedition');
}
