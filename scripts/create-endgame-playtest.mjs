// Explicit synthetic QA saves, imported through Settings on an isolated preview origin.
// Production never loads these files automatically.
import { createServer } from 'vite';
import fs from 'node:fs/promises';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { startGame, villageState } = await server.ssrLoadModule('/tests/helpers.ts');
  const { scriptedRng } = await server.ssrLoadModule('/src/core/rng.ts');
  const { Endgame } = await server.ssrLoadModule('/src/app/endgame.ts');
  const dir = 'docs/engineering/playtest/2026-10-16-endgame';
  await fs.mkdir(dir, { recursive: true });
  const base = villageState({
    features: { location: { fabricator: true, spaceShip: true } },
    game: { buildings: { hut: 2, workshop: 1 }, population: 8, spaceShip: { hull: 1, thrusters: 2 } },
    stores: { wood: 100, 'alien alloy': 20 }, previous: { score: 500 }
  });
  const write = async (name, state) => {
    await fs.writeFile(`${dir}/${name}.json`, JSON.stringify(state, null, 2) + '\n');
    await fs.writeFile(`${dir}/${name}.txt`, Buffer.from(JSON.stringify(state)).toString('base64'));
  };
  await write('base', base);
  const blueprints = structuredClone(base);
  blueprints.character = { blueprints: Object.fromEntries(['kinetic armour', 'disruptor', 'hypo', 'stim', 'plasma rifle', 'glowstone'].map(id => [id, true])) };
  await write('blueprints', blueprints);
  const success = structuredClone(base); success.game.spaceShip.hull = 20;
  await write('success', success);
  const beacon = structuredClone(success); beacon.stores['fleet beacon'] = 1;
  await write('beacon', beacon);
  const g = startGame(base), m = new Endgame(g);
  g.rng = scriptedRng([0.5]); m.open('ship'); m.launch(); g.events.click('fly');
  g.saveNow();
  await write('collision', JSON.parse(g.storage.getItem('emberveil.pixel.save')));
  const h = startGame(beacon), n = new Endgame(h);
  h.rng = scriptedRng([0]); n.open('ship'); n.launch(); h.events.click('fly');
  h.tick(58000); h.saveNow();
  await write('beacon-final', JSON.parse(h.storage.getItem('emberveil.pixel.save')));
  console.log('Created isolated endgame QA saves: base, blueprints, success, beacon, collision, beacon-final.');
} finally { await server.close(); }
