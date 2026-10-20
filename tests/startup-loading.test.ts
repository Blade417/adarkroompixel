import { describe, expect, it, vi } from 'vitest';
import { StartupAssets, type LoadingProgress } from '../src/pixel/loading';
import { STARTUP_ART, startupArt } from '../src/pixel/preload';

const decoded = {} as HTMLImageElement;
const image = async () => decoded;
const response = (status = 200) => new Response('pixels', { status, headers: { 'Content-Length': '6', 'Content-Type': 'image/png' } });

describe('startup artwork preparation', () => {
  it('counts streamed bytes, shares downloads across scenes, and waits for baking before 100%', async () => {
    const progress: LoadingProgress[] = [];
    const request = vi.fn(async () => response());
    const assets = new StartupAssets([{ id: 'room', urls: ['/shared', '/room'] }, { id: 'village', urls: ['/shared'] }], p => progress.push(p), request, image);
    await assets.download();
    expect(request).toHaveBeenCalledTimes(2);
    expect(assets.snapshot()).toMatchObject({ bytes: 12, total: 2, completed: 2, percent: 90 });
    expect(progress.some(p => p.percent > 0 && p.percent < 90)).toBe(true);
    expect(assets.image('/shared')).toBe(decoded);
    expect(() => assets.finish()).toThrow('not ready');
    await assets.prepare('room', async () => undefined);
    expect(assets.snapshot().percent).toBe(95);
    await assets.prepare('village', async () => undefined);
    expect(assets.snapshot().percent).toBe(99);
    assets.finish();
    expect(assets.snapshot()).toMatchObject({ percent: 100, total: 2, completed: 2 });
    expect(assets.snapshot().groups.every(g => g.phase === 'ready')).toBe(true);
    expect(assets.image('/shared')).toBeUndefined(); // Large decoded originals are released.
    expect(progress.map(p => p.percent)).toEqual([...progress.map(p => p.percent)].sort((a, b) => a - b));
  });

  it('uses at most four active downloads and succeeds without a Content-Length header', async () => {
    let active = 0, peak = 0;
    const request: typeof fetch = async () => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return new Response('pixels');
    };
    const assets = new StartupAssets([{ id: 'room', urls: Array.from({ length: 9 }, (_, i) => '/' + i) }], () => {}, request, image);
    await assets.download();
    expect(peak).toBe(4);
    expect(assets.snapshot()).toMatchObject({ total: 9, completed: 9, bytes: 54 });
  });

  it('weights packaged artwork progress by its known byte sizes', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    const request: typeof fetch = async url => {
      if (url === '/large') { await gate; return new Response('x'.repeat(60), { headers: { 'Content-Length': '60' } }); }
      return response();
    };
    const assets = new StartupAssets([{ id: 'room', urls: ['/small', '/large'], sizes: { '/small': 6, '/large': 60 } }], () => {}, request, image);
    const pending = assets.download();
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(assets.snapshot()).toMatchObject({ completed: 1, percent: 8 });
    release();
    await pending;
    expect(assets.snapshot()).toMatchObject({ completed: 2, percent: 90 });
  });

  it.each(['http', 'decode'])('keeps entry blocked when %s fails and reports the affected group', async failure => {
    const request = vi.fn(async () => response(failure === 'http' ? 404 : 200));
    const decode = failure === 'decode' ? async () => { throw new Error('corrupt image'); } : image;
    const assets = new StartupAssets([{ id: 'forest', urls: ['/forest'] }], () => {}, request, decode);
    await expect(assets.download()).rejects.toThrow('failed');
    expect(assets.snapshot().groups[0].phase).toBe('error');
    expect(assets.snapshot().completed).toBe(0);
    expect(assets.snapshot().percent).toBeLessThan(100);
    expect(() => assets.finish()).toThrow();
  });

  it('fails a stalled connection instead of waiting forever', async () => {
    const request: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    const assets = new StartupAssets([{ id: 'room', urls: ['/stalled'] }], () => {}, request, image, 10);
    await expect(assets.download()).rejects.toThrow();
    expect(assets.snapshot().groups[0].phase).toBe('error');
  });

  it('fails a stalled decoder and stops scheduling the remaining downloads', async () => {
    const request = vi.fn(async () => response());
    const neverDecodes = () => new Promise<HTMLImageElement>(() => {});
    const assets = new StartupAssets([{ id: 'room', urls: Array.from({ length: 10 }, (_, i) => '/' + i) }], () => {}, request, neverDecodes, 10);
    await expect(assets.download()).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(4);
    expect(assets.snapshot().groups[0].phase).toBe('error');
  });

  it('does not report ready when downloaded artwork cannot be baked', async () => {
    const assets = new StartupAssets([{ id: 'room', urls: ['/room'] }], () => {}, async () => response(), image);
    await assets.download();
    await expect(assets.prepare('room', async () => { throw new Error('canvas unavailable'); })).rejects.toThrow('canvas');
    expect(assets.snapshot().groups[0].phase).toBe('error');
    expect(() => assets.finish()).toThrow('not ready');
  });

  it('prepares every scene from six lossless atlases and retains the original debug sampling path', () => {
    expect(STARTUP_ART.map(g => g.id)).toEqual(['room', 'forest', 'village', 'expedition', 'later']);
    expect(STARTUP_ART.every(g => g.urls.length > 0)).toBe(true);
    const urls = STARTUP_ART.flatMap(g => g.urls);
    expect(urls).toHaveLength(6);
    expect(urls.every(url => url.endsWith('.webp'))).toBe(true);
    expect(startupArt('nearest').find(g => g.id === 'room')!.urls).toHaveLength(8);
    expect(startupArt('nearest').find(g => g.id === 'expedition')!.urls[0]).toMatch(/expedition.*\.webp$/);
  });
});
