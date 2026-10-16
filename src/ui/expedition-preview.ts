import './expedition-preview.css';
import { browserContent, zhDictionaries } from '../app/content';
import { ExpeditionSlice } from '../app/expedition-slice';
import { EARLY_ENCOUNTERS, SLICE_SUPPLIES, weaponLabel } from '../app/expedition-catalog';
import expeditionZh from '../i18n/zh-expedition.json';
import { ExpeditionRenderer, loadExpeditionArt } from '../pixel/expedition';
import { AudioManager } from '../app/audio';
import { TILE, WEAPONS, WORLD } from '../core/data';
import type { Direction } from '../core/locations/world';
import { esc, Patch } from './dom';

const app = document.getElementById('expedition-app')!;
app.innerHTML = `
  <header class="slice-header"><strong>余烬之境</strong><span>第一次远行 · 武器与遭遇样片</span></header>
  <main class="slice-main">
    <div class="slice-intro"><div><span class="eyebrow">村庄之外</span><h1 id="chapter">把火光留在身后</h1><p class="subtle">装好行囊，踏上旅途。记住回村的方向，也给归途留一份口粮。</p></div><a href="../../../">返回游戏</a></div>
    <div class="slice-layout">
      <section aria-label="远行场景与行动">
        <div class="scene-frame"><canvas width="1152" height="648" tabindex="0" aria-label="森林远行地图"></canvas>
          <div class="scene-label"><b></b><span id="place">聚落林缘</span></div><span class="scene-state" id="scene-state"></span>
          <div class="scene-hp" hidden><div class="health"><span id="player-hp"></span><progress id="player-bar" aria-label="旅行者生命"></progress></div><div class="health"><span id="enemy-hp"></span><progress id="enemy-bar" aria-label="敌人生命"></progress></div></div>
          <div class="scene-caption" id="scene-caption"></div><div class="loading" role="status">正在准备远行素材…</div>
        </div>
        <div id="combat-actions" hidden><div id="weapon-actions" class="actions"></div><div class="actions"><button class="attack" data-action="eat">吃熏肉 · 回复 8 生命<small id="eat-ready"></small><i class="charge"></i></button></div></div>
        <div class="log" role="log" aria-label="远行记录"></div>
      </section>
      <aside class="sidebar" aria-label="行囊与状态"></aside>
    </div>
    <div class="paused" hidden>远行已暂停，战斗与冷却也已暂停。继续后按原速推进。</div>
    <footer class="slice-footer"><span>独立测试进度 · 刷新重置 · 不读取或写入正式存档</span><div><button data-action="sound">声音关闭</button> <button data-action="pause">暂停</button> <button data-action="reset">重新试玩</button></div></footer>
    <details class="subtle" style="margin-top:14px"><summary>样片范围与操作</summary><p>WASD / 方向键逐格移动，也可以点相邻地块或右侧方向按钮。数字 1–6 使用对应武器，空格使用当前武器，E 吃肉；事件期间不能移动。首次距村四格的遭遇按所选目标保证触发，后续沿用当前地形的正常随机遭遇。敌人实时攻击，战胜后选取战利品，再走回村庄入库。</p><p>本页使用预设地形与测试物资；铁剑、钢剑、步枪等供表现验收，不代表前期开局即可获得。原版近村森林只有咆哮野兽，荒地有瘦弱男子，草原有怪鸟和双头生物。正式经营存档未接入，不代表自然开局难度。切换标签页自动暂停。</p></details>
  </main>`;

