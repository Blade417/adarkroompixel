import './expedition.css';
import { Expedition } from '../app/expedition';
import { sitePresentation } from '../app/expedition-art';
import { TILE, WEAPONS, WORLD } from '../core/data';
import type { Direction } from '../core/locations/world';
import type { ExpeditionRenderer } from '../pixel/expedition';
import { esc, isTyping, Patch } from './dom';
import type { Status } from '../core/events/combat';
import { ARMOUR_NAMES, visibleWeapon } from '../app/expedition-equipment';

const COMBAT_STATUS: Record<Exclude<Status, 'none'>, string> = {
  shield: 'Shield: the next hit heals instead of hurting.',
  energised: 'Energised: the next hit deals four times the damage.',
  venomous: 'Venomous: the next hit inflicts lingering poison.',
  enraged: 'Enraged: attacks much faster for a short time.',
  meditation: 'Meditating: stores incoming damage for a counterattack.',
  boost: 'Boosted: weapon cooldowns are halved.',
  exploding: 'Unstable core: explosion imminent.'
};

/** Live UI. The main game owns its clock, storage, audio and lifecycle. */
export class ExpeditionPanel {
  readonly root = document.createElement('section');
  private readonly patch = new Patch();
  private renderer: ExpeditionRenderer | null = null;
  private loading = false;
  private artFailed = false;
  private lastUi = -Infinity;
  private lastOpened = false;
  private lastEvent = '';
  private blocked = true;
  private readonly canvas: HTMLCanvasElement;
  private readonly side: HTMLElement;
  private readonly narrative: HTMLElement;
  private readonly attacks: HTMLElement;
  private readonly utilities: HTMLElement;
  private readonly text = (zh: string, en: string) => this.expedition.game.i18n.lang === 'zh' ? zh : en;

