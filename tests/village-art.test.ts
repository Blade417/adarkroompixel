import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifest from '../assets/pixel/village/v1/manifest.json';
import landscape from '../assets/pixel/village/v2/manifest.json';
import publicArt from '../assets/pixel/village/v3/manifest.json';
import { PUBLIC_FACILITIES } from '../src/app/village';
import { ROOT } from '../src/node';

describe.each([['v1', manifest], ['v2', landscape], ['v3', publicArt]] as const)('modular village art delivery %s', (version, manifest) => {
  it('ships the separate terrain and transparent building sources with valid, undistorted crops', () => {
    for (const spec of Object.values(manifest.assets)) {
      const bytes = fs.readFileSync(path.join(ROOT, 'assets/pixel/village', version, spec.file));
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(bytes[25]).toBe(spec.hasAlpha ? 6 : 2);
      const [x, y, w, h] = spec.sourceRect;
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(bytes.readUInt32BE(16));
      expect(y + h).toBeLessThanOrEqual(bytes.readUInt32BE(20));
      expect(Math.abs(spec.drawSize[0] / spec.drawSize[1] / (w / h) - 1)).toBeLessThan(.03);
    }
  });

  it('preserves the generated sources recorded in the production manifest', () => {
    for (const [file, sha256] of Object.entries(manifest.sourceHashes)) {
      const bytes = fs.readFileSync(path.join(ROOT, 'assets/pixel/village', version, file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
    }
  });
});

it('fits all seven facility silhouettes inside their independent reserved footprints', () => {
  for (const f of PUBLIC_FACILITIES) {
    const [w, h] = publicArt.assets[f.art].drawSize;
    expect(w).toBeLessThanOrEqual(f.w); expect(h).toBeLessThanOrEqual(f.h);
  }
});
