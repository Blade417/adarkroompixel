import manifest from '../../assets/pixel/runtime/v1/manifest.json';
import { loadArtImage } from './loading';
import { ctx2d, makeCanvas } from './paint';
import type { Sprite } from './sprites';

interface PackedGroup { file: string; bytes: number; sprites: Record<string, [number, number, number, number]>; meta: Record<string, unknown>; alphaPixels?: Record<string, number[]> }
const groups = manifest.groups as unknown as Record<string, PackedGroup>;
const urls = import.meta.glob('../../assets/pixel/runtime/v1/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function packedArtUrls(group: string): string[] {
  const file = groups[group]?.file;
  const url = Object.entries(urls).find(([path]) => path.endsWith('/' + file))?.[1];
  return url ? [url] : [];
}

export function packedArtSizes(): Record<string, number> {
  return Object.fromEntries(Object.entries(groups).flatMap(([id, group]) => packedArtUrls(id).map(url => [url, group.bytes])));
}

/** Atlases contain the exact pixels the old browser baking path produced, encoded losslessly. */
export async function loadPackedArt(group: string): Promise<{ sprites: Record<string, Sprite>; meta: Record<string, unknown> } | null> {
  const [url] = packedArtUrls(group);
  if (!url) return null;
  const image = await loadArtImage(url);
  const sprites = Object.fromEntries(Object.entries(groups[group].sprites).map(([id, [x, y, w, h]]) => {
    const canvas = makeCanvas(w, h);
    const g = ctx2d(canvas);
    g.imageSmoothingEnabled = false;
    g.drawImage(image, x, y, w, h, 0, 0, w, h);
    // Browser image decoders can round premultiplied alpha differently from putImageData.
    // Preserve the canonical RGBA values of the few semi-transparent ember pixels explicitly.
    const patches = groups[group].alphaPixels?.[id];
    if (patches?.length) {
      const pixels = g.getImageData(0, 0, w, h);
      for (let i = 0; i < patches.length; i += 5) pixels.data.set(patches.slice(i + 1, i + 5), patches[i]);
      g.putImageData(pixels, 0, 0);
    }
    return [id, { canvas, w, h }];
  }));
  return { sprites, meta: groups[group].meta };
}
