import type { ForestJourney, PixelPlace } from '../app/forest';
import { FOREST_EXIT, HEARTH_PLOT, HUT_PLOTS, HUT_SIZE, PUBLIC_ZONES, inhabitants, type PublicZoneId, type VillageTarget, type VillageView } from '../app/village';
import { toCss, type Fit } from '../pixel/fit';
import type { Ui } from './strings';

type Target = VillageTarget;

/** Roof-aligned semantic controls and a compact overview, with no separate simulation state. */
export class VillageControls {
  private readonly targets = new Map<Target, HTMLButtonElement>();
  private readonly panel: HTMLElement;
  private readonly population: HTMLElement;
  private readonly huts: HTMLElement;
  private readonly income: HTMLElement;
  private readonly detail: HTMLElement;
  private selected: number | PublicZoneId | null = null;
  private hovered: Target | null = null;

  constructor(parent: HTMLElement, private readonly journey: ForestJourney, private readonly ui: Ui,
    private readonly enabled: () => boolean, private readonly travel: (place: PixelPlace) => boolean,
    private readonly openDistrict: (zone: PublicZoneId, opener: HTMLElement) => void) {
    for (const id of ['home', 'forest', ...HUT_PLOTS.map((_, i) => i), ...PUBLIC_ZONES.map(z => z.id)] as Target[]) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'scene-target village-target'; button.hidden = true;
      button.dataset.villageTarget = String(id);
      const hint = document.createElement('span'); hint.className = 'village-roof-hint'; button.append(hint);
      if (PUBLIC_ZONES.some(z => z.id === id)) {
        button.classList.add('village-zone-target');
        const label = document.createElement('span'); label.className = 'village-zone-label';
        label.textContent = this.ui(`village.zone.${id as PublicZoneId}`); button.append(label);
      }
      button.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') this.hovered = id; });
      button.addEventListener('pointerleave', () => { this.hovered = null; });
      button.addEventListener('click', () => {
        if (!this.enabled() || this.journey.place !== 'village') return;
        if (typeof id === 'number') this.selected = id;
        else if (PUBLIC_ZONES.some(z => z.id === id)) { this.selected = id as PublicZoneId; this.openDistrict(id as PublicZoneId, button); }
        else this.travel(id === 'home' ? 'room' : 'outside');
      });
      parent.append(button); this.targets.set(id, button);
    }
    this.panel = document.createElement('aside'); this.panel.className = 'village-summary'; this.panel.hidden = true;
    this.population = document.createElement('strong'); this.huts = document.createElement('span');
    this.income = document.createElement('span'); this.detail = document.createElement('p');
    this.panel.append(this.population, this.huts, this.income, this.detail); parent.append(this.panel);
  }

  get highlighted(): Target | null {
    if (!this.enabled() || this.journey.place !== 'village') return null;
    for (const [id, b] of this.targets) if (!b.hidden && (id === this.hovered || b.matches(':focus-visible'))) return id;
    return null;
  }

  layout(fit: Fit): void {
    const offset = fit.mode === 'stacked' ? fit.left : 0;
    for (const [id, b] of this.targets) {
      const r = id === 'home' ? HEARTH_PLOT : id === 'forest' ? FOREST_EXIT : typeof id === 'number' ?
        { x: HUT_PLOTS[id][0], y: HUT_PLOTS[id][1], ...HUT_SIZE } : PUBLIC_ZONES.find(z => z.id === id)!;
      const p = toCss(fit, r.x - r.w / 2, r.y - r.h);
      Object.assign(b.style, { left: `${offset + p.x}px`, top: `${p.y}px`, width: `${r.w * fit.ps}px`, height: `${r.h * fit.ps}px` });
    }
    Object.assign(this.panel.style, { left: `${offset}px`, width: `${fit.cssW}px` });
  }

  frame(view: VillageView, ready: boolean): void {
    const visible = ready && this.journey.place === 'village', enabled = visible && this.enabled();
    this.panel.hidden = !visible;
    if (typeof this.selected === 'number' && this.selected >= view.huts) this.selected = null;
    for (const [id, b] of this.targets) {
      b.hidden = !enabled || (typeof id === 'number' && id >= view.huts);
      const zone = PUBLIC_ZONES.find(z => z.id === id);
      const built = zone?.facilities.filter(f => view.facilities[f] > 0).length ?? 0;
      const text = typeof id === 'number' ? this.ui('village.house', id + 1, inhabitants(view, id)) : zone ?
        this.ui('village.zone.status', this.ui(`village.zone.${zone.id}`), built, zone.facilities.length) :
        this.ui(id === 'home' ? 'village.home' : 'village.forest');
      if (zone) b.dataset.built = String(built > 0);
      if (b.getAttribute('aria-label') !== text) { b.setAttribute('aria-label', text); b.firstElementChild!.textContent = text; }
    }
    this.setText(this.population, this.ui('village.population', view.population, view.capacity));
    this.setText(this.huts, this.ui('village.huts', view.huts));
    this.setText(this.income, this.ui('village.income', view.gatherers));
    this.setText(this.detail, typeof this.selected === 'string' ? this.ui(`village.zone.detail.${this.selected}`) : this.selected !== null ? this.ui('village.house', this.selected + 1, inhabitants(view, this.selected)) :
      this.ui(view.population ? 'village.hint' : 'village.waiting'));
  }

  private setText(el: HTMLElement, text: string): void { if (el.textContent !== text) el.textContent = text; }
}
