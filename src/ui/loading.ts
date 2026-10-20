import type { Language } from '../core/i18n';
import type { LoadingProgress } from '../pixel/loading';
import { esc } from './dom';
import './loading.css';

/** A separate screen keeps the title and its keyboard shortcuts inert until all art is baked. */
export class LoadingScreen {
  private readonly root = document.createElement('section');
  private readonly bar: HTMLProgressElement;
  private readonly percent: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly status: HTMLElement;
  private readonly retry: HTMLButtonElement;
  private readonly rows = new Map<string, HTMLElement>();
  private readonly started = performance.now();
  private readonly timer: ReturnType<typeof setInterval>;
  private progress: LoadingProgress | null = null;
  private failed = false;
  private frame = 0;
  private readonly t: (zh: string, en: string) => string;

  constructor(private readonly app: HTMLElement, language: Language) {
    this.t = (zh, en) => language === 'zh' ? zh : en;
    const t = this.t;
    this.root.className = 'startup-loading';
    this.root.tabIndex = -1;
    this.root.setAttribute('aria-labelledby', 'loading-title');
    this.root.innerHTML = `<div class="loading-card">
      <div class="loading-mark" aria-hidden="true">✦</div>
      <p class="loading-kicker">${t('余烬之境', 'EMBERVEIL PIXEL')}</p>
      <h1 id="loading-title">${t('正在点亮这片世界', 'Kindling a world')}</h1>
      <p class="loading-intro">${t('先备好旅途中的画面，再从一间小屋出发。', 'Preparing the journey before you step into the room.')}</p>
      <div class="loading-meter"><span>${t('资源准备进度', 'Preparing artwork')}</span><strong class="loading-percent">0%</strong></div>
      <progress max="100" value="0" aria-label="${t('资源准备进度', 'Artwork preparation progress')}"></progress>
      <p class="loading-detail"></p>
      <ul class="loading-groups"></ul>
      <p class="loading-status" role="status" aria-live="polite">${t('正在连接，准备下载素材…', 'Connecting and preparing artwork…')}</p>
      <button class="primary loading-retry" type="button" hidden>${t('重新加载', 'Reload and retry')}</button>
      <p class="loading-note">${t('首次进入会准备全部场景画面，就绪后即可开始。切换场景无需再下载画面素材，浏览器缓存可加快下次进入。', 'All scene artwork is prepared before you begin, so changing scenes needs no further artwork downloads. Browser caching can speed up later visits.')}</p>
    </div>`;
    this.bar = this.root.querySelector('progress')!;
    this.percent = this.root.querySelector('.loading-percent')!;
    this.detail = this.root.querySelector('.loading-detail')!;
    this.status = this.root.querySelector('.loading-status')!;
    this.retry = this.root.querySelector('button')!;
    const names: Record<string, string> = {
      room: t('炉火与小屋', 'The room & hearth'), forest: t('近林', 'The forest'),
      village: t('聚落', 'The village'), expedition: t('远行', 'The journey'), later: t('旅途深处', 'Beyond the firelight')
    };
    for (const [id, name] of Object.entries(names)) {
      const row = document.createElement('li');
      row.dataset.group = id;
      row.innerHTML = `<span>${esc(name)}</span><span class="loading-group-state"></span>`;
      this.root.querySelector('ul')!.append(row);
      this.rows.set(id, row);
    }
    this.retry.addEventListener('click', () => location.reload());
    app.inert = true;
    app.setAttribute('aria-busy', 'true');
    document.body.append(this.root);
    this.root.focus({ preventScroll: true });
    this.timer = setInterval(() => this.paint(), 1000);
  }

  update(progress: LoadingProgress): void {
    this.progress = progress;
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }

  private paint(): void {
    const p = this.progress;
    if (!p) return;
    const t = this.t;
    this.bar.value = p.percent;
    this.percent.textContent = `${p.percent}%`;
    this.detail.textContent = t(`素材 ${p.completed} / ${p.total} · 已接收 ${(p.bytes / 1e6).toFixed(1)} MB`, `Files ${p.completed} / ${p.total} · ${(p.bytes / 1e6).toFixed(1)} MB received`);
    const labels = {
      waiting: t('等待下载', 'Waiting'), downloading: t('正在下载', 'Downloading'),
      downloaded: t('已下载，等待处理', 'Downloaded, queued'), preparing: t('正在处理画面', 'Preparing'),
      ready: t('已就绪', 'Ready'), error: t('加载失败', 'Failed')
    };
    for (const group of p.groups) {
      const row = this.rows.get(group.id);
      if (!row) continue;
      row.dataset.phase = group.phase;
      row.querySelector('.loading-group-state')!.textContent = `${labels[group.phase]} · ${group.completed}/${group.total}`;
    }
    if (p.groups.some(g => g.phase === 'error')) this.fail();
    if (!this.failed) {
      const text = p.percent === 100 ? t('全部就绪，即将进入。', 'Ready. Opening the title screen.') :
        p.groups.some(g => g.phase === 'preparing') ? t('素材已下载，正在处理画面，请稍候…', 'Artwork downloaded. Preparing the scenes…') :
        performance.now() - this.started > 15000 ? t('仍在下载，请保持页面打开。网络较慢时，首次准备会久一些。', 'Still downloading. Please keep this page open; the first visit can take longer on a slow connection.') :
        t('正在下载旅途中的画面…', 'Downloading the journey’s artwork…');
      if (this.status.textContent !== text) this.status.textContent = text;
    }
  }

  fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.root.dataset.failed = '';
    this.status.textContent = this.t('部分素材未能准备完成。请检查网络后重新加载，已缓存的素材可复用。', 'Some artwork could not be prepared. Check your connection and reload; cached files can be reused.');
    this.retry.hidden = false;
  }

  remove(): void {
    clearInterval(this.timer);
    cancelAnimationFrame(this.frame);
    this.root.remove();
    this.app.inert = false;
    this.app.removeAttribute('aria-busy');
  }
}
