import { BuilderWorkshop, PIXEL_RECIPES } from '../../src/app/building';
import { ForestJourney } from '../../src/app/forest';
import { OpeningProgress } from '../../src/app/opening';
import { settlementGoal } from '../../src/app/progression';
import { seededRng } from '../../src/core';
import { startGame } from '../helpers';

/** Accelerated clock, fresh state, legal player actions only. No injected supplies or unlocks. */
export function playFreshSettlement(seed = 42, maxSeconds = 7200) {
  const g = startGame(undefined, { rng: seededRng(seed), craftables: PIXEL_RECIPES });
  const trip = new ForestJourney(g), workshop = new BuilderWorkshop(g, trip), opening = new OpeningProgress(g);
  const checkpoints: Record<string, number> = {}, events: string[] = [];
  const have = (id: string) => g.store.num(`stores["${id}"]`);
  const built = (id: string) => g.store.num(`game.buildings["${id}"]`);
  const mark = (id: string) => { checkpoints[id] ??= Math.round(g.clock.now / 1000); };
  const home = () => trip.travel('room');
  const build = (id: Parameters<BuilderWorkshop['build']>[0]) => {
    if (!workshop.options().includes(id) || !g.room.canAfford(g.room.costOf(id))) return false;
    if (!workshop.atSettlement) { home(); return true; }
    return workshop.build(id);
  };
  g.bus.on(event => { if (event.type === 'event:start') events.push(g.events.active()!.def.title); });
  let completed = false;
  for (let second = 0; second <= maxSeconds; second++) {
    opening.update();
    if (g.outside.initialized) mark('forest');
    if (workshop.available) mark('builder');
    for (const id of ['cart', 'trap', 'hut', 'lodge', 'tannery', 'smokehouse', 'workshop', 'trading post']) if (built(id)) mark(id);
    for (const id of ['waterskin', 'rucksack', 'bone spear', 'compass']) if (have(id)) mark(id);
    if (have('cured meat') >= 10) mark('food');
    if (settlementGoal(g).id === 'ready') { mark('ready'); completed = true; break; }
    if (second % 5 === 0) act();
    g.tick(1000);
  }
  const result = { seed, completed, seconds: Math.round(g.clock.now / 1000), checkpoints, events,
    huts: g.outside.huts, population: g.outside.population, goal: settlementGoal(g).id,
    stores: { ...g.store.get('stores') }, workers: { ...g.store.get('game.workers') } };
  const save = g.exportCode(); g.stop();
  return { result, save };

  function act(): void {
    if (g.events.active()) {
      const buttons = g.events.buttons().filter(button => button.enabled);
      const compass = buttons.find(button => button.id === 'buyCompass');
      const investigate = buttons.find(button => button.id === 'investigate');
      const free = buttons.filter(button => !button.cost && !g.events.active()!.scene.buttons?.[button.id]?.link);
      const choice = compass ?? investigate ?? free.find(button => button.id === 'ignore' || button.id === 'goodbye') ?? free.at(-1) ?? buttons[0];
      if (choice) g.events.click(choice.id);
      return;
    }
    if (g.room.fire < 3 || g.room.temperature < 3) {
      if (trip.away) { home(); return; }
      if (g.room.canTendFire() && g.room.tendFire()) return;
    }
    if (!g.outside.initialized) return;
    if (!workshop.available) {
      if (trip.outside) {
        const gathered = trip.gather('branches') || trip.gather('deadwood');
        if (!gathered || (trip.remaining('branches') && trip.remaining('deadwood'))) home();
      } else if (!trip.remaining('branches') || !trip.remaining('deadwood')) trip.travel('outside');
      return;
    }
    if (!built('cart') && build('cart')) return;
    if (built('cart') && !built('trap') && build('trap')) return;
    if (built('cart') && built('trap') && !built('hut') && build('hut')) return;
    if (built('hut') < 8 && g.outside.population >= g.outside.maxPopulation() && build('hut')) return;
    for (const id of ['lodge', 'tannery', 'smokehouse', 'workshop', 'trading post'] as const) if (!built(id) && build(id)) return;
    if (built('lodge') && g.outside.population > 1) {
      const leatherNeeded = (built('workshop') ? 0 : 100) + (have('waterskin') ? 0 : 50) + (have('rucksack') ? 0 : 200);
      const tanners = built('tannery') && have('leather') < leatherNeeded && have('fur') >= 15 ? Math.min(2, Math.max(1, Math.floor(g.outside.population / 10))) : 0;
      const food = built('smokehouse') && have('cured meat') < 20 && have('meat') >= 10 && have('wood') >= 10 ? 1 : 0;
      const hunters = Math.min(20, Math.max(1, g.outside.population - tanners - food - 3));
      for (const [job, count] of [['tanner', tanners], ['charcutier', food], ['hunter', hunters]] as const) {
        const current = g.store.num(`game.workers["${job}"]`);
        if (current === count || !workshop.jobs().includes(job)) continue;
        if (trip.place !== 'village') { trip.travel('village'); return; }
        if (workshop.assign(job, Math.max(-5, Math.min(5, count - current)))) return;
      }
    }
    for (const id of ['waterskin', 'rucksack', 'bone spear']) {
      if (!have(id) && workshop.craftOptions().includes(id) && g.room.canAfford(g.room.costOf(id))) {
        if (!workshop.atSettlement) { home(); return; }
        if (workshop.craft(id)) return;
      }
    }
    if (!have('compass') && built('trading post') && g.room.canAfford(g.room.costOf('compass'))) {
      if (!workshop.atSettlement) { home(); return; }
      if (workshop.buy('compass')) return;
    }
    const trapTarget = built('lodge') ? 10 : built('hut') ? 3 : 1;
    if (built('cart') && built('trap') < trapTarget && build('trap')) return;
    if (trip.trapCount && !trip.trapsRemaining) {
      if (!trip.outside) { trip.travel('outside'); return; }
      if (trip.checkTraps()) return;
    }
    if (!trip.remaining('branches') || !trip.remaining('deadwood')) {
      if (!trip.outside) { trip.travel('outside'); return; }
      if (trip.gather('branches') || trip.gather('deadwood')) return;
    }
    if (trip.away) home();
  }
}
