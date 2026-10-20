import './endgame.css';
import { BEACON_OUTRO, Endgame, FABRICATOR_PURPOSES } from '../app/endgame';
import { FABRICATOR, SHIP } from '../core/data';
import { EndgameRenderer } from '../pixel/endgame';
import { endgameScene } from '../app/endgame-visuals';
import type { SampleMode } from '../pixel/resample';
import { esc, isTyping, Patch } from './dom';

export class EndgamePanel {
  readonly root = document.createElement('section');
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: EndgameRenderer;
  private readonly side: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly patch = new Patch();
  private lastUpdate = -Infinity;
  private visible = false;
  private blocked = true;
  private dragging = false;
  private lastPlace = '';
  private readonly t = (zh: string, en: string) => this.model.game.i18n.lang === 'zh' ? zh : en;

  constructor(parent: HTMLElement, readonly model: Endgame, private readonly goHome: () => void, private readonly next: () => void, sample: SampleMode = 'mode') {
    const t = this.t;
    this.root.className = 'endgame-panel'; this.root.hidden = true;
    this.root.setAttribute('aria-label', t('流浪者的归途', 'The wanderer’s way home'));
    this.root.innerHTML = `<div class="eg-wrap"><div class="eg-heading"><div><span class="eyebrow">${t('火光之外', 'Beyond the firelight')}</span><h1></h1></div><div class="eg-controls"><button data-late="pause"></button><button data-late="home">${t('回生火间', 'Return to the room')}</button></div></div><p class="eg-banner" role="status" hidden></p><div class="eg-layout"><article><div class="eg-picture"><canvas width="700" height="700" tabindex="0"></canvas><span class="eg-visual-note"></span></div><p class="eg-feedback" role="status"></p></article><aside class="eg-side"></aside></div><p class="eg-help"></p></div>`;
    parent.append(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.renderer = new EndgameRenderer(this.canvas, sample);
    this.side = this.root.querySelector('.eg-side')!;
    this.banner = this.root.querySelector('.eg-banner')!;
    this.feedback = this.root.querySelector('.eg-feedback')!;
    this.root.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-late]');
      if (!this.blocked && button && !button.disabled) this.act(button.dataset.late!);
    });
    const direction: Record<string, 'up' | 'down' | 'left' | 'right'> = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
    document.addEventListener('keydown', e => {
      if (e.defaultPrevented || this.blocked || !model.flying || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'p' && !e.repeat) { e.preventDefault(); this.act('pause'); return; }
      if (model.paused || !direction[key]) return;
      e.preventDefault(); model.game.space.target = null; model.game.space.input[direction[key]] = true;
    });
    document.addEventListener('keyup', e => { const d = direction[e.key.toLowerCase()]; if (d) model.game.space.input[d] = false; });
    window.addEventListener('blur', () => model.pause());
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !this.canSteer()) return;
      this.dragging = true; this.canvas.setPointerCapture(e.pointerId); this.canvas.focus(); this.steer(e);
    });
    this.canvas.addEventListener('pointermove', e => { if (this.dragging && this.canSteer()) this.steer(e); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.canvas.addEventListener(name, () => { this.dragging = false; model.game.space.target = null; });
    model.game.bus.on(event => {
      if (event.type === 'space:crash') this.feedback.textContent = t('飞船坠回地面。船体升级仍保留，等待整备冷却后可再次起飞。', 'The ship falls back. Upgrades remain; wait for recovery before trying again.');
    });
  }

  private canSteer(): boolean { return !this.blocked && this.model.flying && !this.model.paused; }
  private steer(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    // The square canvas is fitted without letterboxing by its CSS aspect ratio.
    this.model.game.space.target = { x: Math.max(10, Math.min(690, (e.clientX - r.left) * 700 / r.width)), y: Math.max(10, Math.min(690, (e.clientY - r.top) * 700 / r.height)) };
  }

  private act(action: string): void {
    const m = this.model, g = m.game, t = this.t;
    if (action === 'pause') m.togglePause();
    else if (action === 'home') { this.goHome(); this.feedback.textContent = ''; }
    else if (action === 'next') { if (m.nextGeneration()) this.next(); }
    else if (action.startsWith('craft:')) {
      const id = action.slice(6);
      if (m.fabricate(id)) { this.feedback.textContent = t('已制成：', 'Fabricated: ') + g.t(FABRICATOR[id].name) + ` × ${FABRICATOR[id].quantity ?? 1}`; this.renderer.pulse(g); }
    } else if (action === 'hull' || action === 'engine') {
      if (m.upgrade(action)) { this.feedback.textContent = t(action === 'hull' ? '船体已加固。' : '引擎已升级。', action === 'hull' ? 'Hull reinforced.' : 'Engine upgraded.'); this.renderer.pulse(g); }
    } else if (action === 'launch') { if (m.launch()) this.feedback.textContent = ''; }
    this.update();
  }

  prepareArt(): Promise<void> { return this.renderer.prepare(); }

  frame(now: number, blocked: boolean, reduced: boolean): void {
    const show = this.model.opened;
    this.root.hidden = !show;
    this.root.inert = blocked;
    if (blocked && this.model.flying) this.model.game.space.clearInput();
    this.blocked = blocked;
    if (!show) { this.visible = false; return; }
    const place = this.model.ending ? 'ending' : this.model.game.active ?? '';
    if (place !== this.lastPlace) { this.lastPlace = place; this.feedback.textContent = ''; }
    if (!this.visible && !blocked) { this.canvas.focus({ preventScroll: true }); this.visible = true; }
    if (now - this.lastUpdate > 100) { this.update(); this.lastUpdate = now; }
    this.renderer.render(this.model.game, this.model.ending, reduced);
  }

  private update(): void {
    const m = this.model, g = m.game, t = this.t, end = m.ending;
    const flying = m.flying;
    const title = end ? t('群星之间', 'Among the stars') : flying ? g.space.title() : g.title();
    const titleEl = this.root.querySelector('h1')!;
    titleEl.textContent = end ? title : g.t(title);
    const scene = endgameScene(g.active, end), source = this.renderer.source(scene);
    this.canvas.setAttribute('aria-label', end ? end.expansion ? t('寂静的母舰队：巨大的残破世界舰漂浮在碎片之间。', 'The silent homefleet: scarred worldships drift among debris.') : t('逃离星球：独行飞船驶离碎片云。', 'Escape: a lone craft leaves the debris cloud behind.') : flying ? t(`升空：高度 ${g.space.altitude}，船体 ${g.space.hull}，位置 ${Math.round(g.space.shipX)}，${Math.round(g.space.shipY)}`, `Ascent: altitude ${g.space.altitude}, hull ${g.space.hull}, position ${Math.round(g.space.shipX)}, ${Math.round(g.space.shipY)}`) : g.active === 'fabricator' ? t('制造机：幽暗工坊中的合金加工装置。', 'Fabricator: an alloy machine in a dim workshop.') : t('飞船整备：林间空地上的破旧星舰。', 'Shipyard: a weathered starship in a forest clearing.'));
    const pause = this.root.querySelector<HTMLButtonElement>('[data-late="pause"]')!;
    pause.hidden = !flying; pause.textContent = m.paused ? t('继续', 'Continue') : t('暂停', 'Pause');
    this.root.querySelector<HTMLElement>('[data-late="home"]')!.hidden = flying || Boolean(end);
    this.banner.hidden = !flying || !m.paused;
    this.banner.textContent = t('升空已暂停。飞船、陨石和所有计时均已冻结，点击“继续”恢复。', 'Ascent paused. Ship, asteroids and all timers resume when you continue.');
    this.root.querySelector('.eg-visual-note')!.textContent = source === 'fallback' ? t('简化画面 · 素材未能载入', 'Simplified view · Artwork unavailable') : end ? end.expansion ? t('寂静的母舰队', 'The silent homefleet') : t('碎片云已在身后', 'Beyond the debris cloud') : flying ? t('穿过碎片云', 'Through the debris cloud') : g.active === 'fabricator' ? t('合金工坊 · 流浪者技术', 'Alloy workshop · Wanderer technology') : t('林间整备场 · 破旧星舰', 'Forest shipyard · A weathered starship');
    this.root.querySelector('.eg-help')!.textContent = flying ? t('方向键 / WASD 移动 · 按住画布拖动驾驶 · P 暂停 · 切离页面、设置和读档后暂停', 'Arrows / WASD to steer · Drag on the canvas · P to pause · Pauses on hiding, settings and reload') : end ? t('你的分数和上一代遗留物资将保留到下一轮。', 'Your score and inherited supplies carry into the next generation.') : g.active === 'fabricator' ? t('蓝图带回村庄后会解锁对应配方。成品存入仓库，出发前可装进行囊。', 'Bring blueprints home to unlock recipes. Finished equipment goes into storage, ready to pack.') : t('升空前可以返回村庄继续整备。离开之后，先穿过碎片云再寻找归途。', 'Return to the village to prepare before launch. Once aloft, cross the debris cloud to find your way home.');
    const stat = (label: string, value: string | number) => `<div class="stat"><span>${esc(label)}</span><strong>${esc(String(value))}</strong></div>`;
    const button = (action: string, label: string, disabled = false, primary = false) => `<button data-late="${esc(action)}"${disabled ? ' disabled' : ''}${primary ? ' class="primary"' : ''}>${esc(label)}</button>`;
    const alloy = g.store.num('stores["alien alloy"]');
    let html = '';
    if (end) {
      html = `<h2>${end.expansion ? t('寂静的母舰队', 'The silent homefleet') : t('终于离开了这块岩石', 'Free of this rock at last')}</h2>` + (end.expansion ? BEACON_OUTRO.map(p => `<p class="eg-end-copy">${esc(g.t(p))}</p>`).join('') : `<p class="eg-end-copy">${t('碎片云渐渐远去。你终于回到了太空。', 'The debris cloud falls away. You are in space at last.')}</p>`) + stat(t('本轮得分', 'This generation'), end.score.toLocaleString()) + stat(t('累计得分', 'Total score'), end.total.toLocaleString()) + `<p class="subtle">${t('下一代将从一间寒冷的小屋重新开始。上一代遗留的部分物资，等待你在世界中找回。', 'Begin again in a cold room. Some of the previous generation’s supplies await discovery in the world.')}</p>` + button('next', t('开始下一轮', 'Begin the next generation'), false, true);
    } else if (flying) {
      const s = g.space;
      html = `<h2>${t('升空', 'Ascent')}</h2>` + stat(t('船体', 'Hull'), `${s.hull} / ${g.ship.hull}`) + stat(t('引擎', 'Engine'), g.ship.thrusters) + stat(t('高度', 'Altitude'), `${s.altitude} / 60`) + `<progress aria-label="${t('升空进度', 'Ascent progress')}" value="${s.progress()}" max="1"></progress><p>${t('避开陨石，穿过碎片云。坚持 60 秒即可到达舰队。', 'Dodge asteroids through the debris cloud. Survive 60 seconds to reach the fleet.')}</p><p class="subtle">${t('船体耗尽会坠回地面，已有升级不会消失。', 'If the hull fails, you return to the ground with upgrades intact.')}</p>`;
    } else if (g.active === 'ship') {
      const cooldown = Math.ceil(g.cooldowns.remaining('liftoffButton') / 1000);
      html = `<h2>${t('整备飞船', 'Prepare the starship')}</h2>` + stat(g.t('alien alloy'), alloy) + stat(t('船体', 'Hull'), g.ship.hull) + stat(t('引擎', 'Engine'), g.ship.thrusters) + `<p class="subtle">${t('船体增加可承受的撞击次数，引擎提高驾驶速度。', 'Hull increases impact tolerance; engines increase steering speed.')}</p>` + button('hull', t(`加固船身 · 合金 ${SHIP.ALLOY_PER_HULL}`, `Reinforce hull · Alloy ${SHIP.ALLOY_PER_HULL}`), !m.canUpgrade('hull')) + button('engine', t(`升级引擎 · 合金 ${SHIP.ALLOY_PER_THRUSTER}`, `Upgrade engine · Alloy ${SHIP.ALLOY_PER_THRUSTER}`), !m.canUpgrade('engine')) + (g.ship.hull < 1 ? `<p class="warn">${t('先加固船体，才能承受升空。', 'Reinforce the hull before lift-off.')}</p>` : '') + (cooldown ? `<p class="warn">${t('整备冷却：', 'Recovery: ')}${cooldown} s</p>` : '') + (m.crashed ? `<p class="warn">${t('上次升空失败，可在整备后重试。', 'The last ascent failed. Recover and try again.')}</p>` : '') + button('launch', t('点火起飞', 'Lift off'), !g.ship.canLiftOff(), true);
    } else {
      const rows = m.recipes();
      html = `<h2>${t('嗡鸣的制造机', 'A whirring fabricator')}</h2>` + stat(g.t('alien alloy'), alloy) + `<p class="subtle">${t('以外星合金制造流浪者装备。探索战舰可找到更多蓝图。', 'Shape alien alloy into wanderer equipment. Explore the battleship to find more blueprints.')}</p>` + rows.filter(row => row.available).map(row => {
        const item = FABRICATOR[row.id];
        const missing = Object.entries(row.missing).map(([id, n]) => `${g.t(id)} ${n}`).join(' · ');
        return `<section class="eg-recipe"><h3>${esc(g.t(item.name))}${item.quantity ? ` × ${item.quantity}` : ''}</h3><p class="subtle">${esc(g.t(FABRICATOR_PURPOSES[row.id]))}</p><p class="subtle">${t('持有：', 'Owned: ')}${g.store.num(`stores["${row.id}"]`)}</p><p class="subtle">${t('消耗：', 'Cost: ')}${Object.entries(row.cost).map(([id, n]) => `${esc(g.t(id))} ${n}`).join(' · ')}</p>${missing ? `<p class="warn">${t('还缺：', 'Missing: ')}${esc(missing)}</p>` : ''}${button('craft:' + row.id, row.maxed ? t('已达上限', 'Maximum reached') : t('制造', 'Fabricate') + ' · ' + g.t(item.name), row.maxed || Boolean(missing))}</section>`;
      }).join('') + `<p class="subtle">${t('尚待发现的蓝图配方：', 'Blueprint recipes awaiting discovery: ')}${rows.filter(row => !row.available).length}</p>`;
    }
    const focus = (document.activeElement as HTMLElement | null)?.dataset.late;
    this.patch.set(this.side, html);
    if (focus && !this.root.contains(document.activeElement)) [...this.side.querySelectorAll<HTMLElement>('[data-late]')].find(el => el.dataset.late === focus)?.focus({ preventScroll: true });
  }
}