  constructor(parent: HTMLElement, readonly expedition: Expedition, private readonly onClose: () => void) {
    this.root.className = 'expedition-panel'; this.root.hidden = true;
    this.root.setAttribute('aria-label', this.text('远行', 'Expedition'));
    const t = this.text;
    this.root.innerHTML = `<div class="exp-content"><div class="exp-heading"><div><span class="eyebrow">${t('村庄之外', 'Beyond the village')}</span><h1></h1></div><div><button data-exp="pause"></button> <button data-exp="close">${t('回生火间', 'Return to the room')}</button></div></div>
      <p class="exp-paused" role="status" hidden>${t('远行已暂停。战斗、冷却和村庄时间均已暂停，点击“继续”恢复。', 'Paused. Combat, cooldowns and village time resume when you continue.')}</p>
      <div class="exp-layout"><div><div class="exp-scene"><canvas width="1152" height="648" tabindex="0" aria-label="${t('远行地图', 'Expedition map')}"></canvas><span class="exp-place"></span><div class="exp-health" hidden></div><div class="exp-loading" role="status">${t('正在载入远行素材…', 'Loading expedition art…')}</div></div>
      <div class="exp-equipment" aria-label="${t('当前装备', 'Current equipment')}"></div><div class="exp-attacks actions"></div><div class="exp-utilities actions"></div><article class="exp-narrative" aria-live="polite"></article><div class="exp-log" role="log"></div></div><aside class="exp-side" aria-label="${t('行囊与归途', 'Supplies and return route')}"></aside></div>
      <p class="exp-help">${t('WASD / 方向键逐格移动 · 数字键使用对应武器或选项 · E 吃肉 · P 暂停 · 战利品需装入行囊并带回村庄', 'WASD / arrows to move · Numbers for attacks or choices · E to eat · P to pause · Pack loot and bring it home')}</p></div>`;
    parent.append(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.side = this.root.querySelector('.exp-side')!;
    this.narrative = this.root.querySelector('.exp-narrative')!;
    this.attacks = this.root.querySelector('.exp-attacks')!;
    this.utilities = this.root.querySelector('.exp-utilities')!;
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-exp]');
      if (button && !button.disabled) this.act(button.dataset.exp!);
    });
    this.canvas.addEventListener('click', event => {
      if (this.blocked || this.expedition.paused || this.expedition.phase !== 'world') return;
      this.canvas.focus();
      const r = this.canvas.getBoundingClientRect();
      const dx = Math.floor(((event.clientX - r.left) * 576 / r.width - 264) / 48);
      const dy = Math.floor(((event.clientY - r.top) * 324 / r.height - 138) / 48);
      if (Math.abs(dx) + Math.abs(dy) === 1) this.act('move:' + (dx < 0 ? 'west' : dx > 0 ? 'east' : dy < 0 ? 'north' : 'south'));
    });
    document.addEventListener('keydown', event => {
      if (!expedition.opened || this.blocked || event.defaultPrevented || event.repeat || isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'p') { event.preventDefault(); this.act('pause'); return; }
      if (expedition.paused) return;
      const dirs: Record<string, Direction> = { arrowup: 'north', w: 'north', arrowdown: 'south', s: 'south', arrowleft: 'west', a: 'west', arrowright: 'east', d: 'east' };
      if (expedition.phase === 'world' && dirs[key]) { event.preventDefault(); this.act('move:' + dirs[key]); }
      const combat = expedition.game.events.active()?.combat;
      if (combat && !combat.isOver() && (key === 'e' || (event.code === 'Space' && !(event.target as HTMLElement).closest('button,a,summary')))) {
        event.preventDefault(); this.act(key === 'e' ? 'use:eat' : 'attack:' + expedition.displayWeapon);
      }
      if (/^[1-9]$/.test(key)) {
        const i = Number(key) - 1;
        const action = combat && !combat.isOver() ? combat.attacks()[i] : expedition.game.events.buttons()[i];
        if (action) { event.preventDefault(); this.act((combat && !combat.isOver() ? 'attack:' : 'choice:') + action.id); }
      }
    });
  }

  private ensureArt(): void {
    if (this.loading || this.renderer || this.artFailed) return;
    this.loading = true;
    void import('../pixel/expedition').then(async module => {
      const art = await module.loadExpeditionArt();
      this.renderer = new module.ExpeditionRenderer(this.canvas, art);
      this.root.querySelector<HTMLElement>('.exp-loading')!.hidden = true;
      this.update();
    }).catch(error => {
      this.loading = false;
      this.artFailed = true;
      const loading = this.root.querySelector<HTMLElement>('.exp-loading')!;
      loading.innerHTML = `${esc(this.text('素材加载失败。', 'Art failed to load.'))}${this.button('retry', this.text('重试', 'Retry'))}`;
      console.error('[expedition]', error);
    });
  }

  frame(now: number, blocked: boolean, reduced: boolean): void {
    const opened = this.expedition.opened;
    this.root.hidden = !opened;
    this.blocked = blocked; this.root.inert = blocked;
    if (!opened) { this.lastOpened = false; return; }
    this.ensureArt();
    if (!this.lastOpened && !blocked) this.canvas.focus({ preventScroll: true });
    this.lastOpened = !blocked;
    if (now - this.lastUi >= 80) { this.update(); this.lastUi = now; }
    this.renderer?.render(this.expedition, reduced);
  }

  private button(action: string, label: string, disabled = false, primary = false, accessibleLabel?: string): string {
    return `<button data-exp="${esc(action)}"${accessibleLabel ? ` aria-label="${esc(accessibleLabel)}"` : ''}${primary ? ' class="primary"' : ''}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
  }

  private act(action: string): void {
    const ex = this.expedition, g = ex.game;
    if (this.blocked) return;
    if (action === 'retry') { this.artFailed = false; this.ensureArt(); return; }
    if (action === 'pause') { ex.paused = !ex.paused; g.saveNow(); this.update(); return; }
    if (action === 'close') { if (ex.close()) this.onClose(); this.update(); return; }
    if (ex.paused || !this.renderer) return;
    const split = action.indexOf(':'), id = action.slice(split + 1), kind = split < 0 ? action : action.slice(0, split);
    if (kind === 'depart') ex.depart();
    else if (kind === 'again') ex.prepareAgain();
    else if (kind === 'move') ex.move(id as Direction);
    else if (kind === 'more') ex.pack(id, 1);
    else if (kind === 'less') ex.pack(id, -1);
    else if (kind === 'attack') ex.attack(id);
    else if (kind === 'use') g.events.active()?.combat?.use(id);
    else if (kind === 'take') g.events.take(id);
    else if (kind === 'all') g.events.takeAll(id);
    else if (kind === 'drop') g.events.drop(id, 1);
    else if (kind === 'choice') g.events.click(id, this.narrative.querySelector('textarea')?.value);
    g.saveNow(); this.update();
  }

  private update(): void {
    const ex = this.expedition, g = ex.game, t = this.text, phase = ex.phase;
    this.root.dataset.phase = phase;
    const ev = g.events.active(), combat = ev?.combat, world = g.active === 'world';
    const disabled = ex.paused || !this.renderer;
    const name = (id: string) => esc(g.t(id));
    const number = (n: number) => Number(n.toFixed(1));
    const stat = (label: string, value: string | number) => `<div class="stat"><span>${esc(label)}</span><strong>${esc(String(value))}</strong></div>`;
    const inventory = Object.entries(g.path.outfit).filter(([, n]) => n > 0);
    const inventoryHtml = inventory.map(([id, n]) => `${name(id)} × ${n}`).join(' · ') || t('行囊是空的', 'Empty bag');
    const costs = (cost?: Record<string, number>) => Object.entries(cost ?? {}).map(([id, n]) => `${name(id)} ${n}`).join(' · ');
    const setText = (selector: string, value: string) => { const el = this.root.querySelector(selector)!; if (el.textContent !== value) el.textContent = value; };
    const heading = ev ? ev.scene.title ?? ev.def.title : phase === 'pack' ? t('把火光留在身后', 'Leave the firelight behind') : phase === 'home' ? t('平安归来', 'Home again') : phase === 'dead' ? t('这次没有走回来', 'The world fades') : t('沿着足迹，记住归途', 'Remember the way home');
    setText('h1', heading);
    setText('[data-exp="pause"]', ex.paused ? t('继续', 'Continue') : t('暂停', 'Pause'));
    this.root.querySelector<HTMLElement>('.exp-paused')!.hidden = !ex.paused;
    this.root.querySelector<HTMLButtonElement>('[data-exp="close"]')!.hidden = world || Boolean(ev);
    const tile = world ? g.world.state!.map[g.world.curPos[0]][g.world.curPos[1]] : TILE.VILLAGE;
    const landmark = g.world.LANDMARKS[tile.replace(/!$/, '')];
    const place = landmark ? g.t(landmark.label.replaceAll('&nbsp;', ' ')) : tile === TILE.FOREST ? t('森林', 'Forest') : tile === TILE.FIELD ? t('草原', 'Fields') : tile === TILE.BARRENS ? t('荒地', 'Barrens') : tile === TILE.ROAD ? t('道路', 'Road') : t('村庄', 'Village');
    setText('.exp-place', world ? `${place} · ${t('距村', 'Distance')} ${g.world.getDistance()}` : t('聚落林缘', 'Village outskirts'));
    const site = sitePresentation(g);
    setText('.exp-equipment', `${g.t(ARMOUR_NAMES[g.path.armour()])} · ${g.t(visibleWeapon(ex))}`);
    const sceneLabel = site ? g.t(ev!.def.title) : place;
    this.canvas.setAttribute('aria-label', combat ? `${sceneLabel} · ${t('战斗', 'Combat')}: ${g.t(ev?.scene.enemyName ?? ev?.scene.enemy ?? '')}` : `${site ? t('地点场景', 'Location scene') : t('远行地图', 'Expedition map')} · ${sceneLabel}`);
    const health = this.root.querySelector<HTMLElement>('.exp-health')!;
    health.hidden = !combat;
    const status = (s: Status) => s === 'none' ? '' : `<small class="exp-combat-status">${esc(g.t(COMBAT_STATUS[s]))}</small>`;
    if (combat) this.patch.set(health, `<div>${t('旅行者', 'Wanderer')} ${g.world.health} / ${g.world.getMaxHealth()}<progress max="${g.world.getMaxHealth()}" value="${g.world.health}"></progress>${status(combat.player.status)}</div><div>${name(ev!.scene.enemyName ?? ev!.scene.enemy ?? '')} ${combat.enemy.hp} / ${combat.enemy.maxHp}${combat.enemy.stunned ? ' · ' + t('击晕', 'Stunned') : ''}<progress max="${combat.enemy.maxHp}" value="${combat.enemy.hp}"></progress>${status(combat.enemy.status)}</div>`);
    const attackActions = combat && !combat.isOver() ? combat.attacks() : [];
    const utilityActions = combat?.utilities() ?? [];
    const attackFocus = (document.activeElement as HTMLElement | null)?.dataset.exp;
    this.patch.set(this.attacks, attackActions.map((a, i) => `<button class="attack" data-exp="attack:${esc(a.id)}"${disabled || !a.enabled ? ' disabled' : ''}><span>${i + 1} · ${name(a.id)} · ${WEAPONS[a.id].damage === 'stun' ? t('击晕', 'Stun') : WEAPONS[a.id].damage}</span><small>${a.cooldown ? t('冷却中', 'Cooling down') : t('就绪', 'Ready')}${a.cost ? ' · ' + costs(a.cost) : ''}</small><i></i></button>`).join(''));
    for (const [i, button] of [...this.attacks.querySelectorAll<HTMLButtonElement>('button')].entries()) {
      button.querySelector<HTMLElement>('i')!.style.width = `${Math.round((1 - attackActions[i].cooldown) * 100)}%`;
      if (attackFocus === button.dataset.exp && !this.root.contains(document.activeElement)) button.focus({ preventScroll: true });
    }
    this.patch.set(this.utilities, utilityActions.map(a => this.button('use:' + a.id, a.text + (a.cost ? ' · ' + costs(a.cost).replace(/<[^>]*>/g, '') : ''), disabled || !a.enabled)).join(''));

    // Preserve text entry/focus when only the combat clock or inventory changes.
    const eventKey = ev ? `${ev.def.title}\0${ev.sceneName}\0${ev.afterCombat}` : '';
    const input = eventKey === this.lastEvent ? this.narrative.querySelector('textarea')?.value : undefined;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.exp;
    this.lastEvent = eventKey;
    const narrative = ev ? (ev.afterCombat ? `<p>${esc(ev.scene.deathMessage ? g.t(ev.scene.deathMessage) : t('敌人倒下了。检查行囊，带走需要的东西。', 'The enemy falls. Check your bag and take what you need.'))}</p>` : (ev.scene.text ?? []).map(p => `<p>${esc(p)}</p>`).join('')) +
      (ev.scene.notification && !ev.afterCombat && !ev.scene.text?.includes(ev.scene.notification) ? `<p class="subtle">${esc(ev.scene.notification)}</p>` : '') +
      (ev.scene.textarea ? `<textarea aria-label="${esc(ev.scene.textarea)}" placeholder="${esc(ev.scene.textarea)}"${ev.scene.readonly ? ' readonly' : ''}></textarea>` : '') +
      g.events.buttons().map((b, i) => this.button('choice:' + b.id, `${i + 1} · ${b.text}${b.cost ? ' (' + costs(b.cost).replace(/<[^>]*>/g, '') + ')' : ''}${ev.scene.buttons?.[b.id]?.reward ? ' + ' + costs(ev.scene.buttons[b.id].reward).replace(/<[^>]*>/g, '') : ''}`, disabled || !b.enabled, true)).join('') : '';
    this.patch.set(this.narrative, narrative);
    this.narrative.hidden = !ev;
    const textarea = this.narrative.querySelector('textarea');
    if (textarea && input !== undefined && textarea.value !== input) textarea.value = input;
    if (focused && !this.root.contains(document.activeElement)) [...this.root.querySelectorAll<HTMLElement>('[data-exp]')].find(el => el.dataset.exp === focused)?.focus({ preventScroll: true });

    let side = '';
    if (phase === 'pack') {
      const armour = { none: t('无', 'None'), leather: t('皮甲', 'Leather'), iron: t('铁甲', 'Iron'), steel: t('钢甲', 'Steel'), kinetic: t('动能护甲', 'Kinetic') };
      side = `<h2>${t('准备行囊', 'Pack supplies')}</h2>` + g.path.carryable().map(item => `<div class="pack-row"><span>${name(item.name)}<small>${t('库存', 'Stock')} ${item.have} · ${t('重量', 'Weight')} ${item.weight}</small></span><div class="stepper">${this.button('less:' + item.name, '−', disabled || !item.packed, false, t('减少', 'Remove ') + g.t(item.name))}<output aria-label="${esc(t('携带', 'Packed ') + g.t(item.name))}">${item.packed}</output>${this.button('more:' + item.name, '+', disabled || item.packed >= item.have || g.path.freeSpace() < item.weight, false, t('增加', 'Pack ') + g.t(item.name))}</div></div>`).join('') +
        stat(t('行囊重量', 'Bag weight'), `${number(g.path.capacity() - g.path.freeSpace())} / ${g.path.capacity()}`) + stat(t('生命上限', 'Max health'), g.world.getMaxHealth()) + stat(t('水量上限', 'Max water'), g.world.getMaxWater()) + stat(t('护甲', 'Armour'), armour[g.path.armour() as keyof typeof armour]) +
        `<p class="subtle">${t('背包、水袋和护甲拥有即生效。至少携带一份熏肉才能出发，建议带上武器并给回程留足补给。', 'Owned bags, water containers and armour apply automatically. Pack at least one cured meat, a weapon and enough supplies to return.')}</p>` +
        (g.cooldowns.isCooling('embarkButton') ? `<p class="warn">${t('再次出发还需等待', 'Recover before leaving')} ${Math.ceil(g.cooldowns.remaining('embarkButton') / 1000)} s</p>` : '') +
        this.button('depart', t('踏上旅途', 'Embark'), disabled || !g.path.canEmbark(), true);
    } else if (world) {
      const [x, y] = g.world.curPos, dx = WORLD.RADIUS - x, dy = WORLD.RADIUS - y;
      const directions = [dx < 0 ? `${t('向西', 'West')} ${-dx}` : dx > 0 ? `${t('向东', 'East')} ${dx}` : '', dy < 0 ? `${t('向北', 'North')} ${-dy}` : dy > 0 ? `${t('向南', 'South')} ${dy}` : ''].filter(Boolean).join(' · ');
      side = `<h2>${t('行囊与归途', 'Supplies and return')}</h2>` + stat(t('生命', 'Health'), `${g.world.health} / ${g.world.getMaxHealth()}`) + stat(t('水', 'Water'), `${g.world.water} / ${g.world.getMaxWater()}`) + stat(t('熏肉', 'Cured meat'), g.path.outfit['cured meat'] ?? 0) + stat(t('剩余负重', 'Free capacity'), `${number(g.path.freeSpace())} / ${g.path.capacity()}`) + `<p class="inventory">${inventoryHtml}</p><h3>${t('村庄方向', 'Way home')}</h3><p>${directions || t('就在这里', 'You are here')} · ${g.world.getDistance()} ${t('格', 'steps')}</p>` +
        `<p class="subtle">${t('走回村庄才能保住本次发现与收获。战斗吃肉也会消耗回程口粮。', 'Return to the village to keep discoveries and loot. Healing with meat also uses travel food.')}</p>` +
        (g.world.water <= g.world.getDistance() + 1 || (g.path.outfit['cured meat'] ?? 0) <= Math.ceil(g.world.getDistance() / 2) + 1 ? `<p class="warn">${t('归途补给已不宽裕，建议折返。', 'Return supplies are running low. Consider turning back.')}</p>` : '') +
        `<div class="dpad" aria-label="${t('移动方向', 'Movement')}">${(['north', 'west', 'south', 'east'] as const).map((d, i) => `<button class="${d}" data-exp="move:${d}" aria-label="${[t('向北', 'North'), t('向西', 'West'), t('向南', 'South'), t('向东', 'East')][i]}"${disabled || phase !== 'world' ? ' disabled' : ''}>${['↑', '←', '↓', '→'][i]}</button>`).join('')}</div>`;
      if (ev && (!combat || ev.afterCombat)) {
        const loot = Object.entries(ev.loot ?? {});
        if (loot.length || ev.afterCombat) side = `<section class="exp-loot"><h2>${t('战利品', 'Loot')}</h2>` + loot.map(([id, n]) => `<div class="loot-row"><span>${name(id)} × ${n}</span>${this.button('take:' + id, t('拿 1', 'Take 1'), disabled || g.path.weight(id) > g.path.freeSpace())}${this.button('all:' + id, t('尽量装', 'Take max'), disabled || g.path.weight(id) > g.path.freeSpace())}</div>`).join('') +
          `<details><summary>${t('丢弃物品腾出空间', 'Drop items to make room')}</summary>${inventory.map(([id]) => `<div class="loot-row"><span>${name(id)}</span>${this.button('drop:' + id, '−1', disabled)}</div>`).join('')}</details><p class="subtle">${t('未装入的物品将在离开地点时留下。', 'Unpacked loot is left behind when you leave.')}</p></section>` + side;
      }
      const revealed = new Map<string, string>();
      const mask = g.world.state!.mask, map = g.world.state!.map;
      for (let mx = 0; mx < map.length; mx++) for (let my = 0; my < map[mx].length; my++) {
        const symbol = map[mx][my].replace(/!$/, '');
        if (mask[mx]?.[my] && g.world.LANDMARKS[symbol]) revealed.set(symbol, g.world.LANDMARKS[symbol].label);
      }
      if (revealed.size) side += `<details><summary>${t('已发现的地标', 'Discovered landmarks')}</summary><p class="subtle">${[...revealed].map(([symbol, label]) => `${esc(symbol)} · ${esc(g.t(label.replaceAll('&nbsp;', ' ')))}`).join('<br>')}</p></details>`;
    } else if (phase === 'home') {
      side = `<h2>${t('平安归来', 'Home again')}</h2><p class="subtle">${t('本次远行的收获与消耗：', 'Loot and supplies used this trip:')}</p><div class="receipt">${Object.entries(ex.receipt ?? {}).map(([id, n]) => `${name(id)} ${n > 0 ? '+' : '−'}${Math.abs(n)}`).join('<br>') || t('物资没有变化', 'No supply changes')}</div><p class="subtle">${t('剩余补给和战利品已入库。本表只统计这次行囊的净变化，不计村庄的日常产出。', 'Remaining supplies and loot are in storage. This lists changes to your expedition bag, excluding village production.')}</p>${this.button('again', t('准备下一次远行', 'Prepare another trip'), disabled, true)}`;
    } else if (phase === 'dead') side = `<h2>${t('远行失败', 'Expedition lost')}</h2><p class="warn">${t('携带物资和本次未带回的发现已失去。村庄仍在，休息后可以再次出发。', 'Carried supplies and uncommitted discoveries are lost. The village remains; rest before leaving again.')}</p>${this.button('again', t('查看行囊', 'Prepare supplies'), disabled, true)}`;
    else side = `<h2>${t('旅途中的片刻', 'A moment on the path')}</h2><p>${t('处理眼前的事件后可以继续准备行囊。', 'Resolve the event to continue packing.')}</p>`;
    this.patch.set(this.side, side);
    this.patch.set(this.root.querySelector('.exp-log'), g.notifications.log.filter(entry => entry.location === 'world' || entry.location === null).slice(-3).map(entry => `<p>${esc(entry.text)}</p>`).join(''));
  }
}
