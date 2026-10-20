// Isolated QA saves: real scheduled settlement events plus a specified expedition fight.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { startGame, villageState, expeditionState } = await server.ssrLoadModule('/tests/helpers.ts');
  const { scriptedRng } = await server.ssrLoadModule('/src/core/index.ts');
  const dir = 'docs/engineering/playtest/2026-10-20-settlement-events';
  await fs.mkdir(dir, { recursive: true });
  function attack(g) {
    g.events.deferPresentation = true;
    const pool = g.events.candidates(), index = pool.indexOf(g.content.events.Outside[4]);
    g.rng = scriptedRng([(index + .01) / pool.length, .5, 0]);
    g.events.triggerEvent();
    if (g.events.pendingCount !== 1) throw new Error('Attack not queued');
  }
  async function save(g, name) {
    await fs.writeFile(`${dir}/${name}.txt`, g.exportCode());
    await fs.writeFile(`${dir}/${name}.json`, JSON.stringify(JSON.parse(g.storage.getItem('emberveil.pixel.save')), null, 2)+'\n');
    g.stop();
  }
  const early = startGame(villageState({ marketing: { penrose: true }, game: { buildings: { hut: 1, trap: 3 }, population: 4 }, stores: { wood: 500, fur: 0, meat: 0 } }));
  attack(early); await save(early, 'early-queued');
  const world = startGame(expeditionState({ marketing: { penrose: true }, game: { buildings: { hut: 3, lodge: 1 }, population: 12, workers: { hunter: 8 } }, stores: { wood: 1000, fur: 0, meat: 0, 's armour': 1, 'bone spear': 1 } }));
  world.path.outfit = { 'cured meat': 8, 'bone spear': 1 }; world.path.embark();
  world.world.move('east');
  world.events.startEvent(world.content.events.Encounters[0]);
  attack(world); await save(world, 'combat-queued');
  console.log('Created isolated early-village and in-combat settlement-news saves.');
} finally { await server.close(); }
