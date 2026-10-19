import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifest from '../assets/pixel/endgame/v1/manifest.json';
import { Endgame } from '../src/app/endgame';
import { endgameScene, flightShipRect } from '../src/app/endgame-visuals';
import { SPACE } from '../src/core/data';
import { ROOT } from '../src/node';
import { startGame, villageState } from './helpers';

describe('endgame artwork delivery and persisted scene identity', () => {
  it('keeps generated originals verifiable and every runtime crop inside its source', () => {
    expect(Object.keys(manifest.sources)).toHaveLength(5);
    expect(Object.keys(manifest.assets)).toHaveLength(8);
    for (const [file, source] of Object.entries(manifest.sources)) {
      const bytes = fs.readFileSync(path.join(ROOT, 'assets/pixel/endgame/v1', file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(source.size);
    }
    for (const spec of Object.values(manifest.assets)) {
      const source = manifest.sources[spec.file as keyof typeof manifest.sources];
      const [x, y, w, h] = spec.sourceRect;
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0); expect(h).toBeGreaterThan(0);
      expect(x+w).toBeLessThanOrEqual(source.size[0]); expect(y+h).toBeLessThanOrEqual(source.size[1]);
    }
    expect(manifest.sources['flight-atlas.png'].transparentFraction).toBeGreaterThan(.2);
  });

  it('renders hazards within the exact original collision rectangle and centers the ship', () => {
    for (const id of ['asteroid-0', 'asteroid-1', 'asteroid-2'] as const)
      expect(manifest.assets[id].drawSize).toEqual([SPACE.ASTEROID_W, SPACE.ASTEROID_H]);
    for (const [x,y] of [[10,10],[350,350],[690,690]]) {
      const r = flightShipRect(x,y);
      expect(r.x+r.w/2).toBe(x); expect(r.y+r.h/2).toBe(y);
      expect([r.w,r.h]).toEqual(manifest.assets['flight-ship'].drawSize);
    }
  });

  it.each([false,true])('restores the saved ending picture even when beacon inventory disagrees (expansion=%s)', expansion => {
    const g = startGame(villageState({
      previous: { ending: { score: 123, total: 456, expansion } },
      stores: { 'fleet beacon': expansion ? 0 : 1 }
    }));
    const model = new Endgame(g); model.restore();
    expect(g.over).toBe(true);
    expect(endgameScene(g.active,model.ending)).toBe(expansion ? 'homefleet' : 'escape');
    expect(model.ending).toEqual({ score:123,total:456,expansion });
    g.stop();
  });

  it('keeps preparing, flying, crashing and returning on their own scene', () => {
    const g = startGame(villageState({features:{location:{spaceShip:true,fabricator:true}},game:{spaceShip:{hull:2,thrusters:2}}}));
    const model = new Endgame(g);
    model.open('fabricator'); expect(endgameScene(g.active,model.ending)).toBe('fabricator');
    model.open('ship'); expect(endgameScene(g.active,model.ending)).toBe('shipyard');
    model.launch(); g.events.click('fly'); expect(endgameScene(g.active,model.ending)).toBe('ascent');
    g.space.crash(); expect(endgameScene(g.active,model.ending)).toBe('shipyard');
    g.stop();
  });
});
