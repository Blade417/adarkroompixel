/**
 * The pixel edition's pure parts: art contract, state mapping, integer fitting, HUD placement,
 * reduction of the source art, the arrival, light maths and particles. No canvas needed.
 */
import { describe, expect, it } from 'vitest';
import { PREFS_KEY } from '../src/app/prefs';
import { SAVE_KEY } from '../src/core/save';
import { ARRIVAL_MS, ARRIVAL_T, ArrivalWatcher, arrivalPose } from '../src/pixel/arrival';
import { ART_IDS, MANIFEST, artUrl } from '../src/pixel/artpack';
import { chooseMode, fitFull, fitNarrow, fullScale, OVERLAY_MIN_PS, STACKED_STAGE_SHARE, toCss, toLogical } from '../src/pixel/fit';
import {
  ANCHOR,
  FIREBOX,
  FLOOR_FRONT,
  FOCUS_X,
  groundTopLeft,
  LIGHT_CENTRE,
  NARROW_CROP,
  TOP_BAND,
  VIEW_H,
  VIEW_W,
  type Point
} from '../src/pixel/layout';
import { AMBIENT, EDGE, edgeFade, flickerVariant, lightAt, litAt } from '../src/pixel/lighting';
import { describeKey, roomView, strangerView, WOODPILE_STEPS, woodpileFrame } from '../src/pixel/mapping';
import { snow, sparks } from '../src/pixel/particles';
import { borderColour, resample, SAMPLE_MODES, type Pixels } from '../src/pixel/resample';
import { loopFrame } from '../src/pixel/sprites';
import { HEADER_H, hudLayout, layoutVars, SIDE_MIN } from '../src/ui/layout';
import { missingKeys } from '../src/ui/strings';

describe('art contract (assets/pixel/room/v1/manifest.json)', () => {
  const anchorOf: Record<string, Point> = {
    hearth: ANCHOR.hearth,
    fire: ANCHOR.fire,
    'stranger-huddled': ANCHOR.strangerCorner,
    woodpile: ANCHOR.woodpile,
    'door-closed': ANCHOR.door
  };

  it('describes the same 480x270 scene', () => {
    expect(MANIFEST.logicalScene).toEqual({ width: VIEW_W, height: VIEW_H });
  });

  it('ships every piece the renderer bakes', () => {
    for (const id of ART_IDS) {
      const a = MANIFEST.assets[id];
      expect(a, id).toBeTruthy();
      expect(artUrl(a.file), a.file).toBeTruthy();
    }
  });

  it('uses the layout anchors for every grounded piece', () => {
    for (const [id, p] of Object.entries(anchorOf)) {
      const a = MANIFEST.assets[id as keyof typeof MANIFEST.assets];
      expect(a.suggestedGroundAnchor, id).toEqual([p.x, p.y]);
      for (const f of a.frames) {
        expect(f.anchor, id).toBe('bottom-center');
        const [x, y, w, h] = f.suggestedDestination;
        expect(x + w / 2, `${id} #${f.index} centre`).toBeCloseTo(p.x, 2);
        expect(y + h, `${id} #${f.index} base`).toBeCloseTo(p.y, 2);
      }
    }
  });

  it('has the frame counts the animations expect', () => {
    expect(MANIFEST.assets.fire.frames).toHaveLength(4);
    expect(MANIFEST.assets['stranger-huddled'].frames).toHaveLength(4);
    expect(MANIFEST.assets.woodpile.frames).toHaveLength(3);
  });

  it('agrees with the woodpile thresholds', () => {
    const q = MANIFEST.assets.woodpile.quantityThresholdsSuggestion as Record<string, [number, number | null]>;
    expect(q.medium[0]).toBe(WOODPILE_STEPS.medium);
    expect(q.high[0]).toBe(WOODPILE_STEPS.high);
    expect(q.low[1]).toBe(WOODPILE_STEPS.medium - 1);
  });

  it('stands a sprite on its anchor by the bottom-centre', () => {
    expect(groundTopLeft({ x: 100, y: 200 }, 10, 20)).toEqual({ x: 95, y: 180 });
    expect(groundTopLeft({ x: 100, y: 200 }, 11, 20)).toEqual({ x: 95, y: 180 });
  });
});

