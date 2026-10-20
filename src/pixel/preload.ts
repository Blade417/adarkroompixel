import { roomAssetUrls } from './artpack';
import { workshopAssetUrls } from './workshop';
import { forestAssetUrls } from './forest';
import { villageAssetUrls } from './village';
import { expeditionAssetUrls } from './expedition';
import { endgameAssetUrls } from './endgame-art';
import type { ArtGroup } from './loading';
import { packedArtSizes, packedArtUrls } from './runtime-art';
import type { SampleMode } from './resample';

export function startupArt(sample: SampleMode): readonly ArtGroup[] {
  const choose = (id: string, original: readonly string[]) => sample === 'mode' && packedArtUrls(id).length ? packedArtUrls(id) : original;
  return [
    { id: 'room', urls: [...choose('room', roomAssetUrls), ...choose('workshop', workshopAssetUrls)] },
    { id: 'forest', urls: choose('forest', forestAssetUrls) },
    { id: 'village', urls: choose('village', villageAssetUrls) },
    { id: 'expedition', urls: packedArtUrls('expedition').length ? packedArtUrls('expedition') : expeditionAssetUrls },
    { id: 'later', urls: choose('later', endgameAssetUrls) }
  ].map(group => ({ ...group, sizes: packedArtSizes() }));
}
export const STARTUP_ART = startupArt('mode');
