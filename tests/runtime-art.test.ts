import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../src/node';
import manifest from '../assets/pixel/runtime/v1/manifest.json';

describe('lossless runtime artwork', () => {
  it('matches all original sources and baking algorithms so stale packs cannot ship silently', () => {
    expect(Object.keys(manifest.sourceHashes).length).toBeGreaterThan(80);
    for (const [file, hash] of Object.entries(manifest.sourceHashes)) {
      const raw = fs.readFileSync(path.join(ROOT, file));
      const data = file.endsWith('.png') ? raw : Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
      expect(createHash('sha256').update(data).digest('hex'), file).toBe(hash);
    }
  });

  it('ships intact lossless WebP atlases with bounded frames and over 90% less artwork data', () => {
    expect(Object.keys(manifest.groups).sort()).toEqual(['expedition', 'forest', 'later', 'room', 'village', 'workshop']);
    let bytes = 0;
    for (const group of Object.values(manifest.groups)) {
      const data = fs.readFileSync(path.join(ROOT, 'assets/pixel/runtime/v1', group.file));
      expect(data.subarray(0, 4).toString()).toBe('RIFF');
      expect(data.subarray(8, 12).toString()).toBe('WEBP');
      // VP8L is WebP's lossless bitstream, including in extended containers.
      expect(data.includes(Buffer.from('VP8L'))).toBe(true);
      expect(data.length).toBe(group.bytes);
      expect(createHash('sha256').update(data).digest('hex')).toBe(group.sha256);
      for (const [x, y, w, h] of Object.values(group.sprites)) {
        expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
        expect(w).toBeGreaterThan(0); expect(h).toBeGreaterThan(0);
        expect(x + w).toBeLessThanOrEqual(group.width);
        expect(y + h).toBeLessThanOrEqual(group.height);
      }
      bytes += data.length;
    }
    expect(bytes).toBe(manifest.runtimeBytes);
    expect(bytes).toBeLessThan(manifest.originalBytes * .1);
  });
});