describe('state -> scene mapping', () => {
  it('poses the stranger by builder level', () => {
    expect(strangerView(-1)).toBeNull();
    expect(strangerView(0)).toBeNull();
    expect(strangerView(1)).toEqual({ pose: 'huddled', spot: 'corner', rate: 1 });
    expect(strangerView(2)).toEqual({ pose: 'huddled', spot: 'corner', rate: 0.5 });
    expect(strangerView(3)).toEqual({ pose: 'resting', spot: 'corner', rate: 1 });
    expect(strangerView(4)).toEqual({ pose: 'standing', spot: 'hearth', rate: 1 });
  });

  it('sizes the woodpile by wood, and hides it when there is none', () => {
    expect(woodpileFrame(undefined)).toBeNull();
    expect(woodpileFrame(0)).toBeNull();
    expect(woodpileFrame(1)).toBe(0);
    expect(woodpileFrame(19)).toBe(0);
    expect(woodpileFrame(20)).toBe(1);
    expect(woodpileFrame(99)).toBe(1);
    expect(woodpileFrame(100)).toBe(2);
  });

  it('clamps levels and derives frost from temperature', () => {
    const v = roomView({ fire: 9, temperature: -2, builderLevel: 4, wood: 150, fur: 3 });
    expect(v.fire).toBe(4);
    expect(v.temperature).toBe(0);
    expect(v.frost).toBe(2);
    expect(v.furpile).toBe(true);
    expect(roomView({ fire: 0, temperature: 1, builderLevel: -1, wood: undefined, fur: undefined }).frost).toBe(1);
    expect(roomView({ fire: 0, temperature: 2, builderLevel: -1, wood: undefined, fur: 0 })).toMatchObject({ frost: 0, furpile: false, stranger: null, woodpile: null });
  });

  it('changes the description key when the scene changes meaning', () => {
    const a = roomView({ fire: 2, temperature: 2, builderLevel: 2, wood: 5, fur: undefined });
    const b = roomView({ fire: 2, temperature: 2, builderLevel: 3, wood: 5, fur: undefined });
    expect(describeKey(a)).not.toBe(describeKey(b));
    expect(describeKey(a)).toBe(describeKey(roomView({ fire: 2, temperature: 2, builderLevel: 2, wood: 6, fur: undefined })));
  });
});

describe('integer fitting', () => {
  it('chooses the overlay only with room for 2 CSS px per logical pixel on a wide enough screen', () => {
    expect(chooseMode(1920, 1080 - HEADER_H, 1)).toBe('overlay');
    expect(chooseMode(1024, 600 - HEADER_H, 1)).toBe('overlay');
    expect(chooseMode(800, 600 - HEADER_H, 1)).toBe('stacked');
    expect(chooseMode(390, 844 - HEADER_H, 3)).toBe('stacked');
    expect(chooseMode(844, 390 - HEADER_H, 3)).toBe('stacked');
    expect(chooseMode(0, 500, 1)).toBe('stacked');
  });

  it('scales the full frame by whole device pixels and centres it on device pixels', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
      for (const [w, h] of [
        [1920, 1024],
        [1366, 712],
        [1024, 544],
        [1440, 844],
        [2560, 1384]
      ]) {
        const f = fitFull(w, h, dpr);
        expect(Number.isInteger(f.scale) && f.scale >= 1).toBe(true);
        expect(f.scale).toBe(fullScale(w, h, dpr));
        expect(f.backingW).toBe(VIEW_W * f.scale);
        expect(f.ps).toBeCloseTo(f.scale / dpr, 9);
        expect(f.left).toBeGreaterThanOrEqual(0);
        expect(f.top).toBeGreaterThanOrEqual(0);
        expect(f.left + f.cssW).toBeLessThanOrEqual(w + 1e-9);
        expect(f.top + f.cssH).toBeLessThanOrEqual(h + 1e-9);
        expect(Math.abs(f.left * dpr - Math.round(f.left * dpr))).toBeLessThan(1e-6);
        expect(Math.abs(f.top * dpr - Math.round(f.top * dpr))).toBeLessThan(1e-6);
      }
    }
  });

  it('keeps the narrow crop, and centres it on the focus when even scale 1 is too wide', () => {
    const f = fitNarrow(390, 450, 3);
    expect(f.crop).toEqual(NARROW_CROP);
    expect(f.scale).toBe(2);
    expect(f.cssW).toBeLessThanOrEqual(390);

    const tight = fitNarrow(300, 400, 1);
    expect(tight.scale).toBe(1);
    expect(tight.crop.w).toBe(300);
    expect(tight.crop.y).toBe(NARROW_CROP.y);
    expect(tight.crop.x + tight.crop.w / 2).toBe(FOCUS_X);
    expect(tight.crop.x).toBeGreaterThanOrEqual(NARROW_CROP.x);
    expect(tight.crop.x + tight.crop.w).toBeLessThanOrEqual(NARROW_CROP.x + NARROW_CROP.w);
  });

  it('maps pointer positions back to logical pixels', () => {
    for (const f of [fitFull(1366, 712, 1), fitFull(1536, 808, 1.25), fitNarrow(390, 450, 3)]) {
      for (const p of [ANCHOR.hearth, ANCHOR.strangerCorner, { x: 0, y: 14 }]) {
        const c = toCss(f, p.x, p.y);
        const back = toLogical(f, c.x, c.y);
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
    }
  });
});

