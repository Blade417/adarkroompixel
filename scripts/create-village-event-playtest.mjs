// Isolated village casualty QA. Production never imports these prepared saves.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { startGame, villageState } = await server.ssrLoadModule('/tests/helpers.ts');
  const { ForestJourney } = await server.ssrLoadModule('/src/app/forest.ts');
  const dir = 'docs/engineering/playtest/2026-10-17-village-events';
  await fs.mkdir(dir, { recursive: true });
  const g = startGame(villageState({ marketing: { penrose: true },
    game: { buildings: { hut: 3, lodge: 1, tannery: 1 }, population: 12,
      workers: { hunter: 6, tanner: 3 } },
    stores: { wood: 1000, fur: 200, meat: 100, leather: 20 } }));
  new ForestJourney(g).travel('village'); g.saveNow();
  const raw = g.storage.getItem('emberveil.pixel.save');
  await fs.writeFile(`${dir}/village-base.json`, JSON.stringify(JSON.parse(raw), null, 2)+'\n');
  await fs.writeFile(`${dir}/village-base.txt`, Buffer.from(raw).toString('base64'));
  g.stop();
  console.log('Created 12-resident village QA save with 3 gatherers, 6 hunters and 3 tanners.');
} finally { await server.close(); }
