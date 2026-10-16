import type { Game } from '../core/game';
import { WORKERS } from '../core/data';
import { settlementEconomy } from '../app/economy';
import { settlementGoal, type SettlementGoal } from '../app/progression';
import { esc, num } from './dom';
import type { Ui, UiKey } from './strings';

export function goalContents(g: Game, ui: Ui, goal: SettlementGoal): string {
  const missing = Object.entries(goal.missing).map(([id, amount]) => `${g.t(id)} ${num(amount, g.i18n.lang, 2)}`).join(' · ');
  return `<p>${esc(ui(goal.detail))}</p>` + (missing ? `<p class="goal-missing">${esc(ui('goal.missing', missing))}</p>` : '') +
    `<p class="caption">${esc(ui('goal.suggested'))}</p>`;
}

export function economyRows(g: Game, ui: Ui): string {
  const model = settlementEconomy(g), goal = settlementGoal(g);
  const amount = (n: number) => num(Math.abs(n), g.i18n.lang, 2);
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${amount(n)}`;
  const sourceName = (id: string) => id === 'builder' ? ui('economy.builder') : id === 'thieves' ? ui('economy.thieves') : g.t(id);
  const action = goal.target === 'none' ? '' : `<button type="button" class="recipe-use" data-act="goal">${esc(ui(`goal.action.${goal.target}` as UiKey))}</button>`;
  const goalHtml = `<section class="goal-card"><p class="kicker">${esc(ui('goal.label'))}</p><h3>${esc(ui(goal.title))}</h3>${goalContents(g, ui, goal)}${action}</section>`;
  if (!model.rows.length) return goalHtml + `<p>${esc(ui('economy.empty'))}</p>`;
  const table = `<table class="economy-table"><caption>${esc(ui('economy.period'))}</caption><thead><tr>` +
    ['economy.resource', 'economy.produced', 'economy.consumed', 'economy.net'].map(key => `<th scope="col">${esc(ui(key as UiKey))}</th>`).join('') +
    `</tr></thead><tbody>${model.rows.map(row => `<tr><th scope="row">${esc(g.t(row.id))}</th><td>${signed(row.produced)}</td><td>${row.consumed ? '−' : ''}${amount(row.consumed)}</td><td class="${row.net < 0 ? 'negative' : row.net > 0 ? 'positive' : ''}">${signed(row.net)}</td></tr>`).join('')}</tbody></table>`;
  const shortages = model.shortages.map(short => `<p class="negative">${esc(ui('economy.blocked', sourceName(short.source), Object.entries(short.missing).map(([id, n]) => `${g.t(id)} ${amount(n)}`).join(' · ')))}</p>`).join('');
  const forecast = model.rows.map(row => `${g.t(row.id)} ${signed(row.forecast)}`).join(' · ');
  const sources = Object.entries(g.store.get('income') ?? {}).map(([id, value]) => {
    const inc = value as { delay: number; stores: Record<string, number> };
    if (!inc.delay || !inc.stores || !Object.values(inc.stores).some(Boolean)) return '';
    return `<li>${esc(sourceName(id))}：${esc(Object.entries(inc.stores).filter(([, n]) => n !== 0).map(([key, n]) => `${g.t(key)} ${signed(n * 10 / inc.delay)}`).join(' · '))}</li>`;
  }).join('');
  const ratios: string[] = [];
  for (const [building, job] of [['tannery', 'tanner'], ['smokehouse', 'charcutier']] as const) {
    if (!g.store.num(`game.buildings["${building}"]`)) continue;
    for (const [id, n] of Object.entries(WORKERS[job].stores)) {
      if (n >= 0) continue;
      const supplier = id === 'wood' ? 'gatherer' : 'hunter';
      const rate = WORKERS[supplier].stores[id];
      if (rate > 0) ratios.push(`<p>${esc(ui('economy.ratio', amount(-n / rate), g.t(supplier), g.t(job), g.t(id)))}</p>`);
    }
  }
  return `<h3>${esc(ui('economy.title'))}</h3>${shortages}${table}<p class="caption">${esc(ui('economy.note'))}</p>` +
    `<section class="economy-forecast"><h3>${esc(ui('economy.forecast'))}</h3><p>${esc(forecast)}</p>${shortages ? '' : `<p>${esc(ui('economy.healthy'))}</p>`}<p class="caption">${esc(ui('economy.forecastNote'))}</p></section>` +
    goalHtml + `<section class="economy-sources"><h3>${esc(ui('economy.sources'))}</h3><ul>${sources}</ul>${ratios.join('')}</section>`;
}
