/**
 * Scene interactions, log, stores, events and settings. The transparent semantic target
 * sits on the furnace opening; pointer and keyboard activation share one intent.
 */
import type { Game } from '../core/game';
import type { Language } from '../core/i18n';
import type { ActiveEvent } from '../core/events/runner';
import { Room } from '../core/locations/room';
import { CRAFTABLES, FIRE, TEMPERATURE, TRADE_GOODS } from '../core/data';
import type { MotionPref } from '../app/prefs';
import { describeKey, type RoomView } from '../pixel/mapping';
import { toCss, type Fit } from '../pixel/fit';
import { BUILDER_TARGET, HEARTH_TARGET } from '../pixel/layout';
import type { ForestJourney, PixelPlace } from '../app/forest';
import { BuilderWorkshop, type PixelBuildable } from '../app/building';
import { PUBLIC_ZONES, type PublicZoneId } from '../app/village';
import { SETTLEMENT_TABS, settlementRows, type SettlementTab } from './settlement';
import { EventOutcome } from '../app/event-outcome';
import { settlementGoal } from '../app/progression';
import { goalContents } from './economy';
import { WORKSHOP_IDS, workshopHitRects, type WorkshopId } from '../pixel/workshop';
import { esc, isInteractive, isTyping, num, Patch } from './dom';
import { layoutVars, type HudLayout } from './layout';
import { uiStrings, type Ui, type UiKey } from './strings';
import { Feedback } from './feedback';

export type TendSource = 'hearth' | 'key';

/** what the HUD needs from the page (prefs, audio, reloads) */
export interface HudHost {
  readonly hasSave: boolean;
  readonly language: Language;
  readonly sound: boolean;
  readonly motion: MotionPref;
  /** first Begin / Continue (a user gesture: unlock audio, start the clock) */
  begin(): void;
  setLanguage(lang: Language): void;
  setSound(on: boolean): void;
  setMotion(m: MotionPref): void;
  restart(): void;
  /** store an export code and reload; false when the code is invalid */
  importSave(code: string): boolean;
  /** stop the stranger's arrival if it is playing; true when it was */
  skipArrival(): boolean;
  readonly forestReady: boolean;
  readonly villageReady: boolean;
  readonly expeditionOpen: boolean;
  readonly endgameOpen: boolean;
  openEndgame(place: 'fabricator' | 'ship'): boolean;
  openExpedition(): boolean;
  hasWorkshopArt(id: WorkshopId): boolean;
  travel(place: PixelPlace): boolean;
}

/** entries kept in the log column (older ones fade, then drop) */
export const LOG_MAX = 12;
const DENY_MS = 2200;
const HIDDEN_TYPES = new Set(['building', 'upgrade']);

const GEAR_SVG =
  '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' +
  '<path fill="currentColor" fill-rule="evenodd" d="M8 1h4v2h2v1h1v1h1v1h1v2h2v4h-2v2h-1v1h-1v1h-1v1h-2v2H8v-2H6v-1H5v-1H4v-1H3v-2H1V8h2V6h1V5h1V4h1V3h2V1zm1 6h2v1h1v1h1v2h-1v1h-1v1H9v-1H8v-1H7V9h1V8h1V7z"/></svg>';

const FOCUSABLE = 'button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])';

function digitOf(code: string): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) : 0;
}

export class Hud {
  readonly canvas: HTMLCanvasElement;
  readonly stage: HTMLElement;
  /** the player has pressed Begin / Continue (the clock runs) */
  begun = false;

  private readonly ui: Ui;
  private readonly feedback: Feedback;
  private readonly patch = new Patch();
  private readonly header: HTMLElement;
  private readonly tabList: HTMLElement;
  private readonly tendBtn: HTMLButtonElement;
  private readonly charge: HTMLElement;
  private readonly status: HTMLElement;
  private readonly hearthFeedback: HTMLElement;
  private readonly storesBox: HTMLElement;
  private readonly storesList: HTMLElement;
  private readonly logList: HTMLElement;
  private readonly skipHint: HTMLElement;
  private readonly eventLayer: HTMLElement;
  private readonly eventCard: HTMLElement;
  private readonly titleLayer: HTMLElement;
  private readonly titleCard: HTMLElement;
  private readonly settingsLayer: HTMLElement;
  private readonly settingsCard: HTMLElement;
  private readonly exportCode: HTMLTextAreaElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly importCode: HTMLTextAreaElement;
  private readonly importError: HTMLElement;
  private readonly restartBox: HTMLElement;
  private readonly confirmBox: HTMLElement;
  private readonly sr: HTMLElement;
  private readonly workshop: BuilderWorkshop;
  private readonly eventOutcome: EventOutcome;
  private readonly buildLayer: HTMLElement;
  private readonly buildCard: HTMLElement;
  private readonly buildList: HTMLElement;
  private readonly buildWood: HTMLElement;
  private readonly buildResult: HTMLElement;
  private readonly builderTarget: HTMLElement;
  private readonly roomProps = new Map<WorkshopId, HTMLButtonElement>();
  private hoveredProp: WorkshopId | null = null;
  private compactPropTargets = false;
  private readonly buildLaunch: HTMLElement;
  private readonly fieldTools: HTMLElement;
  private readonly trapButton: HTMLButtonElement;
  private readonly trapResult: HTMLElement;
  private buildReturn: HTMLElement | null = null;
  private buildTab: SettlementTab = 'build';
  private buildZone: PublicZoneId | null = null;
  private readonly buildTabs: HTMLElement;
  private readonly goalGuide: HTMLElement;
  private readonly goalTitle: HTMLElement;
  private readonly goalBody: HTMLElement;
  private readonly goalAction: HTMLButtonElement;

  private denyText = '';
  private denyUntil = 0;
  private logSeq = 0;
  private lastLog = '';
  private evKey: string | null = null;
  private settingsReturn: HTMLElement | null = null;
  private hovering = false;
  private arrivalPlaying = false;
  private guideUntil = 0;
  private actionUntil = 0;
  private actionText = '';
  private touchedHearth = false;
  private sceneKey = '';
  private last = { lbl: '', off: '', charge: -1, status: '', title: '' };
  private timers = { fired: 0, sr: 0, copied: 0 };

