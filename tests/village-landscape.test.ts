import { describe, expect, it } from 'vitest';
import { FOREST_EXIT, HUT_PLOTS, PUBLIC_FACILITIES } from '../src/app/village';
import { overlaps, roadBounds, ROOFS, villageLandscape } from '../src/pixel/village-landscape';

describe('village forest clearing', () => {
  it('keeps the complete canopy away from every open yard and road at all twenty stages', () => {
    for (let count = 0; count <= 20; count++) {
      const { yards, publicYards, paths, trees } = villageLandscape(count);
      expect(trees.length).toBeGreaterThan(40);
      const clear = [...yards, ...publicYards, ...paths.flatMap(p => p.map(roadBounds))];
      expect(publicYards).toHaveLength(7);
      expect(trees.every(tree => clear.every(area => !overlaps(tree, area)))).toBe(true);
      expect(yards).toHaveLength(count + 1);
      expect(ROOFS.slice(0, count + 1).every(roof => yards.some(yard => yard.x < roof.x && yard.y < roof.y &&
        yard.x + yard.w > roof.x + roof.w && yard.y + yard.h > roof.y + roof.h))).toBe(true);
    }
  });

  it('retreats gradually without moving, replacing or regrowing surviving trees', () => {
    for (let count = 1; count <= 20; count++) {
      const previous = villageLandscape(count - 1), next = villageLandscape(count);
      expect(next.trees.length).toBeLessThanOrEqual(previous.trees.length);
      expect(next.trees.every(tree => previous.trees.includes(tree))).toBe(true);
      expect(next.paths.slice(0, -1)).toEqual(previous.paths);
    }
  });

  it('routes continuous roads to every front door without crossing any current or future roof', () => {
    const { paths } = villageLandscape(20);
    paths.forEach((points, i) => {
      expect(points[0]).toEqual([288, 192]);
      expect(points.every(([x, y]) => ROOFS.every(roof => !overlaps({ x: x - 1, y: y - 1, w: 3, h: 3 }, roof)))).toBe(true);
      points.slice(1).forEach((point, j) => expect((point[0] - points[j][0]) ** 2 + (point[1] - points[j][1]) ** 2).toBeLessThanOrEqual(18));
      const last = points.at(-1)!;
      const facility = PUBLIC_FACILITIES[i - 1], hut = HUT_PLOTS[i - PUBLIC_FACILITIES.length - 1];
      const target = !i ? [FOREST_EXIT.x, FOREST_EXIT.y] : i <= PUBLIC_FACILITIES.length ?
        [facility.x, facility.y + 4] : [hut[0], hut[1] + 4];
      expect(Math.hypot(last[0] - target[0], last[1] - target[1])).toBeLessThanOrEqual(2);
    });
  });
});
