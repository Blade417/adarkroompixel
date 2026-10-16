import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// A review snapshot, never a second runtime rules table. Does not read player saves.
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = new URL('../docs/engineering/data/first-expedition.json', import.meta.url);
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const data = await server.ssrLoadModule('/src/core/data.ts');
  const { Game } = await server.ssrLoadModule('/src/core/game.ts');
  const { nodeContent } = await server.ssrLoadModule('/src/node.ts');
  const game = new Game({ content: nodeContent() });
  game.start();
  const { WORLD, PATH, TILE, TILE_PROBS, WEIGHT, WEAPONS, EVENTS, landmarks } = data;
  const map = Array.from({ length: WORLD.RADIUS * 2 + 1 }, () => Array(WORLD.RADIUS * 2 + 1).fill(TILE.FOREST));
  game.world.state = { map, mask: map.map(column => column.map(() => false)) };
  const terrains = [TILE.FOREST, TILE.FIELD, TILE.BARRENS];
  const distances = [1, 10, 11, 20, 21, 30];
  function availability(def) {
    const samples = [];
    for (const distance of distances) for (const terrain of terrains) {
      game.world.curPos = [WORLD.RADIUS + distance, WORLD.RADIUS];
      map[game.world.curPos[0]][game.world.curPos[1]] = terrain;
      if (def.isAvailable?.()) samples.push({ distance, terrain });
    }
    return samples;
  }
  function sceneSummary(scene) {
    const hooks = ['onLoad', 'atHealth', 'specials'].filter(key => scene[key]);
    return {
      ...(scene.combat ? {
        enemy: scene.enemy, health: scene.health, damage: scene.damage,
        hit: scene.hit, attackDelaySeconds: scene.attackDelay, ranged: Boolean(scene.ranged)
      } : {}),
      ...(scene.text ? { text: scene.text } : {}),
      ...(scene.notification ? { notification: scene.notification } : {}),
      ...(scene.loot ? { loot: scene.loot } : {}),
      ...(scene.reward ? { reward: scene.reward } : {}),
      ...(scene.nextScene ? { nextScene: scene.nextScene } : {}),
      ...(scene.buttons ? { buttons: Object.fromEntries(Object.entries(scene.buttons).map(([id, button]) => [id, {
        text: button.text, cost: button.cost, reward: button.reward, nextScene: button.nextScene,
        nextEvent: button.nextEvent, cooldown: button.cooldown,
        hooks: ['available', 'onChoose', 'onClick'].filter(key => typeof button[key] === 'function')
      }])) } : {}),
      ...(hooks.length ? { hooks } : {})
    };
  }
  const encounters = game.content.events.Encounters.map(def => ({
    title: def.title, availabilitySamples: availability(def),
    scenes: Object.fromEntries(Object.entries(def.scenes).map(([id, scene]) => [id, sceneSummary(scene)]))
  }));
  const firstTier = encounters.filter(def => def.availabilitySamples.some(sample => sample.distance === 1));
  const setpieces = Object.fromEntries(['house', 'cave', 'ironmine', 'outpost'].map(id => {
    const def = game.content.events.Setpieces[id];
    assert.ok(def, `Missing setpiece: ${id}`);
    return [id, { title: def.title, scenes: Object.fromEntries(Object.entries(def.scenes).map(([name, scene]) => [name, sceneSummary(scene)])) }];
  }));
  const enemyIds = [...new Set([
    ...firstTier.flatMap(def => Object.values(def.scenes)),
    ...Object.values(setpieces).flatMap(def => Object.values(def.scenes))
  ].map(scene => scene.enemy).filter(Boolean))].sort();
  assert.equal(firstTier.length, 4, 'Review first-tier art scope when encounter count changes');
  assert.ok(enemyIds.includes('snarling beast'));
  const sourcePaths = [
    'src/core/data.ts', 'src/core/locations/path.ts', 'src/core/locations/world.ts',
    'src/core/events/combat.ts', 'src/core/events/runner.ts',
    'original/script/events/encounters.js', 'original/script/events/setpieces.js'
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path,
    createHash('sha256').update(await fs.readFile(new URL(path, new URL('../', import.meta.url)))).digest('hex')
  ])));
  const snapshot = {
    schemaVersion: 1,
    purpose: 'Read-only preparation snapshot. Runtime uses core and original scripts; hooks are intentionally not executable here.',
    sourceHashes,
    rules: { world: WORLD, path: PATH, tiles: TILE, terrainProbabilities: TILE_PROBS, weights: WEIGHT, defaultItemWeight: 1, weapons: WEAPONS, combat: EVENTS },
    landmarks: landmarks(false),
    availabilityProbe: { distances, terrains, note: 'Samples from actual isAvailable callbacks, not continuous range definitions.' },
    encounters, firstTripSetpieces: setpieces,
    firstTripEnemyIds: enemyIds,
    exclusions: ['coal-mine interior', 'town interior', 'distance > 10 encounters', 'later setpieces', 'new-game-plus cache'],
    caveat: 'An unrestricted world can reach excluded content. Those routes need explicit UI handling or full asset coverage before release.'
  };
  const output = JSON.stringify(snapshot, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    assert.equal(await fs.readFile(destination, 'utf8'), output, 'Expedition snapshot is stale; run node scripts/prepare-expedition.mjs');
  } else {
    await fs.mkdir(new URL('./', destination), { recursive: true });
    await fs.writeFile(destination, output, 'utf8');
  }
  console.log(JSON.stringify({ checked: process.argv.includes('--check'), encounters: encounters.length, firstTier: firstTier.length, setpieces: Object.keys(setpieces), enemyIds }, null, 2));
} finally {
  await server.close();
}