const dict = expeditionZh;
let slice = new ExpeditionSlice(browserContent, [...zhDictionaries, dict]);
let renderer: ExpeditionRenderer | null = null;
let paused = false, sound = false, last = performance.now(), lastUi = -Infinity;
let routeMessage = '建议先装入熏肉和一把骨矛；水袋与背包已生效。';
let lastPhase = slice.phase;
const patch = new Patch();
const canvas = app.querySelector('canvas')!;
const sidebar = app.querySelector<HTMLElement>('.sidebar')!;
const caption = app.querySelector<HTMLElement>('#scene-caption')!;
const actions = app.querySelector<HTMLElement>('#combat-actions')!;
const loading = app.querySelector<HTMLElement>('.loading')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const audio = new AudioManager(key => {
  const path = slice.game.content.audio[key];
  return path ? new URL('../../../' + path.replace(/^audio\//, ''), location.href).href : undefined;
});
audio.setEnabled(false);
let unlisten = slice.game.bus.on(event => audio.handle(event));
function text(selector: string, value: string): void { const node = app.querySelector(selector)!; if (node.textContent !== value) node.textContent = value; }
const itemName = (id: string) => slice.game.t(id);
const inventory = () => Object.entries(slice.game.path.outfit).filter(([, n]) => n > 0).map(([id, n]) => `${esc(itemName(id))} × ${n}`).join(' · ') || '行囊是空的';
const stat = (name: string, value: string) => `<div class="stat"><span>${name}</span><strong>${value}</strong></div>`;
const button = (id: string, name: string, disabled = false, label = name) => `<button data-action="${esc(id)}" aria-label="${esc(label)}"${disabled ? ' disabled' : ''}>${esc(name)}</button>`;

function move(direction: Direction): void {
  if (paused || !renderer) return;
  if (slice.move(direction)) { routeMessage = ''; update(); }
}
function reset(): void {
  unlisten(); slice.dispose();
  slice = new ExpeditionSlice(browserContent, [...zhDictionaries, dict]);
  unlisten = slice.game.bus.on(event => audio.handle(event));
  paused = false; last = performance.now(); lastPhase = slice.phase;
  routeMessage = '建议先装入熏肉和一把骨矛；水袋与背包已生效。';
  update();
}
function setPause(value: boolean): void {
  paused = value; last = performance.now();
  app.querySelector<HTMLElement>('.paused')!.hidden = !paused;
  text('[data-action="pause"]', paused ? '继续' : '暂停');
  update();
}

function update(): void {
  const g = slice.game, phase = slice.phase, ev = g.events.active(), combat = ev?.combat;
  if (phase !== lastPhase) {
    routeMessage = '';
    if (phase === 'loot') routeMessage = '战利品要装进行囊才能带走；背包满时可以丢弃物品腾出空间。';
    if (phase === 'home') routeMessage = '你把行囊卸在村里，点清带回来的东西。';
    lastPhase = phase;
  }
  const fighting = Boolean(combat);
  const enemyName = g.t(ev?.scene.enemyName ?? ev?.scene.enemy ?? '');
  const place = phase === 'world' ? g.world.getTerrain() === TILE.FIELD ? '草原' : g.world.getTerrain() === TILE.BARRENS ? '荒地' : '林缘' : slice.encounter.place;
  text('#chapter', phase === 'pack' ? '把火光留在身后' : phase === 'combat' ? EARLY_ENCOUNTERS.find(e => e.id === ev?.scene.enemy)?.chapter ?? enemyName : phase === 'loot' ? '余下的路，还要走回去' : phase === 'home' ? '看见熟悉的火光' : phase === 'dead' ? '这次没有走回来' : '沿着足迹，记住归途');
  text('#place', fighting ? `${place}遭遇` : phase === 'world' ? place : '聚落林缘');
  text('#scene-state', phase === 'world' ? `距村 ${g.world.getDistance()} 格` : phase === 'loot' ? '战斗结束' : '');
  text('#scene-caption', phase === 'pack' ? '火光之外，还有更远的世界。' : phase === 'world' ? '每走一步都消耗补给；走回村庄才能保住收获。' : phase === 'combat' ? combat?.enemy.stunned ? '敌人已被击晕，趁现在进攻或治疗。' : '敌人会持续攻击。留意冷却，必要时吃肉。' : phase === 'loot' ? g.t(ev?.scene.deathMessage ?? '战斗结束。') : phase === 'home' ? '补给和收获已结算到这份测试进度。' : '携带物已失去；重新试玩可开始另一份测试进度。');
  canvas.setAttribute('aria-label', fighting ? `旅行者与${enemyName}的战斗` : `${place}远行地图，距村 ${phase === 'world' ? g.world.getDistance() : 0} 格`);
  app.querySelector<HTMLElement>('.scene-hp')!.hidden = !fighting;
  actions.hidden = !fighting;
  if (combat) {
    text('#player-hp', `旅行者 ${g.world.health} / ${g.world.getMaxHealth()}`);
    text('#enemy-hp', `${enemyName} ${combat.enemy.hp} / ${combat.enemy.maxHp}${combat.enemy.stunned ? ' · 击晕' : ''}`);
    const p = app.querySelector<HTMLProgressElement>('#player-bar')!, e = app.querySelector<HTMLProgressElement>('#enemy-bar')!;
    p.max = g.world.getMaxHealth(); p.value = g.world.health; e.max = combat.enemy.maxHp; e.value = combat.enemy.hp;
    const attacks = phase === 'combat' ? combat.attacks() : [];
    patch.set(app.querySelector('#weapon-actions'), attacks.map(a => `<button class="attack" data-action="attack:${esc(a.id)}"><span>${esc(weaponLabel(a.id))}</span><small></small><i class="charge"></i></button>`).join(''));
    for (const [i, attack] of attacks.entries()) {
      const node = app.querySelector<HTMLButtonElement>(`[data-action="attack:${attack.id}"]`)!;
      node.disabled = paused || !attack.enabled;
      node.classList.toggle('selected', slice.displayWeapon === attack.id);
      const cost = Object.entries(attack.cost ?? {}).map(([id, n]) => `${itemName(id)} ${g.path.outfit[id] ?? 0}（每次 ${n}）`).join('，');
      const lacksAmmo = Object.entries(attack.cost ?? {}).some(([id, n]) => (g.path.outfit[id] ?? 0) < n);
      node.querySelector('small')!.textContent = `${i + 1} · ${lacksAmmo ? '弹药/投掷物不足' : attack.cooldown ? '冷却中' : `${WEAPONS[attack.id].cooldown} 秒冷却`}${cost ? ' · ' + cost : ''}`;
      node.querySelector<HTMLElement>('.charge')!.style.width = `${(1 - attack.cooldown) * 100}%`;
    }
    const eat = combat.utilities().find(action => action.id === 'eat')!;
    const eButton = app.querySelector<HTMLButtonElement>('[data-action="eat"]')!;
    eButton.disabled = paused || !eat.enabled;
    text('#eat-ready', eat.cooldown ? '冷却中' : `E · 剩余 ${g.path.outfit['cured meat'] ?? 0} 份`);
    eButton.querySelector<HTMLElement>('.charge')!.style.width = `${(1 - eat.cooldown) * 100}%`;
  }
  if (phase === 'pack') {
    patch.set(sidebar, `<h2>准备行囊</h2><h3>首场遭遇</h3><div class="encounter-choices">${EARLY_ENCOUNTERS.map(e => `<button data-action="encounter:${e.id}" aria-pressed="${slice.encounterId === e.id}"${paused ? ' disabled' : ''}>${e.name}<small>${e.place}</small></button>`).join('')}</div><p class="subtle">仅首场保证所选目标；后续按地形随机。测试物资可自由搭配，不代表开局解锁。</p><div class="pack-list">` +
      SLICE_SUPPLIES.map(id => `<div class="pack-row"><span class="name">${esc(itemName(id))}<small>每件 ${g.path.weight(id)} 重 · 库存 ${g.store.num(`stores["${id}"]`)}</small></span><div class="stepper">${button('less:' + id, '−', !(g.path.outfit[id] > 0) || paused, `减少${itemName(id)}`)}<output aria-label="携带${esc(itemName(id))}">${g.path.outfit[id] ?? 0}</output>${button('more:' + id, '+', g.path.outfit[id] >= g.store.num(`stores["${id}"]`) || g.path.freeSpace() + 1e-9 < g.path.weight(id) || paused, `增加${itemName(id)}`)}</div></div>`).join('') + '</div>' +
      stat('行囊重量', `${Number((g.path.capacity() - g.path.freeSpace()).toFixed(1))} / ${g.path.capacity()}`) + stat('生命', `${g.world.getMaxHealth()}`) + stat('水量（水袋）', `${g.world.getMaxWater()}`) +
      `<p class="subtle">背包、水袋拥有即生效，不占行囊。至少携带一份熏肉即可出发。</p><button class="primary" data-action="depart"${!renderer || paused || !g.path.canEmbark() ? ' disabled' : ''}>踏入森林</button>`);
  } else if (phase === 'world' || phase === 'combat') {
    const [x, y] = g.world.curPos, dx = WORLD.RADIUS - x, dy = WORLD.RADIUS - y;
    const homeDir = [dx < 0 ? `向西 ${-dx}` : dx > 0 ? `向东 ${dx}` : '', dy < 0 ? `向北 ${-dy}` : dy > 0 ? `向南 ${dy}` : ''].filter(Boolean).join('，');
    patch.set(sidebar, `<h2>${phase === 'combat' ? '守住这条归路' : '行囊与归途'}</h2>` + stat('生命', `${g.world.health} / ${g.world.getMaxHealth()}`) + stat('水', `${g.world.water} / ${g.world.getMaxWater()}`) + stat('熏肉', `${g.path.outfit['cured meat'] ?? 0} 份`) + stat('剩余负重', `${Number(g.path.freeSpace().toFixed(1))} / ${g.path.capacity()}`) + `<p class="inventory">${inventory()}</p>` +
      `<h3>村庄方向</h3><p style="font-size:13px">${homeDir ? `${homeDir} 格` : '就在这里'}</p><p class="subtle">最短回程 ${g.world.getDistance()} 格。战斗吃肉也会消耗口粮。</p>` +
      (g.world.water <= g.world.getDistance() + 2 || (g.path.outfit['cured meat'] ?? 0) <= Math.ceil(g.world.getDistance() / 2) + 1 ? '<p class="warn">归途补给已不宽裕，建议尽快折返。</p>' : '') +
      `<div class="dpad" aria-label="移动方向">${(['north', 'west', 'south', 'east'] as const).map((direction, i) => `<button class="${direction}" data-action="move:${direction}" aria-label="${['向北', '向西', '向南', '向东'][i]}"${paused || phase !== 'world' ? ' disabled' : ''}>${['↑', '←', '↓', '→'][i]}</button>`).join('')}</div><p class="subtle">WASD / 方向键 · 一次一格</p>`);
  } else if (phase === 'loot') {
    const loot = Object.entries(ev?.loot ?? {});
    patch.set(sidebar, `<h2>带走你的收获</h2>` + stat('剩余负重', `${g.path.freeSpace()} / ${g.path.capacity()}`) +
      (loot.length ? loot.map(([id, n]) => `<div class="loot-row"><span>${esc(itemName(id))} × ${n}</span>${button('take:' + id, '装入 1', paused || g.path.weight(id) > g.path.freeSpace())}</div>`).join('') : '<p class="empty">可携带的战利品已装好。</p>') +
      `<h3>行囊</h3><p class="inventory">${inventory()}</p><details><summary class="subtle">丢弃物品腾出空间</summary>${Object.entries(g.path.outfit).filter(([, n]) => n > 0).map(([id]) => `<div class="loot-row"><span>${esc(itemName(id))}</span>${button('drop:' + id, '丢下 1', paused)}</div>`).join('')}</details>` +
      g.events.buttons().map(b => `<button class="primary" data-action="leave:${esc(b.id)}"${paused || !b.enabled ? ' disabled' : ''}>继续赶路</button>`).join(''));
  } else if (phase === 'home') {
    patch.set(sidebar, `<h2>平安归来</h2><p class="subtle">对比本次出发前的仓库：</p><div class="receipt">${Object.entries(slice.receipt ?? {}).filter(([id]) => id !== 'wood').map(([id, n]) => `${esc(itemName(id))} ${n > 0 ? '+' : '−'}${Math.abs(n)}`).join('<br>') || '物资没有变化'}</div><p class="subtle">未消耗的补给和装备已归还，材料已入库。这里展示的是消耗与收获合并后的净变化。</p><button class="primary" data-action="reset">再走一趟</button>`);
  } else patch.set(sidebar, '<h2>远行失败</h2><p class="warn">这次携带的物资和未带回的探索已失去。</p><p class="subtle">正式规则的再次出发冷却为 120 秒；本页重新试玩会创建另一份独立测试进度。</p><button class="primary" data-action="reset">重新试玩</button>');
  const messages = routeMessage ? [routeMessage] : phase === 'pack' ? [] : g.notifications.log.filter(entry => entry.location === 'world' || entry.location === null).slice(-2).map(entry => entry.text);
  if (!messages.length && phase === 'world') messages.push('来时的足迹仍然清楚，别忘了回村的方向。');
  patch.set(app.querySelector('.log'), messages.map(message => `<p>${esc(message)}</p>`).join(''));
}

app.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action!;
  if (action === 'pause') { setPause(!paused); return; }
  if (action === 'reset') { reset(); setPause(false); return; }
  if (action === 'sound') { sound = !sound; audio.setEnabled(sound); audio.unlock(); text('[data-action="sound"]', sound ? '声音开启' : '声音关闭'); return; }
  if (paused) return;
  audio.unlock();
  if (action === 'depart') { if (renderer) slice.depart(); }
  else if (action.startsWith('move:')) move(action.slice(5) as Direction);
  else if (action.startsWith('more:')) slice.pack(action.slice(5), 1);
  else if (action.startsWith('less:')) slice.pack(action.slice(5), -1);
  else if (action.startsWith('encounter:')) slice.selectEncounter(action.slice(10));
  else if (action.startsWith('attack:')) slice.attack(action.slice(7));
  else if (action === 'eat') slice.game.events.active()?.combat?.use('eat');
  else if (action.startsWith('take:')) slice.game.events.take(action.slice(5));
  else if (action.startsWith('drop:')) slice.game.events.drop(action.slice(5), 1);
  else if (action.startsWith('leave:')) slice.game.events.click(action.slice(6));
  update();
});
document.addEventListener('keydown', event => {
  const tag = (event.target as HTMLElement).tagName;
  if (event.repeat || paused || !renderer || ['INPUT', 'TEXTAREA'].includes(tag)) return;
  const dirs: Record<string, Direction> = { ArrowUp: 'north', w: 'north', ArrowDown: 'south', s: 'south', ArrowLeft: 'west', a: 'west', ArrowRight: 'east', d: 'east' };
  if (dirs[event.key] && slice.phase === 'world') { event.preventDefault(); move(dirs[event.key]); }
  if (event.code === 'Space' && ['SUMMARY', 'BUTTON', 'A'].includes(tag)) return;
  if (slice.phase === 'combat' && (event.code === 'Space' || event.key.toLowerCase() === 'e')) {
    event.preventDefault();
    if (event.code === 'Space') slice.attack(slice.displayWeapon);
    else slice.game.events.active()?.combat?.use('eat');
    update();
  } else if (slice.phase === 'combat' && /^[1-6]$/.test(event.key)) {
    event.preventDefault();
    const attack = slice.game.events.active()?.combat?.attacks()[Number(event.key) - 1];
    if (attack) slice.attack(attack.id);
    update();
  }
});
canvas.addEventListener('click', event => {
  canvas.focus();
  if (slice.phase !== 'world') return;
  const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) * 576 / rect.width, y = (event.clientY - rect.top) * 324 / rect.height;
  const dx = Math.floor((x - 264) / 48), dy = Math.floor((y - 138) / 48);
  if (Math.abs(dx) + Math.abs(dy) !== 1) return;
  move(dx < 0 ? 'west' : dx > 0 ? 'east' : dy < 0 ? 'north' : 'south');
});
document.addEventListener('visibilitychange', () => { if (document.hidden && slice.phase !== 'pack' && slice.phase !== 'home') setPause(true); });
window.addEventListener('pagehide', () => slice.dispose());

function frame(now: number): void {
  const dt = Math.max(0, now - last); last = now;
  if (!paused && renderer) {
    if (dt > 1500 && (slice.phase === 'world' || slice.phase === 'combat')) setPause(true);
    else slice.game.tick(dt);
  }
  if (now - lastUi >= 80) { update(); lastUi = now; }
  renderer?.render(slice, reduced.matches);
  requestAnimationFrame(frame);
}
update(); requestAnimationFrame(frame);
void loadExpeditionArt().then(art => { renderer = new ExpeditionRenderer(canvas, art); loading.hidden = true; update(); }).catch(error => {
  loading.textContent = '远行素材未能载入，请刷新后重试。'; console.error('[expedition-preview]', error);
});