describe('HUD placement around the frame', () => {
  /** what main.ts layout() does for a viewport (scrollbars ignored) */
  function place(w: number, h: number, dpr: number) {
    const vh = h - HEADER_H;
    const stacked = chooseMode(w, vh, dpr) === 'stacked';
    const f = stacked ? fitNarrow(w, vh * STACKED_STAGE_SHARE, dpr) : fitFull(w, vh, dpr);
    return { f, l: hudLayout(f, w, vh), vh };
  }

  it('picks side, band and stacked where expected', () => {
    expect(place(1920, 1080, 1).l.mode).toBe('side');
    expect(place(1366, 768, 1).l.mode).toBe('side');
    expect(place(1280, 720, 1).l.mode).toBe('band');
    expect(place(1024, 600, 1).l.mode).toBe('band');
    expect(place(2560, 1440, 1).l.mode).toBe('band');
    expect(place(390, 844, 3).l.mode).toBe('stacked');
    expect(place(844, 390, 3).l.mode).toBe('stacked');
    expect(place(800, 600, 1).l.mode).toBe('stacked');
  });

  it('never covers the room, at any viewport size and pixel ratio', () => {
    let checked = 0;
    for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.625, 3]) {
      for (let w = 320; w <= 3840; w += 52) {
        for (let h = 360; h <= 2160; h += 46) {
          const { f, l } = place(w, h, dpr);
          checked++;
          if (l.mode === 'stacked') {
            // the interface flows below the frame
            expect(f.crop.y).toBe(NARROW_CROP.y);
            expect(f.cssW).toBeLessThanOrEqual(w + 1e-9);
            continue;
          }
          const tag = `${w}x${h}@${dpr} ${l.mode}`;
          expect(f.ps, tag).toBeGreaterThanOrEqual(OVERLAY_MIN_PS);
          // side panels start under the top band; the band under the floor's front edge
          expect(l.roomTop, tag).toBeCloseTo(l.canvas.y + TOP_BAND * f.ps, 9);
          expect(l.band, tag).toBeCloseTo(l.canvas.y + FLOOR_FRONT * f.ps, 9);
          // the band holds at least the frame's dark strip under the floor (>= 72 CSS px)
          expect(l.bandH, tag).toBeGreaterThanOrEqual((VIEW_H - FLOOR_FRONT) * f.ps - 1);
          expect(l.bandH, tag).toBeGreaterThanOrEqual(72 - 1);
          if (l.mode === 'side') {
            expect(l.canvas.x, tag).toBeGreaterThanOrEqual(SIDE_MIN);
            expect(w - l.canvas.x - l.canvas.w, tag).toBeGreaterThanOrEqual(SIDE_MIN);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('hands the CSS rounded pixel variables', () => {
    const vars = layoutVars(place(1366, 768, 1).l);
    expect(Object.keys(vars).sort()).toEqual(['--band', '--bandh', '--ch', '--cw', '--cx', '--cy', '--room-top'].sort());
    for (const v of Object.values(vars)) expect(v).toMatch(/^-?\d+(\.\d{1,2})?px$/);
  });
});

describe('reduction of the source art', () => {
  const R = [200, 40, 32, 255];
  const B = [20, 32, 160, 255];
  const T = [0, 0, 0, 0];

  /** an image from rows of RGBA pixels */
  function img(rows: number[][][]): Pixels {
    const height = rows.length;
    const width = rows[0].length;
    return { data: new Uint8ClampedArray(rows.flat(2)), width, height };
  }
  const at = (p: Pixels, x: number, y: number): number[] => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));

  it('leaves an image of the same size untouched in every mode', () => {
    const src = img([
      [R, B, R],
      [B, R, B]
    ]);
    for (const mode of SAMPLE_MODES) expect(Array.from(resample(src, 3, 2, { mode }).data), mode).toEqual(Array.from(src.data));
  });

  it("'mode' keeps the dominant colour, 'box' averages, 'nearest' takes the centre", () => {
    // one 2x2 block -> one pixel: three red, one blue (bottom-right = the 'centre' pixel); the
    // colours average to whole numbers, so no rounding is involved
    const src = img([
      [R, R],
      [R, B]
    ]);
    expect(at(resample(src, 1, 1, { mode: 'mode' }), 0, 0)).toEqual(R);
    expect(at(resample(src, 1, 1, { mode: 'box' }), 0, 0)).toEqual([155, 38, 64, 255]);
    expect(at(resample(src, 1, 1, { mode: 'nearest' }), 0, 0)).toEqual(B);
  });

  it('cuts alpha to hard edges at half coverage, or keeps it soft without a cut', () => {
    const half = img([
      [R, T],
      [R, T]
    ]);
    const quarter = img([
      [R, T],
      [T, T]
    ]);
    expect(at(resample(half, 1, 1, { alphaCut: 0.5 }), 0, 0)).toEqual(R);
    expect(at(resample(quarter, 1, 1, { alphaCut: 0.5 }), 0, 0)[3]).toBe(0);
    expect(at(resample(quarter, 1, 1, { alphaCut: null }), 0, 0)).toEqual([200, 40, 32, Math.round(255 / 4)]);
    expect(at(resample(half, 1, 1, { alphaCut: 0.5, opacity: 0.5 }), 0, 0)[3]).toBe(128);
  });

  it('reads the page colour from the opaque border only', () => {
    const p = img([
      [R, R, R, R, R],
      [R, B, B, B, T],
      [R, B, B, B, R],
      [R, R, R, R, R]
    ]);
    expect(borderColour(p, 1)).toEqual([200, 40, 32]);
  });
});

describe('the arrival', () => {
  it('opens the door, walks the stranger to the corner and closes the door', () => {
    const start = arrivalPose(0);
    expect(start.door).toBe(1);
    expect(start.stranger).toBeNull();
    expect(arrivalPose(ARRIVAL_T.open).door).toBe(2);
    expect(arrivalPose(ARRIVAL_T.open).draft).toBe(1);

    const enter = arrivalPose(ARRIVAL_T.enter).stranger!;
    expect(enter.pose).toBe('walking');
    expect([enter.x, enter.y]).toEqual([ANCHOR.strangerDoor.x, ANCHOR.strangerDoor.y]);

    let lastX = enter.x;
    for (let t = ARRIVAL_T.enter; t < ARRIVAL_T.reach; t += 50) {
      const s = arrivalPose(t).stranger!;
      expect(s.pose).toBe('walking');
      expect(s.x).toBeGreaterThanOrEqual(lastX);
      lastX = s.x;
    }
    expect(arrivalPose(ARRIVAL_T.reach).stranger).toMatchObject({ pose: 'resting', x: ANCHOR.strangerCorner.x, y: ANCHOR.strangerCorner.y });

    const end = arrivalPose(ARRIVAL_MS + 1000);
    expect(end.door).toBe(0);
    expect(end.draft).toBe(0);
    expect(end.stranger).toMatchObject({ pose: 'huddled', x: ANCHOR.strangerCorner.x, y: ANCHOR.strangerCorner.y });
  });

  it('plays only for a live 0 -> 1, never for a loaded save or a catch-up', () => {
    const loaded = new ArrivalWatcher();
    expect(loaded.observe(1, true)).toBe(false);
    expect(loaded.observe(1, true)).toBe(false);

    const live = new ArrivalWatcher();
    expect(live.observe(0, true)).toBe(false);
    expect(live.observe(1, true)).toBe(true);
    expect(live.observe(1, true)).toBe(false);

    const hidden = new ArrivalWatcher();
    hidden.observe(0, true);
    expect(hidden.observe(1, false)).toBe(false);
    expect(hidden.observe(1, true)).toBe(false);

    const early = new ArrivalWatcher();
    early.observe(-1, true);
    expect(early.observe(1, true)).toBe(false);
  });
});

describe('light and particles', () => {
  it('fades every layer out at the frame border', () => {
    expect(edgeFade(0, 100)).toBe(0);
    expect(edgeFade(VIEW_W - 1, 100)).toBe(0);
    expect(edgeFade(EDGE, EDGE)).toBe(1);
    expect(edgeFade(240, 135)).toBe(1);
  });

  it('lights nothing without a fire and the heart of the hearth with one', () => {
    expect(litAt(0, LIGHT_CENTRE.x, LIGHT_CENTRE.y)).toBe(0);
    expect(litAt(4, LIGHT_CENTRE.x, LIGHT_CENTRE.y)).toBe(1);
    expect(litAt(4, 20, 20)).toBe(0);
    for (let f = 1; f <= 4; f++) expect(litAt(f, LIGHT_CENTRE.x, LIGHT_CENTRE.y), `fire ${f}`).toBeGreaterThan(0);
  });

  it('dims the room to the ambient level away from the fire', () => {
    for (let f = 0; f <= 4; f++) {
      const k = lightAt(f, 30, 240).k;
      for (const c of k) expect(c, `fire ${f}`).toBeCloseTo(AMBIENT[f], 9);
    }
  });

  it('holds the flicker steady when motion is reduced', () => {
    for (let t = 0; t < 5000; t += 70) expect(flickerVariant(t, true)).toBe(1);
  });

  it('keeps sparks in the hearth and snow in its window', () => {
    for (let t = 0; t < 20; t += 0.07) {
      for (const p of sparks(4, t)) {
        expect(p.x).toBeGreaterThan(FIREBOX.x);
        expect(p.x).toBeLessThan(FIREBOX.x + FIREBOX.w - 1);
        expect(p.y).toBeGreaterThan(FIREBOX.y);
        expect(p.y).toBeLessThan(FIREBOX.y + FIREBOX.h - 1);
      }
      expect(sparks(1, t)).toEqual([]);
      const area = { x: 10, y: 20, w: 30, h: 40 };
      for (const p of snow(area, t, 12, 3)) {
        expect(p.x >= area.x && p.x < area.x + area.w && p.y >= area.y && p.y < area.y + area.h).toBe(true);
      }
    }
  });

  it('loops animation frames', () => {
    expect(loopFrame(0, 8, 4)).toBe(0);
    expect(loopFrame(0.5, 8, 4)).toBe(0);
    expect(loopFrame(0.375, 8, 4)).toBe(3);
    expect(loopFrame(10, 0, 4)).toBe(0);
    expect(loopFrame(10, 8, 1)).toBe(0);
  });
});

describe('edition plumbing', () => {
  it('keeps its own storage keys', () => {
    expect(SAVE_KEY).toMatch(/^emberveil\.pixel\./);
    expect(PREFS_KEY).toMatch(/^emberveil\.pixel\./);
    expect(SAVE_KEY).not.toBe(PREFS_KEY);
  });

  it('has every interface string in both languages', () => {
    expect(missingKeys()).toEqual([]);
  });
});
