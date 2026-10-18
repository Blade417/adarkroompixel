// Run from the project root. Optional argument: official upstream checkout.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { makeGame } = await server.ssrLoadModule('/tests/helpers.ts');
  const data = await server.ssrLoadModule('/src/core/data.ts');
  const art = await server.ssrLoadModule('/src/app/expedition-catalog.ts');
  const g = makeGame();
  const c = g.content.events;
  const uniqueEnemies = new Set();
  for (const event of [...c.Encounters, ...Object.values(c.Setpieces), ...Object.values(c.Executioner)]) {
    for (const scene of Object.values(event.scenes)) if (typeof scene.enemy === 'string') uniqueEnemies.add(scene.enemy);
  }
  const report = {
    eventGroups: Object.fromEntries(['Global', 'Room', 'Outside', 'Marketing', 'Encounters', 'Setpieces', 'Executioner'].map(k => [k, Object.keys(c[k]).length])),
    setpieceScenes: Object.values(c.Setpieces).reduce((n, e) => n + Object.keys(e.scenes).length, 0),
    staticEnemyIds: [...uniqueEnemies].sort(),
    dedicatedEncounterArt: art.EARLY_ENCOUNTERS.map(e => e.id),
    reusedEnemyArt: ['beast'],
    weapons: Object.keys(data.WEAPONS),
    dedicatedWeaponArt: Object.keys(art.WEAPON_ART),
    fabricatorRecipes: Object.keys(data.FABRICATOR),
    villageBuildings: Object.entries(data.CRAFTABLES).filter(([, v]) => v.type === 'building').map(([id]) => id),
    landmarkTypes: Object.entries(data.landmarks(true)).map(([symbol, l]) => ({ symbol, scene: l.scene })),
    scope: 'Counts establish content presence and art mapping, not end-to-end playability.'
  };
  if (process.argv[2]) {
    const upstream = path.resolve(process.argv[2]);
    const files = ['script/events/global.js', 'script/events/room.js', 'script/events/outside.js', 'script/events/encounters.js', 'script/events/setpieces.js', 'script/events/marketing.js', 'script/events/executioner.js'];
    const hash = text => crypto.createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
    report.upstreamContent = await Promise.all(files.map(async file => ({ file, identical: hash(await fs.readFile(path.join('original', file), 'utf8')) === hash(await fs.readFile(path.join(upstream, file), 'utf8')) })));
    const ctx = { _: x => x };
    vm.createContext(ctx);
    vm.runInContext(await fs.readFile(path.join(upstream, 'script/world.js'), 'utf8'), ctx);
    report.upstreamWeaponsMatch = JSON.stringify(Object.keys(ctx.World.Weapons)) === JSON.stringify(report.weapons);
    report.upstreamWeaponRulesMatch = JSON.stringify(ctx.World.Weapons) === JSON.stringify(data.WEAPONS);
    const worldNames = ['RADIUS', 'VILLAGE_POS', 'STICKINESS', 'LIGHT_RADIUS', 'BASE_WATER', 'MOVES_PER_FOOD', 'MOVES_PER_WATER', 'DEATH_COOLDOWN', 'FIGHT_CHANCE', 'BASE_HEALTH', 'BASE_HIT_CHANCE', 'MEAT_HEAL', 'MEDS_HEAL', 'HYPO_HEAL', 'FIGHT_DELAY'];
    report.worldConstantComparison = Object.fromEntries(worldNames.map(k => [k, { upstream: ctx.World[k], pixel: data.WORLD[k], equal: JSON.stringify(ctx.World[k]) === JSON.stringify(data.WORLD[k]) }]));
  }
  const output = new URL('./coverage.json', import.meta.url);
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
