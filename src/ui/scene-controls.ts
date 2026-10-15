import { FORAGE, type ForestJourney, type ForestTarget, type PixelPlace } from '../app/forest';
import { FOREST_TARGETS } from '../pixel/forest';
import { toCss, type Fit } from '../pixel/fit';
import { DOORWAY, type Rect } from '../pixel/layout';
import type { Ui } from './strings';

const TARGETS: ForestTarget[] = ['door', 'home', 'branches', 'deadwood'];

/** Transparent accessible controls placed on the actual door, sign and wood. */
export class SceneControls {
  private readonly buttons = new Map<ForestTarget, HTMLButtonElement>();
  private readonly feedback: HTMLDivElement;
  private readonly bars = new Map<ForestTarget, HTMLDivElement>();
  private hovered: ForestTarget | null = null;
  private fit: Fit | null = null;
  private place = '';
  private guideUntil = 0;
  private messageUntil = 0;
  private message = '';
  private messageTarget: ForestTarget = 'branches';
  private used = false;

  constructor(parent: HTMLElement, private readonly journey: ForestJourney, private readonly ui: Ui,
    private readonly enabled: () => boolean, private readonly travel: (place: PixelPlace) => boolean) {
    for (const id of TARGETS) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'scene-target'; button.hidden = true; button.dataset.sceneTarget = id;
      button.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') this.hovered = id; });
      button.addEventListener('pointerleave', () => { this.hovered = null; });
      button.addEventListener('click', () => this.activate(id));
      parent.append(button); this.buttons.set(id, button);
      if (id === 'branches' || id === 'deadwood') {
        const bar = document.createElement('div'); bar.className = 'scene-charge'; bar.hidden = true;
        bar.setAttribute('aria-hidden', 'true'); bar.innerHTML = '<i></i>'; parent.append(bar); this.bars.set(id, bar);
      }
    }
    this.feedback = document.createElement('div'); this.feedback.className = 'scene-feedback'; this.feedback.hidden = true;
    this.feedback.id = 'scene-hint'; this.feedback.setAttribute('role', 'status'); parent.append(this.feedback);
    for (const button of this.buttons.values()) button.setAttribute('aria-describedby', 'scene-hint');
  }

  get highlighted(): ForestTarget | null {
    if (!this.enabled()) return null;
    for (const [id, button] of this.buttons) if (!button.hidden && (this.hovered === id || button.matches(':focus-visible'))) return id;
    return null;
  }

  layout(fit: Fit): void {
    this.fit = fit;
    for (const id of TARGETS) {
      const r = this.rect(id), p = toCss(fit, r.x, r.y), offset = fit.mode === 'stacked' ? fit.left : 0;
      Object.assign(this.buttons.get(id)!.style, { left: `${offset + p.x}px`, top: `${p.y}px`, width: `${r.w * fit.ps}px`, height: `${r.h * fit.ps}px` });
      const bar = this.bars.get(id);
      if (bar) Object.assign(bar.style, { left: `${offset + p.x + r.w * fit.ps / 2}px`, top: `${p.y + r.h * fit.ps + 5}px` });
    }
  }

  frame(now: number, ready: boolean): void {
    const available = this.enabled() && ready;
    const place = available ? this.journey.outside ? 'outside' : this.journey.unlocked ? 'room' : '' : '';
    if (place && place !== this.place) { this.guideUntil = now + 7000; this.used = false; this.hovered = null; }
    this.place = place;
    for (const [id, button] of this.buttons) {
      button.hidden = !place || (id === 'door' ? this.journey.outside : !this.journey.outside);
      const cooling = (id === 'branches' || id === 'deadwood') && this.journey.remaining(id) > 0;
      const label = this.label(id), disabled = String(cooling);
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      if (button.getAttribute('aria-disabled') !== disabled) button.setAttribute('aria-disabled', disabled);
      const bar = this.bars.get(id);
      if (bar && (id === 'branches' || id === 'deadwood')) {
        bar.hidden = button.hidden || !cooling;
        bar.firstElementChild!.setAttribute('style', `transform:scaleX(${this.journey.progress(id)})`);
      }
    }
    const selected = this.highlighted || (now < this.messageUntil ? this.messageTarget : null) ||
      (!this.used && now < this.guideUntil && place ? this.journey.outside ? 'branches' : 'door' : null);
    this.feedback.hidden = !available || !selected || !place;
    if (this.feedback.hidden || !selected || !this.fit) return;
    const text = now < this.messageUntil && selected === this.messageTarget ? this.message :
      !this.used && now < this.guideUntil && !this.highlighted ? this.ui(this.journey.outside ? 'forest.guide' : 'forest.door.guide') : this.label(selected);
    if (this.feedback.textContent !== text) this.feedback.textContent = text;
    const r = this.rect(selected), fit = this.fit, p = toCss(fit, r.x + r.w / 2, r.y);
    const offset = fit.mode === 'stacked' ? fit.left : 0;
    Object.assign(this.feedback.style, { left: `${offset + Math.max(95, Math.min(fit.cssW - 95, p.x))}px`, top: `${Math.max(24, p.y - 8)}px` });
  }

  private rect(id: ForestTarget): Rect { return id === 'door' ? DOORWAY : FOREST_TARGETS[id]; }
  private label(id: ForestTarget): string {
    if (id === 'door' || id === 'home') return this.ui(id === 'door' ? 'forest.enter' : 'forest.home');
    const name = this.ui(id === 'branches' ? 'forest.branches' : 'forest.deadwood');
    const left = this.journey.remaining(id);
    return left > 0 ? this.ui('forest.regrow', name, Math.ceil(left / 1000)) : this.ui('forest.collect', name, FORAGE[id].wood);
  }
  private activate(id: ForestTarget): void {
    if (!this.enabled()) return;
    this.used = true;
    if (id === 'door' || id === 'home') {
      if (this.travel(id === 'door' ? 'outside' : 'room')) { this.hovered = null; this.messageUntil = 0; }
      return;
    }
    if (!this.journey.outside) return;
    const gathered = this.journey.gather(id);
    this.message = gathered ? this.ui('forest.gained', FORAGE[id].wood) : this.label(id);
    this.messageTarget = id; this.messageUntil = performance.now() + 1800;
  }
}
