/**
 * ?debug: a small panel for checking the room's states, the stranger's arrival and the layout
 * without playing through. It writes state through the same store paths the core uses.
 */
import type { Game } from '../core/game';
import { FIRE, TEMPERATURE } from '../core/data';
import { Room } from '../core/locations/room';
import { SAMPLE_MODES, type SampleMode } from '../pixel/resample';
import { esc } from './dom';

export interface DebugInfo {
  fps: number;
  layout: string;
  scale: number;
  ps: number;
  dpr: number;
  sample: SampleMode;
  standIns: string[];
  arrival: boolean;
}

export interface DebugHooks {
  game: Game;
  info(): DebugInfo;
  previewArrival(): void;
  setAnchors(on: boolean): void;
  /** advance game time without animating the result (like returning to the tab) */
  skip(ms: number): void;
  restart(): void;
}

const levels = (prefix: string, from: number, to: number): string => {
  let s = '';
  for (let v = from; v <= to; v++) s += `<button type="button" data-dbg="${prefix}:${v}">${v}</button>`;
  return s;
};

const OPEN_KEY = 'emberveil.pixel.debug-open';

/** open by default on wide screens only; the panel would cover a phone's whole view */
const readOpen = (): boolean => {
  try {
    const v = sessionStorage.getItem(OPEN_KEY);
    if (v !== null) return v === '1';
  } catch {
    /* private mode */
  }
  return window.innerWidth >= 900;
};

export class DebugPanel {
  private readonly box: HTMLDetailsElement;
  private readonly out: HTMLElement;
  private readonly evSelect: HTMLSelectElement;

  constructor(parent: HTMLElement, private readonly h: DebugHooks) {
    const g = h.game;
    const info = h.info();
    const params = new URLSearchParams(location.search);
    const sampleLinks = SAMPLE_MODES.map((m) => {
      const p = new URLSearchParams(params);
      p.set('sample', m);
      return m === info.sample ? `<b>${m}</b>` : `<a href="?${esc(p.toString())}">${m}</a>`;
    }).join(' ');
    const events = (['Room', 'Outside', 'Global', 'Marketing'] as const).map(group => `<optgroup label="${group}">` +
      (g.events.content?.[group] ?? []).map((e, i) => `<option value="${group}:${i}">${esc(e.title)}</option>`).join('') + '</optgroup>').join('');

    const box = document.createElement('details');
    box.className = 'debug';
    box.open = readOpen();
    box.addEventListener('toggle', () => {
      try {
        sessionStorage.setItem(OPEN_KEY, box.open ? '1' : '0');
      } catch {
        /* private mode */
      }
      if (box.open) this.update();
    });
    box.innerHTML = `
<summary>调试 debug</summary>
<div class="dbg-row"><span>木头</span><button type="button" data-dbg="wood:10">+10</button><button type="button" data-dbg="wood:100">+100</button><button type="button" data-dbg="wood:1000">+1000</button><button type="button" data-dbg="wood:-1">清零</button>
<span>毛皮</span><button type="button" data-dbg="fur:5">+5</button></div>
<div class="dbg-row"><span>火</span>${levels('fire', 0, 4)}</div>
<div class="dbg-row"><span>温度</span>${levels('temp', 0, 4)}</div>
<div class="dbg-row"><span>陌生人</span>${levels('builder', -1, 4)}</div>
<div class="dbg-row"><span>时间</span><button type="button" data-dbg="skip:30000">+30秒</button><button type="button" data-dbg="skip:300000">+5分</button><button type="button" data-dbg="skip:1800000">+30分</button></div>
<div class="dbg-row"><button type="button" data-dbg="arrival">播放到来</button><label><input type="checkbox" data-dbg-anchors> 锚点</label></div>
<div class="dbg-row"><select aria-label="事件">${events}</select><button type="button" data-dbg="event">开始事件</button></div>
<div class="dbg-row"><span>采样</span>${sampleLinks}</div>
<div class="dbg-row"><button type="button" data-dbg="restart">清除存档</button></div>
<pre class="dbg-out" aria-live="off"></pre>
<p class="dbg-note">占位：${esc(info.standIns.join('、') || '无')}</p>`;
    parent.appendChild(box);
    this.box = box;
    this.out = box.querySelector('.dbg-out')!;
    this.evSelect = box.querySelector('select')!;

    box.addEventListener('click', (e) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>('[data-dbg]');
      if (el) this.act(el.dataset.dbg!);
    });
    box.querySelector<HTMLInputElement>('[data-dbg-anchors]')!.addEventListener('change', (e) => {
      h.setAnchors((e.target as HTMLInputElement).checked);
    });
    window.setInterval(() => this.update(), 250);
    this.update();
  }

  private act(cmd: string): void {
    const g = this.h.game;
    const s = g.store;
    const [kind, arg] = cmd.split(':');
    const n = Number(arg);
    switch (kind) {
      case 'wood':
        if (n < 0) s.set('stores.wood', 0);
        else s.add('stores.wood', n);
        break;
      case 'fur':
        s.add('stores.fur', n);
        break;
      case 'fire':
        s.set('game.fire', { ...FIRE[n] });
        break;
      case 'temp':
        s.set('game.temperature', { ...TEMPERATURE[n] });
        break;
      case 'builder':
        s.set('game.builder.level', n);
        break;
      case 'skip':
        this.h.skip(n);
        break;
      case 'arrival':
        this.h.previewArrival();
        break;
      case 'event': {
        const [group, index] = this.evSelect.value.split(':');
        const list = group === 'Room' ? g.events.content.Room : group === 'Outside' ? g.events.content.Outside : group === 'Global' ? g.events.content.Global : g.events.content.Marketing;
        const def = list[Number(index)];
        if (def && !g.events.active()) g.events.startEvent(def);
        break;
      }
      case 'restart':
        this.h.restart();
        break;
    }
    this.update();
  }

  private update(): void {
    if (!this.box.open) return;
    const g = this.h.game;
    const r = g.room;
    const i = this.h.info();
    const cd = g.cooldowns.remaining(Room.FIRE_COOLDOWN);
    const ev = g.events.active();
    const secs = Math.floor(g.clock.now / 1000);
    const text = [
      `fps ${i.fps.toFixed(0)}  布局 ${i.layout}  dpr ${i.dpr}`,
      `scale ${i.scale}  ps ${i.ps.toFixed(3)}  采样 ${i.sample}`,
      `火 ${r.fire}  温度 ${r.temperature}  陌生人 ${r.builderLevel}`,
      `木头 ${g.store.get('stores.wood') ?? '—'}  毛皮 ${g.store.get('stores.fur') ?? '—'}`,
      `冷却 ${cd ? (cd / 1000).toFixed(1) + 's' : '—'}  时钟 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      `事件 ${ev ? ev.def.title : '—'}${i.arrival ? '  到来中' : ''}`
    ].join('\n');
    if (this.out.textContent !== text) this.out.textContent = text;
  }
}
