// Explicit synthetic prepared saves for isolated browser QA. Never loaded by production.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { startGame, expeditionState } = await server.ssrLoadModule('/tests/helpers.ts');
  const { Expedition } = await server.ssrLoadModule('/src/app/expedition.ts');
  const { scriptedRng } = await server.ssrLoadModule('/src/core/rng.ts');
  const dir = 'docs/engineering/playtest/2026-10-16-expedition-sites';
  await fs.mkdir(dir, { recursive: true });
  const write = async (name, g) => {
    g.saveNow();
    const raw = g.storage.getItem('emberveil.pixel.save');
    await fs.writeFile(`${dir}/${name}.json`, JSON.stringify(JSON.parse(raw), null, 2) + '\n');
    await fs.writeFile(`${dir}/${name}.txt`, Buffer.from(raw).toString('base64'));
  };
  const prepared = () => {
    const state = expeditionState({ stores: { 'cured meat': 40, torch: 8, rifle: 1, bullets: 12, 'steel sword': 1, 's armour': 1, rucksack: 1, waterskin: 1 } });
    const map = state.game.world.map;
    map[31][30] = 'H'; map[32][30] = 'V'; map[30][29] = 'P'; map[30][31] = 'I';
    for (let x = 27; x <= 33; x++) for (let y = 27; y <= 33; y++) state.game.world.mask[x][y] = true;
    const g = startGame(state), ex = new Expedition(g);
    ex.open();
    for (const [id, n] of Object.entries({ 'cured meat': 5, torch: 3, rifle: 1, bullets: 10, 'steel sword': 1 })) ex.pack(id, n);
    ex.depart(); g.rng = scriptedRng([.9]);
    return { g, ex };
  };
  const { g } = prepared(); await write('map', g); g.stop();
  for (const [name, scene, direction, enter] of [
    ['house', null, 'east', false], ['squatter', 'occupied', 'east', true],
    ['cave-lizard', 'b4', 'east', false], ['lizard', 'c2', 'east', false],
    ['beast', 'c1', 'east', false], ['matriarch', null, 'south', true],
    ['outpost', null, 'north', false]
  ]) {
    const { g, ex } = prepared();
    ex.move(direction);
    if (['cave-lizard', 'lizard', 'beast'].includes(name)) {
      g.events.click('leave'); ex.move('east');
      g.events.loadScene(scene); // Explicit branch fixture; does not represent a natural branch roll.
    } else if (enter) g.events.click('enter');
    await write(name, g); g.stop();
  }
  console.log('Created map, house, squatter, cave-lizard, lizard, beast, matriarch and outpost QA saves.');
} finally { await server.close(); }
