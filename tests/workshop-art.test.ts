import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../src/node';
import { fitNarrow, toCss } from '../src/pixel/fit';
import { BUILDER_TARGET, DOORWAY, HEARTH_TARGET } from '../src/pixel/layout';
import { describeKey, roomView } from '../src/pixel/mapping';
import { WORKSHOP_ANCHORS, WORKSHOP_IDS, WORKSHOP_MANIFEST, WORKSHOP_TARGETS, workshopHitRects } from '../src/pixel/workshop';

describe('built workshop props in the room', () => {
  it('shows ownership and quantity rather than revealing unbuilt recipe props', () => {
    const base = { fire: 3, temperature: 3, builderLevel: 4, wood: 100, fur: 0 };
    const empty = roomView(base);
    expect(empty).toMatchObject({ cart: false, traps: 0 });
    const built = roomView({ ...base, cart: 1, traps: 3 });
    expect(built).toMatchObject({ cart: true, traps: 3 });
    expect(describeKey(built)).not.toBe(describeKey(empty));
    expect(describeKey(roomView({ ...base, cart: 1, traps: 4 }))).not.toBe(describeKey(built));
    expect(roomView({ ...base, cart: 0, traps: Number.NaN })).toMatchObject({ cart: false, traps: 0 });
  });

  it('ships RGBA originals and bounds each crop within its actual source size', () => {
    for (const id of WORKSHOP_IDS) {
      const spec = WORKSHOP_MANIFEST.assets[id];
      const bytes = fs.readFileSync(path.join(ROOT, 'assets/pixel/workshop/v2', spec.file));
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(spec.sourceSize);
      expect(bytes[25]).toBe(6); // Truecolor with alpha, not a baked opaque backdrop.
      const [x, y, w, h] = spec.sourceRect;
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(spec.sourceSize[0]);
      expect(y + h).toBeLessThanOrEqual(spec.sourceSize[1]);
      expect(Math.abs(spec.drawSize[0] / spec.drawSize[1] / (w / h) - 1)).toBeLessThan(0.03);
    }
  });

  it('keeps the prop centers on their hit targets and clear of existing room actions', () => {
    const targets = [DOORWAY, BUILDER_TARGET, HEARTH_TARGET, ...Object.values(WORKSHOP_TARGETS)];
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j];
      expect(a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h).toBe(true);
    }
    for (const id of WORKSHOP_IDS) {
      const spec = WORKSHOP_MANIFEST.assets[id], anchor = WORKSHOP_ANCHORS[id], r = WORKSHOP_TARGETS[id];
      const center = { x: anchor.x, y: anchor.y - spec.drawSize[1] / 2 };
      expect(center.x).toBeGreaterThanOrEqual(r.x); expect(center.x).toBeLessThanOrEqual(r.x + r.w);
      expect(center.y).toBeGreaterThanOrEqual(r.y); expect(center.y).toBeLessThanOrEqual(r.y + r.h);
      for (const width of [320, 390]) for (const dpr of [1, 2, 3]) {
        const f = fitNarrow(width, 300, dpr, 224), hits = workshopHitRects(f), hit = hits[id];
        const p = toCss(f, center.x, center.y);
        expect(hit.x).toBeGreaterThanOrEqual(0);
        expect(hit.x + hit.w).toBeLessThanOrEqual(f.cssW);
        expect(hit.y + hit.h).toBeLessThanOrEqual(f.cssH); // Never intercept inventory below the canvas.
        expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44);
        expect(p.x).toBeGreaterThanOrEqual(hit.x); expect(p.x).toBeLessThanOrEqual(hit.x + hit.w);
        expect(p.y).toBeGreaterThanOrEqual(hit.y); expect(p.y).toBeLessThanOrEqual(hit.y + hit.h);
        expect(hits.cart.x + hits.cart.w).toBeLessThanOrEqual(hits.trap.x);
      }
    }
  });
});
