import type { Game } from '../core/game';
import { CRAFTABLES, JOB_MAP, TRADE_GOODS, WORKERS } from '../core/data';
import { PUBLIC_ZONES, type PublicZoneId } from '../app/village';
import { CRAFT_PURPOSES, type BuilderWorkshop } from '../app/building';
import { esc, num } from './dom';
import type { Ui, UiKey } from './strings';
import { economyRows } from './economy';

export type SettlementTab = 'overview' | 'build' | 'craft' | 'workers' | 'buy';
export const SETTLEMENT_TABS: SettlementTab[] = ['overview', 'build', 'workers', 'craft', 'buy'];

/** Shared modal contents. Costs, availability and jobs come from original rules. */
export function settlementRows(g: Game, workshop: BuilderWorkshop, tab: SettlementTab, zone: PublicZoneId | null,
  inVillage: boolean, ui: Ui, costText: (cost: Record<string, number>) => string): string {
  if (tab === 'overview') return economyRows(g, ui);
  const facilityIds: readonly string[] | undefined = PUBLIC_ZONES.find(z => z.id === zone)?.facilities;
  if (tab === 'workers') {
    if (!inVillage) return `<p>${esc(ui('settlement.workersVisit'))}</p>`;
    const jobs = workshop.jobs().filter(job => !facilityIds || facilityIds.some(id => JOB_MAP[id]?.includes(job)));
    const rows = jobs.map(job => {
      const count = g.store.num(`game.workers["${job}"]`), income = WORKERS[job];
      const perPerson = Object.entries(income.stores).map(([id, n]) => `${g.t(id)} ${n > 0 ? '+' : '−'}${num(Math.abs(n), g.i18n.lang, 2)}`).join(' · ');
      const short = Object.entries(income.stores).filter(([id, n]) => n < 0 && g.store.num(`stores["${id}"]`) < -n * count).map(([id]) => g.t(id));
      return `<section class="build-row"><div class="recipe-title"><h3>${esc(g.t(job))}</h3><strong>${count}</strong></div>` +
        `<p>${esc(ui('settlement.perWorker', income.delay, perPerson))}</p>` +
        `<div class="worker-actions">${[-5, -1, 1, 5].map(n => `<button type="button" class="btn" data-act="worker:${esc(job)}:${n}" aria-label="${esc(ui(n > 0 ? 'settlement.addWorker' : 'settlement.removeWorker', g.t(job), Math.abs(n)))}"${n > 0 ? g.outside.numGatherers() <= 0 ? ' disabled' : '' : count <= 0 ? ' disabled' : ''}>${n > 0 ? '+' : '−'}${Math.abs(n)}</button>`).join('')}</div>` +
        `<p class="recipe-status">${short.length ? esc(ui('settlement.shortInput', short.join('、'))) : ''}</p></section>`;
    }).join('');
    return `<p class="workforce-summary">${esc(ui('settlement.workforce', g.outside.population, Math.max(0, g.outside.numGatherers())))}</p>` +
      `<p>${esc(ui('settlement.workerHint'))}</p>` + (rows || `<p>${esc(ui('settlement.noJobs'))}</p>`);
  }
  if (tab === 'craft' && g.store.num('game.buildings.workshop') < 1) return `<p>${esc(ui('settlement.needWorkshop'))}</p>`;
  if (tab === 'buy' && g.store.num('game.buildings["trading post"]') < 1) return `<p>${esc(ui('settlement.needTrade'))}</p>`;
  const ids = tab === 'build' ? workshop.options().filter(id => !facilityIds || facilityIds.includes(id)) : tab === 'craft' ? workshop.craftOptions() : workshop.buyOptions();
  return ids.map(id => {
    const item = (tab === 'buy' ? TRADE_GOODS : CRAFTABLES)[id];
    const cost = g.room.costOf(id), count = g.room.count(id, item), maxed = g.room.isMaxed(id);
    const cold = tab !== 'buy' && g.room.temperature <= 1;
    const missing = Object.fromEntries(Object.entries(cost).map(([key, amount]) => [key, Math.max(0, amount - g.store.num(`stores["${key}"]`))]).filter(([, amount]) => Number(amount) > 0));
    const short = !g.room.canAfford(cost);
    const status = maxed ? ui(tab === 'build' && item.maximum === 1 && !['cart', 'trap'].includes(id) ? 'settlement.done' : item.maximum === 1 ? 'build.done' : 'build.maximum') : cold ? ui('build.cold') : short ? ui('build.missing', costText(missing)) : '';
    const heading = `recipe-${id.replaceAll(' ', '-')}`;
    const desc = tab === 'build' ? ui(`build.${id}.desc` as UiKey) : tab === 'craft' ? g.t(CRAFT_PURPOSES[id]) : ui(id === 'compass' ? 'settlement.compass' : 'settlement.purchase');
    const use = count > 0 && tab === 'build' ? ['hut', 'cart', 'trap'].includes(id) ?
      `<button type="button" class="recipe-use" data-act="use:${id}">${esc(ui(id === 'hut' ? 'village.visit' : id === 'cart' ? 'props.cart.use' : 'props.trap.use'))}</button>` :
      `<button type="button" class="recipe-use" data-act="facility:${esc(id)}">${esc(ui('settlement.manage'))}</button>` : '';
    return `<section class="build-row" aria-labelledby="${heading}"><div class="recipe-title"><h3 id="${heading}" tabindex="-1">${esc(g.t(id))}</h3><span>${esc(ui('build.count', count))}</span></div>` +
      `<p>${esc(desc)}</p><div class="recipe-action"><span class="recipe-cost">${maxed ? '' : esc(costText(cost))}</span>` +
      `<button type="button" class="btn" data-act="${tab}:${esc(id)}"${maxed || cold || short ? ' disabled' : ''}>${esc(maxed ? status : ui(tab === 'buy' ? 'settlement.buyItem' : tab === 'build' && !['cart', 'trap'].includes(id) ? 'settlement.buildItem' : 'build.make', g.t(id)))}</button></div>` +
      `<p class="recipe-status">${maxed ? '' : esc(status)}</p>${use}</section>`;
  }).join('') || `<p>${esc(ui(tab === 'buy' ? 'settlement.noGoods' : 'build.empty'))}</p>`;
}
