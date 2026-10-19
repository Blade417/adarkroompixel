import manifest from '../../assets/pixel/endgame/v1/manifest.json';
import { ctx2d, makeCanvas } from './paint';
import { resample, type SampleMode } from './resample';
import type { Sprite } from './sprites';

export type EndgameArtId = 'fabricator' | 'shipyard' | 'escape' | 'homefleet' | 'flight-ship' | 'asteroid-0' | 'asteroid-1' | 'asteroid-2';
export type EndgameArt = Partial<Record<EndgameArtId, Sprite>>;
interface ArtSpec { file: string; sourceRect: number[]; drawSize: number[]; transparent: boolean }
const specs = manifest.assets as Record<EndgameArtId, ArtSpec>;
const urls = import.meta.glob('../../assets/pixel/endgame/v1/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Decode each original once, then bake bounded crops; a failed file affects only its pieces. */
export async function loadEndgameArt(sample: SampleMode): Promise<EndgameArt> {
  const art: EndgameArt = {};
  await Promise.all(Object.entries(manifest.sources).map(async ([file]) => {
    try {
      const url = Object.entries(urls).find(([path]) => path.endsWith('/' + file))?.[1];
      if (!url) throw new Error(`Missing endgame art: ${file}`);
      const image = new Image(); image.src = url; await image.decode();
      for (const [id, spec] of Object.entries(specs) as [EndgameArtId, ArtSpec][]) {
        if (spec.file !== file) continue;
        const [x, y, w, h] = spec.sourceRect, [dw, dh] = spec.drawSize;
        const source = makeCanvas(w, h), sg = ctx2d(source);
        sg.drawImage(image, x, y, w, h, 0, 0, w, h);
        const pixels = resample(sg.getImageData(0, 0, w, h), dw, dh, { mode: sample, alphaCut: spec.transparent ? .5 : null });
        const canvas = makeCanvas(dw, dh), g = ctx2d(canvas), data = g.createImageData(dw, dh);
        data.data.set(pixels.data); g.putImageData(data, 0, 0);
        art[id] = { canvas, w: dw, h: dh };
      }
    } catch (error) { console.warn(`[endgame] ${file} art could not load`, error); }
  }));
  return art;
}
