/** Shared startup downloads. Progress follows response bytes and decoded files, never a timer. */
export interface ArtGroup { id: string; urls: readonly string[]; sizes?: Readonly<Record<string, number>> }
export type GroupPhase = 'waiting' | 'downloading' | 'downloaded' | 'preparing' | 'ready' | 'error';
export interface LoadingProgress {
  percent: number;
  bytes: number;
  completed: number;
  total: number;
  groups: { id: string; completed: number; total: number; phase: GroupPhase }[];
}
interface Resource {
  url: string;
  bytes: number;
  size: number;
  weight: number;
  phase: 'waiting' | 'downloading' | 'decoded' | 'error';
  image?: HTMLImageElement;
}

export async function decodeArt(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export class StartupAssets {
  private readonly resources = new Map<string, Resource>();
  private readonly prepared = new Set<string>();
  private readonly preparationFailed = new Set<string>();
  private preparing = '';
  private finished = false;

  constructor(
    private readonly groups: readonly ArtGroup[],
    private readonly changed: (progress: LoadingProgress) => void,
    private readonly request: typeof fetch = (...args) => fetch(...args),
    private readonly decode: (blob: Blob) => Promise<HTMLImageElement> = decodeArt,
    private readonly stallMs = 45000
  ) {
    for (const group of groups) for (const url of group.urls) {
      if (!this.resources.has(url)) this.resources.set(url, { url, bytes: 0, size: group.sizes?.[url] ?? 0, weight: group.sizes?.[url] ?? 0, phase: 'waiting' });
    }
  }

  snapshot(): LoadingProgress {
    const resources = [...this.resources.values()];
    const weighted = resources.every(r => r.weight > 0);
    const weight = (r: Resource) => weighted ? r.weight : 1;
    const totalWeight = resources.reduce((sum, r) => sum + weight(r), 0);
    const fraction = resources.reduce((sum, r) => sum + weight(r) * (r.phase === 'decoded' ? 1 : r.size > 0 ? Math.min(.95, r.bytes / r.size * .95) : 0), 0);
    return {
      percent: this.finished ? 100 : Math.min(99, Math.floor(90 * fraction / Math.max(1, totalWeight) + 10 * this.prepared.size / Math.max(1, this.groups.length))),
      bytes: resources.reduce((sum, r) => sum + r.bytes, 0),
      completed: resources.filter(r => r.phase === 'decoded').length,
      total: resources.length,
      groups: this.groups.map(group => {
        const rs = [...new Set(group.urls)].map(url => this.resources.get(url)!);
        const completed = rs.filter(r => r.phase === 'decoded').length;
        const phase: GroupPhase = this.preparationFailed.has(group.id) || rs.some(r => r.phase === 'error') ? 'error' : this.prepared.has(group.id) ? 'ready' :
          this.preparing === group.id ? 'preparing' : completed === rs.length ? 'downloaded' :
          rs.some(r => r.phase !== 'waiting') ? 'downloading' : 'waiting';
        return { id: group.id, completed, total: rs.length, phase };
      })
    };
  }

  private emit(): void { this.changed(this.snapshot()); }

  /** Four workers share bandwidth; a stalled response fails visibly instead of hanging forever. */
  async download(): Promise<void> {
    const queue = [...this.resources.values()];
    let index = 0;
    let stopped = false;
    this.emit();
    const results = await Promise.allSettled(Array.from({ length: Math.min(4, queue.length) }, async () => {
      let failed = false;
      while (!stopped && index < queue.length) {
        const resource = queue[index++];
        try { await this.downloadOne(resource); } catch { failed = true; stopped = true; }
      }
      if (failed) throw new Error('Some artwork could not be downloaded or decoded');
    }));
    if (results.some(r => r.status === 'rejected')) throw new Error('Artwork preparation failed');
  }

  private async downloadOne(resource: Resource): Promise<void> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const arm = () => { clearTimeout(timeout); timeout = setTimeout(() => controller.abort(), this.stallMs); };
    resource.phase = 'downloading';
    this.emit();
    arm();
    try {
      const response = await this.request(resource.url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Artwork HTTP ${response.status}`);
      const size = Number(response.headers.get('Content-Length'));
      resource.size = Number.isFinite(size) && size > 0 ? size : resource.size;
      let blob: Blob;
      if (response.body) {
        const reader = response.body.getReader();
        const parts: ArrayBuffer[] = [];
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(value.slice().buffer as ArrayBuffer);
            resource.bytes += value.byteLength;
            arm();
            this.emit();
          }
        } finally { reader.releaseLock(); }
        blob = new Blob(parts, { type: response.headers.get('Content-Type') || 'image/png' });
      } else {
        blob = await response.blob();
        resource.bytes = blob.size;
      }
      // The watchdog also bounds decoding; very slow but active downloads keep resetting it.
      resource.image = await Promise.race([
        this.decode(blob),
        new Promise<never>((_, reject) => {
          if (controller.signal.aborted) reject(new Error('Artwork timed out'));
          else controller.signal.addEventListener('abort', () => reject(new Error('Artwork timed out')), { once: true });
        })
      ]);
      resource.phase = 'decoded';
    } catch (error) {
      resource.phase = 'error';
      throw error;
    } finally {
      clearTimeout(timeout!);
      this.emit();
    }
  }

  image(url: string): HTMLImageElement | undefined { return this.resources.get(url)?.image; }

  async prepare<T>(id: string, task: () => Promise<T>): Promise<T> {
    this.preparing = id;
    this.emit();
    // Let the status paint before synchronous pixel processing resumes.
    await new Promise<void>(resolve => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      else setTimeout(resolve, 0);
    });
    try {
      const value = await task();
      this.prepared.add(id);
      return value;
    } catch (error) {
      this.preparationFailed.add(id);
      throw error;
    } finally {
      this.preparing = '';
      this.emit();
    }
  }

  finish(): void {
    if ([...this.resources.values()].some(r => r.phase !== 'decoded') || this.groups.some(g => !this.prepared.has(g.id))) {
      throw new Error('Artwork is not ready');
    }
    this.finished = true;
    this.emit();
    // Renderers keep the small baked canvases; release the large decoded originals.
    for (const resource of this.resources.values()) resource.image = undefined;
  }
}

let startup: StartupAssets | null = null;
export function useStartupAssets(assets: StartupAssets | null): void { startup = assets; }

export async function loadArtImage(url: string): Promise<HTMLImageElement> {
  const cached = startup?.image(url);
  if (cached) return cached;
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return image;
}