  constructor(
    private readonly root: HTMLElement,
    private readonly g: Game,
    private readonly host: HudHost,
    private readonly forest: ForestJourney
  ) {
    this.ui = uiStrings(g.i18n.lang);
    this.workshop = new BuilderWorkshop(g, forest);
    this.eventOutcome = new EventOutcome(g);
    root.innerHTML = this.template();
    const q = <T extends HTMLElement>(sel: string): T => {
      const el = root.querySelector<T>(sel);
      if (!el) throw new Error(`HUD element missing: ${sel}`);
      return el;
    };
    this.header = q('.top');
    this.tabList = q('.tab-list');
    this.stage = q('.stage');
    this.canvas = q<HTMLCanvasElement>('canvas.scene');
    this.skipHint = q('.skip-hint');
    this.tendBtn = q<HTMLButtonElement>('.hearth-target');
    this.charge = q('.hearth-charge > i');
    this.status = q('#hearth-hint');
    this.hearthFeedback = q('.hearth-feedback');
    this.storesBox = q('.stores');
    this.storesList = q('.stores ul');
    this.logList = q('.log ol');
    this.eventLayer = q('.event-layer');
    this.eventCard = q('.event-layer .card');
    this.titleLayer = q('.title-layer');
    this.titleCard = q('.title-card');
    this.settingsLayer = q('.settings-layer');
    this.settingsCard = q('.settings-layer .card');
    this.exportCode = q<HTMLTextAreaElement>('#export-code');
    this.copyBtn = q<HTMLButtonElement>('[data-act="copy"]');
    this.importCode = q<HTMLTextAreaElement>('#import-code');
    this.importError = q('.settings .error');
    this.restartBox = q('.settings .restart');
    this.confirmBox = q('.settings .confirm');
    this.sr = q('#announce');
    this.buildLayer = q('.build-layer');
    this.buildCard = q('.build-card');
    this.buildList = q('.build-list');
    this.buildTabs = q('.settlement-tabs');
    this.goalGuide = q('.progress-guide');
    this.goalTitle = q('.goal-title');
    this.goalBody = q('.goal-body');
    this.goalAction = q<HTMLButtonElement>('.goal-action');
    this.buildWood = q('.build-wood');
    this.buildResult = q('.build-result');
    this.builderTarget = q('.builder-target');
    for (const id of WORKSHOP_IDS) {
      const target = q<HTMLButtonElement>(`[data-room-prop="${id}"]`);
      target.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') this.hoveredProp = id; });
      target.addEventListener('pointerleave', () => { this.hoveredProp = null; });
      this.roomProps.set(id, target);
    }
    this.buildLaunch = q('.build-launch');
    this.fieldTools = q('.field-tools');
    this.trapButton = q<HTMLButtonElement>('[data-act="traps"]');
    this.trapResult = q('.trap-result');

    root.addEventListener('click', (e) => this.onClick(e));
    this.tendBtn.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') this.hovering = true;
    });
    this.tendBtn.addEventListener('pointerleave', () => (this.hovering = false));
    document.addEventListener('keydown', (e) => this.onKey(e));
    for (const e of g.notifications.log.slice(-LOG_MAX)) this.onLog(e.text);
    g.notifications.subscribe((e) => this.onLog(e.text));

    this.feedback = new Feedback(root, host.language,
      () => !this.begun ? 'title' : host.endgameOpen ? 'endgame' : host.expeditionOpen ? 'expedition' : forest.place,
      () => g.exportCode(), () => this.syncModal());
    this.syncChoices();
    this.syncModal();
  }

  // ------------------------------------------------------------------ markup

  private template(): string {
    const u = (k: UiKey, ...a: unknown[]) => esc(this.ui(k, ...a));
    const seg = (label: string, items: [string, string, string?][]) =>
      `<div class="seg" role="group" aria-label="${label}">` +
      items.map(([act, text, lang]) => `<button type="button" data-act="${act}"${lang ? ` lang="${lang}"` : ''} aria-pressed="false">${text}</button>`).join('') +
      '</div>';
    const langSeg = seg(u('settings.language'), [['lang:zh', '中文', 'zh-CN'], ['lang:en', 'English', 'en']]);
    return `
<header class="top">
  <h1 class="brand">${u('app.title')}</h1>
  <nav class="tabs" aria-label="${u('tab.nav')}"><ul class="tab-list"></ul></nav>
  <div class="top-actions"><button type="button" class="build-launch" data-act="build-open" aria-label="${u('build.talk')}" aria-haspopup="dialog" hidden>${u('build.open')}</button>
  <button type="button" class="icon gear" data-act="settings" aria-label="${u('settings.open')}" aria-haspopup="dialog" title="${u('settings.title')}">${GEAR_SVG}</button></div>
</header>
<main class="stage">
  <aside class="progress-guide" hidden><details><summary><span>${u('goal.label')}</span> · <strong class="goal-title"></strong></summary><div class="goal-body"></div><button type="button" class="recipe-use goal-action" data-act="goal"></button></details></aside>
  <div class="canvas-box">
    <canvas class="scene" role="img" tabindex="-1" aria-label="${u('scene.label')}"></canvas>
    <button type="button" class="hearth-target" data-act="tend" aria-label="${u('dock.label')}" aria-describedby="hearth-hint" aria-keyshortcuts="F"></button>
    <button type="button" class="builder-target scene-target" data-act="build-open" aria-label="${u('build.talk')}" aria-haspopup="dialog" hidden><span>${u('build.personHint')}</span></button>
    <button type="button" class="room-prop-target scene-target" data-room-prop="cart" data-act="prop:cart" aria-label="${u('props.cart')}" aria-haspopup="dialog" hidden><span>${u('props.cart')}</span></button>
    <button type="button" class="room-prop-target scene-target" data-room-prop="trap" data-act="prop:trap" aria-label="${u('props.trap', 0)}" aria-haspopup="dialog" hidden><span></span></button>
    <div class="hearth-feedback" hidden><p id="hearth-hint"></p></div>
    <div class="hearth-charge" aria-hidden="true" hidden><i></i></div>
    <p class="skip-hint" hidden>${u('arrival.skip')}</p>
  </div>
  <aside class="field-tools" hidden><button type="button" class="btn" data-act="traps"></button><p class="trap-result" role="status"></p></aside>
  <aside class="stores" aria-labelledby="stores-h" hidden><h2 class="sr-only" id="stores-h">${u('stores.label')}</h2><ul></ul></aside>
  <aside class="log" aria-labelledby="log-h"><h2 class="sr-only" id="log-h">${u('log.label')}</h2><ol role="log"></ol></aside>
</main>
<div class="layer build-layer" hidden>
  <div class="card build-card" role="dialog" aria-modal="true" aria-labelledby="build-title" tabindex="-1">
    <div class="settlement-heading"><p class="kicker">${u('build.title')}</p><h2 id="build-title">${u('build.open')}</h2>
    <p class="build-intro">${u('build.intro')}</p><nav class="settlement-tabs" aria-label="${u('settlement.tabs')}"></nav><p class="build-wood"></p></div><div class="build-list"></div>
    <p class="build-result" role="status"></p>
    <div class="set-actions end"><button type="button" class="btn" data-act="build-close">${u('build.close')}</button></div>
  </div>
</div>
<div class="layer event-layer" hidden>
  <div class="card event" role="dialog" aria-modal="true" aria-labelledby="ev-title" aria-describedby="ev-body" tabindex="-1"></div>
</div>
<div class="layer title-layer">
  <div class="title-card" role="dialog" aria-modal="true" aria-labelledby="title-name" aria-describedby="title-sub" tabindex="-1">
    <h2 class="title-name" id="title-name">${u('app.title')}</h2>
    <p class="title-sub" id="title-sub">${u('app.subtitle')}</p>
    <button type="button" class="primary begin" data-act="begin">${u(this.host.hasSave ? 'title.continue' : 'title.begin')}</button>
    <div class="title-row">${langSeg}<button type="button" class="link" data-act="settings" aria-haspopup="dialog">${u('settings.title')}</button><button type="button" class="link" data-act="feedback" aria-haspopup="dialog">${u('feedback.open')}</button></div>
    <p class="title-note">${u('title.note')}</p>
  </div>
</div>
<div class="layer settings-layer" hidden>
  <div class="card settings" role="dialog" aria-modal="true" aria-labelledby="set-title" tabindex="-1">
    <h2 id="set-title">${u('settings.title')}</h2>
    <div class="set-row"><span class="set-k" aria-hidden="true">${u('settings.language')}</span>${langSeg}</div>
    <div class="set-row"><span class="set-k" aria-hidden="true">${u('settings.sound')}</span>${seg(u('settings.sound'), [
      ['sound:on', u('settings.on')],
      ['sound:off', u('settings.off')]
    ])}</div>
    <div class="set-row"><span class="set-k" aria-hidden="true">${u('settings.motion')}</span>${seg(u('settings.motion'), [
      ['motion:system', u('motion.system')],
      ['motion:reduce', u('motion.reduce')],
      ['motion:full', u('motion.full')]
    ])}</div>
    <section class="set-save" aria-labelledby="set-save-h">
      <h3 id="set-save-h">${u('settings.save')}</h3>
      <div class="set-actions">
        <button type="button" class="btn" data-act="export">${u('settings.export')}</button>
        <button type="button" class="btn" data-act="copy" hidden>${u('settings.copy')}</button>
      </div>
      <textarea class="code" id="export-code" readonly hidden aria-label="${u('settings.export')}" spellcheck="false"></textarea>
      <label class="set-k" for="import-code">${u('settings.import')}</label>
      <textarea class="code" id="import-code" placeholder="${u('settings.importPlaceholder')}" spellcheck="false" autocomplete="off"></textarea>
      <div class="set-actions"><button type="button" class="btn" data-act="import">${u('settings.importApply')}</button></div>
      <p class="error" role="alert"></p>
      <div class="set-actions restart"><button type="button" class="btn danger" data-act="restart">${u('settings.restart')}</button></div>
      <div class="confirm" hidden>
        <p id="restart-q">${u('settings.restartConfirm')}</p>
        <div class="set-actions" role="group" aria-labelledby="restart-q">
          <button type="button" class="btn danger" data-act="restart-yes">${u('settings.confirm')}</button>
          <button type="button" class="btn" data-act="restart-no">${u('settings.cancel')}</button>
        </div>
      </div>
    </section>
    <div class="set-actions"><button type="button" class="btn" data-act="feedback" aria-haspopup="dialog">${u('feedback.open')}</button></div>
    <p class="credits">${u('settings.credits')}</p>
    <div class="set-actions end"><button type="button" class="btn" data-act="settings-close">${u('settings.close')}</button></div>
  </div>
</div>
<div class="sr-only" role="status" aria-live="polite" id="announce"></div>`;
  }

  // ------------------------------------------------------------------ layout

  /** switch the stacked flow on or off before the stage is measured */
  setStacked(on: boolean): void {
    if (on) this.root.dataset.mode = 'stacked';
    else if (this.root.dataset.mode === 'stacked' || !this.root.dataset.mode) this.root.dataset.mode = 'band';
  }

  stageSize(): { w: number; h: number } {
    return { w: this.stage.clientWidth, h: this.stage.clientHeight };
  }

  applyLayout(l: HudLayout): void {
    this.root.dataset.mode = l.mode;
    const vars = layoutVars(l);
    for (const k of Object.keys(vars)) this.stage.style.setProperty(k, vars[k]);
  }

  /** Align the DOM hit target with logical scene coordinates at every scale and crop. */
  placeHearth(fit: Fit): void {
    this.compactPropTargets = fit.ps < 1;
    const p = toCss(fit, HEARTH_TARGET.x, HEARTH_TARGET.y);
    const offset = fit.mode === 'stacked' ? fit.left : 0;
    const x = offset + p.x;
    const w = HEARTH_TARGET.w * fit.ps;
    const h = HEARTH_TARGET.h * fit.ps;
    Object.assign(this.tendBtn.style, { left: `${x}px`, top: `${p.y}px`, width: `${w}px`, height: `${h}px` });
    const builder = toCss(fit, BUILDER_TARGET.x, BUILDER_TARGET.y);
    Object.assign(this.builderTarget.style, { left: `${offset + builder.x}px`, top: `${builder.y}px`, width: `${BUILDER_TARGET.w * fit.ps}px`, height: `${BUILDER_TARGET.h * fit.ps}px` });
    const propRects = workshopHitRects(fit);
    for (const [id, target] of this.roomProps) {
      const r = propRects[id];
      Object.assign(target.style, { left: `${offset + r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    }
    const centre = Math.max(offset + 108, Math.min(offset + fit.cssW - 108, x + w / 2));
    Object.assign(this.hearthFeedback.style, { left: `${centre}px`, top: `${p.y - 8}px` });
    Object.assign(this.charge.parentElement!.style, { left: `${x + w / 2}px`, top: `${p.y + h + 6}px` });
  }

  get hearthHighlighted(): boolean {
    return this.canInteract() && !this.arrivalPlaying &&
      (this.hovering || this.tendBtn.matches(':focus-visible') || (!this.touchedHearth && performance.now() < this.guideUntil));
  }

  get highlightedWorkshop(): WorkshopId | null {
    if (!this.canInteract() || this.arrivalPlaying || this.g.active !== 'room') return null;
    for (const [id, target] of this.roomProps) {
      if (!target.hidden && (this.hoveredProp === id || target.matches(':focus-visible'))) return id;
    }
    return null;
  }

  setReduced(on: boolean): void {
    this.root.dataset.motion = on ? 'reduce' : 'full';
  }

  // ------------------------------------------------------------------ state queries

  /** a dialog (title / settings) is open above the room */
  get overlayOpen(): boolean {
    return this.feedback.opened || !this.titleLayer.hidden || !this.settingsLayer.hidden || !this.buildLayer.hidden;
  }

  /** the room itself takes input (hover highlight, hearth clicks) */
  canInteract(): boolean {
    return this.begun && !this.g.over && !this.overlayOpen && !this.g.events.active() && !this.host.expeditionOpen;
  }

  // ------------------------------------------------------------------ the shared fire action

  tend(_source: TendSource): boolean {
    if (!this.canInteract() || this.arrivalPlaying || this.g.active !== 'room') return false;
    this.touchedHearth = true;
    const g = this.g;
    if (g.events.active()) {
      this.deny(this.ui('tend.blocked'));
      return false;
    }
    if (!g.room.canTendFire()) {
      this.deny(this.waitText());
      return false;
    }
    const seq = this.logSeq;
    const lighting = g.room.fire === 0;
    const ok = g.room.tendFire();
    if (!ok) {
      // the core explains a refusal in the log (not enough wood / the wood has run out)
      this.deny(this.logSeq > seq ? this.lastLog : '');
    } else {
      this.denyUntil = 0;
      this.actionText = this.ui(lighting ? 'tend.lit' : 'tend.stoked');
      this.actionUntil = performance.now() + 1600;
      this.announce(this.actionText);
      this.tendBtn.classList.add('fired');
      window.clearTimeout(this.timers.fired);
      this.timers.fired = window.setTimeout(() => this.tendBtn.classList.remove('fired'), 480);
    }
    return ok;
  }

  private waitText(): string {
    const ms = this.g.cooldowns.remaining(Room.FIRE_COOLDOWN);
    return this.ui('tend.wait', Math.max(1, Math.ceil(ms / 1000)));
  }

  private deny(text: string): void {
    this.denyText = text;
    this.denyUntil = performance.now() + DENY_MS;
    if (text) this.announce(text);
  }

  private announce(text: string): void {
    this.sr.textContent = '';
    window.clearTimeout(this.timers.sr);
    this.timers.sr = window.setTimeout(() => (this.sr.textContent = text), 40);
  }

  // ------------------------------------------------------------------ per frame

  frame(now: number, view: RoomView, arrival: boolean): void {
    this.arrivalPlaying = arrival;
    this.syncModal();
    this.renderTabs();
    this.renderStores();
    this.renderHearth(now);
    this.renderEvent();
    this.renderBuilding();
    this.renderGoal();
    if (this.skipHint.hidden === arrival) this.skipHint.hidden = !arrival;
    this.renderScene(view, arrival);
    const placeTitle = this.host.endgameOpen ? this.g.over ? this.g.t('Space') : this.g.title() : this.forest.place === 'village' ? this.ui('village.name') : this.forest.outside ? this.ui('forest.name') : this.g.title();
    const title = this.begun ? `${placeTitle} · ${this.ui('app.title')}` : this.ui('app.title');
    if (title !== this.last.title) document.title = this.last.title = title;
  }

  private renderTabs(): void {
    const g = this.g;
    const html = g
      .tabs()
      .map((id) => {
        const name = esc(id === 'outside' ? this.ui('forest.name') : g.title(id));
        if (g.active === 'space' || g.over) return `<li><button type="button" class="tab" disabled>${name}</button></li>`;
        if (id === 'path') return this.host.expeditionOpen ? `<li><span class="tab on" aria-current="page">${name}</span></li>` : `<li><button type="button" class="tab" data-act="tab:path">${name}</button></li>`;
        if (this.host.expeditionOpen) return `<li><button type="button" class="tab" data-act="tab:${id}" disabled>${name}</button></li>`;
        if (id === (this.host.endgameOpen ? g.active : this.forest.place)) return `<li><span class="tab on" aria-current="page">${name}</span></li>`;
        if (id === 'fabricator' || id === 'ship') return `<li><button type="button" class="tab" data-act="tab:${id}">${name}</button></li>`;
        if (id === 'room' || (id === 'outside' && this.host.forestReady)) return `<li><button type="button" class="tab" data-act="tab:${id}">${name}</button></li>`;
        return `<li><button type="button" class="tab soon" data-act="tab:${id}" aria-disabled="true">${name}<span class="badge">${esc(this.ui('tab.soon'))}</span></button></li>`;
      })
      .join('');
    const village = this.forest.villageUnlocked ? this.forest.place === 'village' ?
      `<li><span class="tab on" aria-current="page">${esc(this.ui('village.name'))}</span></li>` :
      `<li><button type="button" class="tab" data-act="tab:village" ${this.host.villageReady && !this.host.expeditionOpen && g.active !== 'space' && !g.over ? '' : 'disabled'}>${esc(this.ui('village.name'))}</button></li>` : '';
    this.patch.set(this.tabList, html + village);
  }

  private renderStores(): void {
    const g = this.g;
    const stores = g.store.get('stores') || {};
    const rows: string[] = [];
    // insertion order: things appear in the order they were first found
    for (const k of Object.keys(stores)) {
      const n = stores[k];
      if (typeof n !== 'number' || k.includes('blueprint')) continue;
      const type = CRAFTABLES[k]?.type ?? TRADE_GOODS[k]?.type;
      if (type && HIDDEN_TYPES.has(type)) continue;
      rows.push(`<li><span class="k">${esc(g.t(k))}</span><span class="v">${num(n, g.i18n.lang)}</span></li>`);
    }
    const empty = rows.length === 0;
    if (this.storesBox.hidden !== empty) this.storesBox.hidden = empty;
    this.patch.set(this.storesList, rows.join(''));
  }

  private renderGoal(): void {
    this.goalGuide.hidden = !this.begun || this.overlayOpen || this.arrivalPlaying || Boolean(this.g.events.active()) || this.host.expeditionOpen || this.host.endgameOpen;
    if (this.goalGuide.hidden) return;
    const goal = settlementGoal(this.g), title = this.ui(goal.title);
    if (this.goalTitle.textContent !== title) this.goalTitle.textContent = title;
    this.patch.set(this.goalBody, goalContents(this.g, this.ui, goal));
    this.goalAction.hidden = goal.target === 'none';
    if (goal.target !== 'none') {
      const text = this.ui(`goal.action.${goal.target}` as UiKey);
      if (this.goalAction.textContent !== text) this.goalAction.textContent = text;
    }
  }

  private followGoal(opener: HTMLElement): void {
    if (!this.begun || this.arrivalPlaying || this.g.events.active() || this.overlayOpen) return;
    const goal = settlementGoal(this.g);
    this.closeBuilding(false);
    if (goal.target === 'none') return;
    if (goal.target === 'expedition') { this.host.openExpedition(); return; }
    if (goal.target === 'ship' || goal.target === 'fabricator') { this.host.openEndgame(goal.target); return; }
    if (goal.target === 'fire') {
      if (this.forest.away) this.host.travel('room');
      this.tendBtn.focus(); return;
    }
    if (goal.target === 'forest' || goal.target === 'home') {
      this.host.travel(goal.target === 'forest' ? 'outside' : 'room'); return;
    }
    if (goal.target === 'workers') {
      if (this.forest.place !== 'village' && !this.host.travel('village')) return;
    } else if (!this.workshop.atSettlement && !this.host.travel('room')) return;
    this.openBuilding(opener);
    this.buildTab = goal.target;
    this.renderBuilding(); this.buildCard.focus();
  }

  private costText(cost: Record<string, number> | undefined): string {
    if (!cost) return '';
    const g = this.g;
    const zh = g.i18n.lang === 'zh';
    return Object.entries(cost)
      .map(([k, v]) => (zh ? `${g.t(k)} ${num(v, 'zh')}` : `${num(v, 'en')} ${g.t(k)}`))
      .join(' · ');
  }

  private tendState(now: number): { lbl: string; cost: string; short: boolean; off: boolean; charge: number; status: string } {
    const g = this.g;
    const r = g.room;
    const fire = r.fire;
    const wood = g.store.get('stores.wood');
    // the fire is free until wood has ever been gathered (stores.wood undefined), like the original
    const need = typeof wood === 'number' ? (fire === 0 ? 5 : 1) : 0;
    const short = need > 0 && wood < need;
    const blocked = Boolean(g.events.active()) || this.arrivalPlaying;
    const cooling = !r.canTendFire();
    let status: string;
    if (now < this.denyUntil && this.denyText) status = this.denyText;
    else if (blocked) status = this.ui('tend.blocked');
    else if (cooling) status = this.waitText();
    else if (short) status = g.i18n.terminate(g.t(fire === 0 ? 'not enough wood to get the fire going' : 'the wood has run out'));
    else status = this.ui('tend.keys');
    return {
      lbl: g.t(fire === 0 ? 'light fire' : 'stoke fire'),
      cost: need ? this.costText({ wood: need }) : '',
      short,
      off: !this.begun || blocked || cooling || short,
      charge: cooling ? 1 - g.cooldowns.progress(Room.FIRE_COOLDOWN) : 1,
      status
    };
  }

  private renderHearth(now: number): void {
    const outside = this.forest.away;
    this.tendBtn.hidden = outside;
    if (outside) { this.charge.parentElement!.hidden = true; this.hearthFeedback.hidden = true; return; }
    const s = this.tendState(now);
    const l = this.last;
    const label = [s.lbl, s.cost, s.off ? s.status : this.ui('tend.keys')].filter(Boolean).join(' · ');
    if (label !== l.lbl) this.tendBtn.setAttribute('aria-label', (l.lbl = label));
    const off = String(s.off || this.arrivalPlaying);
    if (off !== l.off) this.tendBtn.setAttribute('aria-disabled', (l.off = off));
    const cooling = !this.g.room.canTendFire();
    const charge = Math.round(s.charge * 1000) / 1000;
    if (charge !== l.charge) {
      this.charge.style.transform = `scaleX(${charge})`;
      l.charge = charge;
    }
    this.charge.parentElement!.hidden = !cooling || !this.canInteract() || this.arrivalPlaying;
    const focused = this.tendBtn.matches(':focus-visible');
    const guiding = !this.touchedHearth && now < this.guideUntil;
    const denied = now < this.denyUntil;
    const acted = now < this.actionUntil;
    const show = this.canInteract() && !this.arrivalPlaying && (this.hovering || focused || guiding || denied || acted);
    this.hearthFeedback.hidden = !show;
    let text = denied ? this.denyText : acted ? this.actionText : '';
    if (!text) text = s.off ? s.status : guiding && !this.hovering && !focused ? this.ui('tend.discover') : [s.lbl, s.cost, 'F'].filter(Boolean).join(' · ');
    if (text !== l.status) this.status.textContent = l.status = text;
    this.hearthFeedback.classList.toggle('warn', denied || s.short);
    this.hearthFeedback.classList.toggle('success', acted && !denied);
    this.tendBtn.classList.toggle('guiding', guiding && this.canInteract());
  }

  private renderScene(view: RoomView, arrival: boolean): void {
    if (this.forest.place === 'village') {
      const huts = this.g.outside.huts, population = this.g.outside.population;
      const key = `village|${huts}|${population}`;
      if (key !== this.sceneKey) {
        this.sceneKey = key;
        this.canvas.setAttribute('aria-label', this.ui('village.scene', huts, population, this.g.outside.maxPopulation()));
      }
      return;
    }
    if (this.forest.outside) {
      const branches = this.forest.remaining('branches') > 0, deadwood = this.forest.remaining('deadwood') > 0;
      const key = `forest|${branches}|${deadwood}`;
      if (key !== this.sceneKey) {
        this.sceneKey = key;
        this.canvas.setAttribute('aria-label', this.ui('forest.scene', this.ui(branches ? 'forest.empty' : 'forest.ready'), this.ui(deadwood ? 'forest.empty' : 'forest.ready')));
      }
      return;
    }
    const key = `${describeKey(view)}|${arrival ? 1 : 0}`;
    if (key === this.sceneKey) return;
    this.sceneKey = key;
    const g = this.g;
    const term = (s: string) => g.i18n.terminate(s);
    const parts = [term(g.t('the fire is {0}', g.t(FIRE[view.fire].text))), term(g.t('the room is {0}', g.t(TEMPERATURE[view.temperature].text)))];
    if (arrival) parts.push(term(this.ui('scene.arrival')));
    else if (view.stranger) parts.push(term(this.ui(`scene.stranger.${view.stranger.pose}` as UiKey)));
    if (view.woodpile !== null) parts.push(term(this.ui('scene.woodpile')));
    if (view.furpile) parts.push(term(this.ui('scene.furpile')));
    if (view.cart) parts.push(term(this.ui('scene.cart')));
    if (view.traps > 0) parts.push(term(this.ui('scene.traps', view.traps)));
    const sep = g.i18n.lang === 'zh' ? '：' : ': ';
    this.canvas.setAttribute('aria-label', this.ui('scene.label') + sep + parts.join(g.i18n.lang === 'zh' ? '' : ' '));
  }

  // ------------------------------------------------------------------ construction

  private openBuilding(opener: HTMLElement, recipe?: PixelBuildable): void {
    if (!this.canInteract() || this.arrivalPlaying || !this.workshop.atSettlement || !this.workshop.available) return;
    this.buildTab = !recipe && this.forest.place === 'village' ? 'overview' : 'build'; this.buildZone = null;
    this.buildReturn = opener;
    this.buildResult.textContent = '';
    this.buildLayer.hidden = false;
    this.renderBuilding();
    this.syncModal();
    const focus = recipe ? this.buildList.querySelector<HTMLElement>(`#recipe-${recipe}`) : this.buildCard;
    (focus ?? this.buildCard).focus();
  }

  openDistrict(zone: PublicZoneId, opener: HTMLElement): void {
    if (this.forest.place !== 'village' || !this.canInteract() || this.arrivalPlaying || !this.workshop.available) return;
    this.openBuilding(opener);
    this.buildZone = zone;
    const facilities = PUBLIC_ZONES.find(z => z.id === zone)!.facilities;
    const built = facilities.some(id => this.g.store.num(`game.buildings["${id}"]`) > 0);
    this.buildTab = built ? zone === 'trade' ? 'buy' : zone === 'craft' && this.g.store.num('game.buildings.workshop') > 0 ? 'craft' : 'workers' : 'build';
    this.renderBuilding(); this.buildCard.focus();
  }

  private closeBuilding(restore = true): void {
    if (this.buildLayer.hidden) return;
    this.buildLayer.hidden = true;
    this.syncModal();
    if (restore) {
      const target = this.buildReturn?.isConnected && !this.buildReturn.hidden ? this.buildReturn : this.canvas;
      target.focus({ preventScroll: true });
    }
  }

  private renderBuilding(): void {
    const g = this.g;
    const inRoom = g.active === 'room';
    const visible = this.begun && this.workshop.atSettlement && this.workshop.available;
    this.buildLaunch.hidden = !visible;
    this.buildLaunch.textContent = this.ui(this.forest.place === 'village' ? 'settlement.open' : 'build.open');
    this.buildLaunch.setAttribute('aria-label', this.ui(this.forest.place === 'village' ? 'settlement.open' : 'build.talk'));
    // At subpixel mobile scaling, leave the space around the small trap to its 44px touch target.
    // The top-bar entry still reaches the builder without overlapping that object.
    this.builderTarget.hidden = !visible || !inRoom || this.arrivalPlaying || (this.compactPropTargets && this.forest.trapCount > 0);
    for (const [id, target] of this.roomProps) {
      const count = g.store.num(`game.buildings.${id}`);
      target.hidden = !this.begun || !inRoom || count === 0 || this.arrivalPlaying || !this.host.hasWorkshopArt(id);
      const label = id === 'cart' ? this.ui('props.cart') : this.ui('props.trap', count);
      if (target.getAttribute('aria-label') !== label) {
        target.setAttribute('aria-label', label);
        target.firstElementChild!.textContent = label;
      }
      if (target.hidden && this.hoveredProp === id) this.hoveredProp = null;
    }
    if (!this.buildLayer.hidden && (!visible || g.events.active())) this.closeBuilding(false);
    this.fieldTools.hidden = !this.begun || !this.forest.outside || this.forest.trapCount === 0;
    if (!this.fieldTools.hidden) {
      const remaining = this.forest.trapsRemaining;
      const text = `${this.ui('traps.check')} · ${this.ui('traps.count', this.forest.trapCount)}` +
        (remaining > 0 ? ` · ${this.ui('traps.wait', Math.ceil(remaining / 1000))}` : '');
      if (this.trapButton.textContent !== text) this.trapButton.textContent = text;
      this.trapButton.setAttribute('aria-disabled', String(remaining > 0));
    } else if (this.trapResult.textContent) this.trapResult.textContent = '';
    if (this.buildLayer.hidden) return;

    this.patch.set(this.buildTabs, SETTLEMENT_TABS.map(tab => `<button type="button" data-act="settlement-tab:${tab}" aria-pressed="${this.buildTab === tab}">${esc(this.ui(`settlement.tab.${tab}`))}</button>`).join('') +
      (this.buildZone ? `<button type="button" data-act="settlement-all">${esc(this.ui('settlement.all'))}</button>` : ''));
    this.buildCard.querySelector('h2')!.textContent = this.buildZone ? this.ui(`village.zone.${this.buildZone}`) : this.ui('settlement.title');
    const rows = settlementRows(g, this.workshop, this.buildTab, this.buildZone, this.forest.place === 'village', this.ui, cost => this.costText(cost));
    const active = document.activeElement as HTMLElement | null;
    const focusAct = active && this.buildList.contains(active) ? active.dataset.act : undefined;
    const woodText = this.ui('build.wood', num(g.store.num('stores.wood'), g.i18n.lang));
    if (this.buildWood.textContent !== woodText) this.buildWood.textContent = woodText;
    this.patch.set(this.buildList, rows || `<p>${esc(this.ui('build.empty'))}</p>`);
    if (focusAct && !this.buildList.contains(document.activeElement)) {
      const replacement = [...this.buildList.querySelectorAll<HTMLButtonElement>('button')]
        .find(button => button.dataset.act === focusAct && !button.disabled);
      const recipe = /^(?:build|craft|buy):(.+)$/.exec(focusAct)?.[1].replaceAll(' ', '-');
      const heading = recipe ? [...this.buildList.querySelectorAll<HTMLElement>('h3[id]')]
        .find(element => element.id === `recipe-${recipe}`) : undefined;
      (replacement ?? heading ?? this.buildCard)?.focus({ preventScroll: true });
    }
  }

  private makeBuilding(id: string): void {
    if (this.buildLayer.hidden || this.g.events.active() || this.arrivalPlaying || !this.workshop.atSettlement) return;
    if (this.workshop.build(id as PixelBuildable)) {
      this.buildResult.textContent = this.ui(['cart', 'trap'].includes(id) ? 'build.success' : 'settlement.built', this.g.t(id));
      this.renderBuilding();
    }
  }

  private checkTraps(): void {
    if (!this.canInteract() || this.arrivalPlaying) return;
    const drops = this.forest.checkTraps();
    if (!drops) return;
    const found = Object.entries(drops).map(([id, count]) => `${this.g.t(id)} +${num(count, this.g.i18n.lang)}`).join(' · ');
    this.trapResult.textContent = this.ui('traps.result', found);
    this.renderBuilding();
  }

  // ------------------------------------------------------------------ log

  private onLog(text: string): void {
    this.logSeq++;
    this.lastLog = text;
    const li = document.createElement('li');
    li.textContent = text;
    this.logList.prepend(li);
    while (this.logList.children.length > LOG_MAX) this.logList.lastElementChild!.remove();
  }

  // ------------------------------------------------------------------ events

  private eventHtml(ev: ActiveEvent): string {
    const g = this.g;
    const scene = ev.scene;
    const paras = (scene.text ?? []).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
    const caption = scene.notification ? `<p class="caption">${esc(scene.notification)}</p>` : '';
    const invitation = g.content.events.Marketing.includes(ev.def) ? `<p class="caption">${esc(this.ui('event.invitation'))}</p>` : '';
    const choices = g.events
      .buttons()
      .map((b, i) => {
        const cost = this.costText(b.cost);
        const reward = this.costText(scene.buttons?.[b.id]?.reward);
        const cooling = g.cooldowns.isCooling('event:' + b.id);
        return (
          `<button type="button" class="choice" data-act="event:${esc(b.id)}"${cooling ? ` data-cd="event:${esc(b.id)}"` : ''}${b.enabled ? '' : ' aria-disabled="true"'}>` +
          (i < 9 ? `<kbd aria-hidden="true">${i + 1}</kbd>` : '') +
          `<span class="lbl">${esc(b.text)}</span>${cost ? `<span class="cost">${esc(this.ui('event.cost', cost))}</span>` : ''}${reward ? `<span class="reward">${esc(this.ui('event.gain', reward))}</span>` : ''}${cooling ? '<i class="cd"></i>' : ''}</button>`
        );
      })
      .join('');
    return (
      `<p class="kicker">${esc(this.ui('event.label'))}</p><h2 id="ev-title">${esc(ev.def.title)}</h2>` +
      `<div class="ev-body" id="ev-body">${paras}${caption}${invitation}</div>` +
      (this.eventOutcome.changes.length ? `<p class="event-changes" role="status">${esc(this.ui('event.changes', this.eventOutcome.changes.map(c => `${c.kind === 'population' ? this.ui('event.population') : g.t(c.id)} ${c.amount > 0 ? '+' : '−'}${num(Math.abs(c.amount), g.i18n.lang)}`).join(' · ')))}</p>` : '') +
      `<div class="choices">${choices}</div>`
    );
  }

  private renderEvent(): void {
    const ev = this.host.expeditionOpen ? null : this.g.events.active();
    const layer = this.eventLayer;
    if (!ev) {
      if (!layer.hidden) {
        layer.hidden = true;
        this.evKey = null;
        this.syncModal();
        if (!this.overlayOpen && this.begun) this.canvas.focus({ preventScroll: true });
      }
      return;
    }
    if (!this.buildLayer.hidden) this.closeBuilding(false);
    const key = `${ev.def.title}\u0000${ev.sceneName}`;
    const opening = layer.hidden;
    const newScene = key !== this.evKey;
    this.evKey = key;
    const active = document.activeElement as HTMLElement | null;
    const focusedAct = active && this.eventCard.contains(active) ? active.dataset.act : undefined;
    this.patch.set(this.eventCard, this.eventHtml(ev));
    if (opening) {
      layer.hidden = false;
      this.syncModal();
    }
    if (!this.overlayOpen) {
      if (opening || newScene) this.focusChoice();
      else if (focusedAct && !this.eventCard.contains(document.activeElement)) this.focusChoice(focusedAct);
    }
    for (const el of this.eventCard.querySelectorAll<HTMLElement>('[data-cd]')) {
      const bar = el.querySelector<HTMLElement>('.cd');
      if (bar) bar.style.transform = `scaleX(${this.g.cooldowns.progress(el.dataset.cd!)})`;
    }
  }

  private focusChoice(act?: string): void {
    const choices = [...this.eventCard.querySelectorAll<HTMLElement>('.choice')];
    const target =
      (act && choices.find((c) => c.dataset.act === act)) || choices.find((c) => c.getAttribute('aria-disabled') !== 'true') || choices[0] || this.eventCard;
    target.focus({ preventScroll: true });
  }

  private pressEvent(id: string): void {
    if (!this.begun || this.overlayOpen) return;
    this.eventOutcome.choose(id);
  }

  // ------------------------------------------------------------------ title & settings

  private begin(): void {
    if (this.begun) return;
    this.begun = true;
    this.guideUntil = performance.now() + 9000;
    this.root.dataset.begun = '';
    this.titleLayer.hidden = true;
    this.host.begin();
    this.syncModal();
    if (this.settingsLayer.hidden) this.canvas.focus({ preventScroll: true });
  }

  /** focus the title screen's main button (after the page is laid out) */
  focusStart(): void {
    if (!this.titleLayer.hidden) this.root.querySelector<HTMLElement>('.begin')?.focus({ preventScroll: true });
  }

  private openSettings(opener: HTMLElement | null): void {
    if (!this.settingsLayer.hidden) return;
    this.settingsReturn = opener;
    this.exportCode.hidden = true;
    this.exportCode.value = '';
    this.copyBtn.hidden = true;
    this.importError.textContent = '';
    this.confirmBox.hidden = true;
    this.restartBox.hidden = false;
    this.settingsLayer.hidden = false;
    this.syncChoices();
    this.syncModal();
    this.settingsCard.focus({ preventScroll: true });
  }

  private closeSettings(): void {
    if (this.settingsLayer.hidden) return;
    this.settingsLayer.hidden = true;
    this.syncModal();
    if (!this.eventLayer.hidden && this.titleLayer.hidden) this.focusChoice();
    else if (!this.buildLayer.hidden) this.buildCard.focus({ preventScroll: true });
    else if (this.settingsReturn?.isConnected) this.settingsReturn.focus({ preventScroll: true });
    else this.focusStart();
  }

  private syncChoices(): void {
    const pressed: Record<string, boolean> = {
      'lang:zh': this.host.language === 'zh',
      'lang:en': this.host.language === 'en',
      'sound:on': this.host.sound,
      'sound:off': !this.host.sound,
      'motion:system': this.host.motion === 'system',
      'motion:reduce': this.host.motion === 'reduce',
      'motion:full': this.host.motion === 'full'
    };
    for (const el of this.root.querySelectorAll<HTMLElement>('.seg [data-act]')) {
      el.setAttribute('aria-pressed', String(Boolean(pressed[el.dataset.act!])));
    }
  }

  /** inert everything below the topmost open dialog */
  private syncModal(): void {
    const feedback = this.feedback.opened;
    const settings = !this.settingsLayer.hidden;
    const title = !this.titleLayer.hidden;
    const event = !this.eventLayer.hidden;
    const building = !this.buildLayer.hidden;
    const under = feedback || settings || title || event || building;
    this.header.inert = under || this.g.over;
    this.stage.inert = under || this.host.expeditionOpen || this.host.endgameOpen;
    this.settingsLayer.inert = feedback;
    this.titleLayer.inert = feedback || settings;
    this.eventLayer.inert = feedback || settings || title;
    this.buildLayer.inert = feedback || settings || title || event;
    if (under) this.hovering = false;
  }

  private topDialog(): HTMLElement | null {
    if (this.feedback.opened) return this.feedback.card;
    if (!this.settingsLayer.hidden) return this.settingsCard;
    if (!this.titleLayer.hidden) return this.titleCard;
    if (!this.eventLayer.hidden) return this.eventCard;
    if (!this.buildLayer.hidden) return this.buildCard;
    return null;
  }

  private exportSave(): void {
    this.exportCode.value = this.g.exportCode();
    this.exportCode.hidden = false;
    this.copyBtn.hidden = false;
    this.copyBtn.textContent = this.ui('settings.copy');
    this.exportCode.focus({ preventScroll: true });
    this.exportCode.select();
  }

  private async copySave(): Promise<void> {
    const code = this.exportCode.value;
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      this.exportCode.select();
      ok = document.execCommand?.('copy') ?? false;
    }
    if (!ok) return;
    this.copyBtn.textContent = this.ui('settings.copied');
    this.announce(this.ui('settings.copied'));
    window.clearTimeout(this.timers.copied);
    this.timers.copied = window.setTimeout(() => (this.copyBtn.textContent = this.ui('settings.copy')), 1600);
  }

  private importSave(): void {
    const code = this.importCode.value.trim();
    if (!code || !this.host.importSave(code)) {
      this.importError.textContent = this.ui('settings.invalid');
      this.importCode.focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------------ input

  private onClick(e: MouseEvent): void {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-act]');
    if (!el || !this.root.contains(el)) return;
    const act = el.dataset.act!;
    const i = act.indexOf(':');
    const kind = i < 0 ? act : act.slice(0, i);
    const arg = i < 0 ? '' : act.slice(i + 1);
    switch (kind) {
      case 'goal':
        // The overview lives inside the construction modal; close it before following a suggestion.
        if (!this.buildLayer.hidden && !this.g.events.active()) this.closeBuilding(false);
        this.followGoal(el);
        break;
      case 'prop':
        if (arg === 'cart' || arg === 'trap') this.openBuilding(el, arg);
        break;
      case 'use':
        if (!this.buildLayer.hidden && !this.g.events.active() && (arg === 'cart' || arg === 'trap' || arg === 'hut') && this.g.store.num(`game.buildings.${arg}`) > 0 && (arg !== 'hut' || this.host.villageReady)) {
          this.closeBuilding(false);
          this.host.travel(arg === 'hut' ? 'village' : 'outside');
        }
        break;
      case 'build-open':
        this.openBuilding(el);
        break;
      case 'build-close':
        this.closeBuilding();
        break;
      case 'build':
        this.makeBuilding(arg);
        break;
      case 'settlement-tab':
        if (!this.buildLayer.hidden && SETTLEMENT_TABS.includes(arg as SettlementTab)) { this.buildTab = arg as SettlementTab; this.buildResult.textContent = ''; this.renderBuilding(); }
        break;
      case 'settlement-all':
        if (!this.buildLayer.hidden) { this.buildZone = null; this.renderBuilding(); }
        break;
      case 'facility':
        if (!this.buildLayer.hidden && this.g.store.num(`game.buildings["${arg}"]`) > 0) {
          if (this.forest.place !== 'village') { this.closeBuilding(false); this.host.travel('village'); }
          else { this.buildTab = arg === 'trading post' ? 'buy' : arg === 'workshop' ? 'craft' : 'workers'; this.renderBuilding(); }
        }
        break;
      case 'craft':
      case 'buy':
        if (!this.buildLayer.hidden && !this.arrivalPlaying && (kind === 'craft' ? this.workshop.craft(arg) : this.workshop.buy(arg))) {
          this.buildResult.textContent = this.ui(kind === 'buy' ? 'settlement.bought' : 'build.success', this.g.t(arg)); this.renderBuilding();
        }
        break;
      case 'worker': {
        const split = arg.lastIndexOf(':'), job = arg.slice(0, split), amount = Number(arg.slice(split + 1));
        if (!this.buildLayer.hidden && !this.arrivalPlaying && this.workshop.assign(job, amount)) this.renderBuilding();
        break;
      }
      case 'traps':
        this.checkTraps();
        break;
      case 'tend':
        if (!this.host.skipArrival()) this.tend('hearth');
        break;
      case 'begin':
        this.begin();
        break;
      case 'feedback':
        this.feedback.open(el);
        break;
      case 'settings':
        this.openSettings(el);
        break;
      case 'settings-close':
        this.closeSettings();
        break;
      case 'lang':
        if (arg !== this.host.language) this.host.setLanguage(arg as Language);
        break;
      case 'sound':
        this.host.setSound(arg === 'on');
        this.syncChoices();
        break;
      case 'motion':
        this.host.setMotion(arg as MotionPref);
        this.syncChoices();
        break;
      case 'export':
        this.exportSave();
        break;
      case 'copy':
        void this.copySave();
        break;
      case 'import':
        this.importSave();
        break;
      case 'restart':
        this.restartBox.hidden = true;
        this.confirmBox.hidden = false;
        this.root.querySelector<HTMLElement>('[data-act="restart-no"]')?.focus({ preventScroll: true });
        break;
      case 'restart-no':
        this.cancelRestart();
        break;
      case 'restart-yes':
        this.host.restart();
        break;
      case 'event':
        this.pressEvent(arg);
        break;
      case 'tab':
        if (arg === 'path' && this.canInteract() && !this.arrivalPlaying) this.host.openExpedition();
        else if ((arg === 'fabricator' || arg === 'ship') && this.canInteract() && !this.arrivalPlaying) this.host.openEndgame(arg);
        else if (this.canInteract() && !this.arrivalPlaying && (arg === 'room' || arg === 'outside' || arg === 'village')) this.host.travel(arg);
        else this.deny(this.ui('tab.soon'));
        break;
    }
  }

  private cancelRestart(): void {
    this.confirmBox.hidden = true;
    this.restartBox.hidden = false;
    this.root.querySelector<HTMLElement>('[data-act="restart"]')?.focus({ preventScroll: true });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    if (e.key === 'Tab') {
      this.trapTab(e);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (this.feedback.opened) {
        e.preventDefault();
        this.feedback.close();
      } else if (!this.settingsLayer.hidden) {
        e.preventDefault();
        if (!this.confirmBox.hidden) this.cancelRestart();
        else this.closeSettings();
      } else if (!this.buildLayer.hidden) {
        e.preventDefault();
        this.closeBuilding();
      } else if (this.host.skipArrival()) {
        e.preventDefault();
      }
      return;
    }
    if (e.repeat || isTyping(e.target) || this.overlayOpen || this.host.expeditionOpen) return;
    if (this.g.events.active()) {
      const n = digitOf(e.code);
      const b = n ? this.g.events.buttons()[n - 1] : undefined;
      if (b) {
        e.preventDefault();
        this.pressEvent(b.id);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        this.tend('key');
      }
      return;
    }
    if (e.code === 'KeyF' || ((e.key === ' ' || e.key === 'Enter') && !isInteractive(e.target))) {
      e.preventDefault();
      this.tend('key');
    }
  }

  private trapTab(e: KeyboardEvent): void {
    const box = this.topDialog();
    if (!box) return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hidden && el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled
    );
    const active = document.activeElement;
    if (!items.length) {
      e.preventDefault();
      box.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const inside = active instanceof Node && box.contains(active);
    if (e.shiftKey && (!inside || active === first || active === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || active === last)) {
      e.preventDefault();
      first.focus();
    }
  }
}
