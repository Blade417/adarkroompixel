// Explicit QA fixture imported through Settings; never loaded by production code.
import fs from 'node:fs';
import path from 'node:path';
const output = path.resolve('docs/engineering/playtest/2026-10-16-expedition-integration');
fs.mkdirSync(output, { recursive: true });
const map = Array.from({ length: 61 }, () => Array(61).fill(';'));
map[30][30] = 'A'; map[31][30] = 'H'; map[30][29] = 'P';
map[32][30] = 'V'; map[35][30] = 'I';
const state = {
  version: 1.3,
  features: { location: { room: true, outside: true, world: true }, executioner: true },
  game: { fire: { value: 4, text: 'roaring' }, temperature: { value: 4, text: 'hot' },
    builder: { level: 4 }, buildings: { cart: 1, trap: 1, hut: 2, workshop: 1, lodge: 1, tannery: 1, smokehouse: 1, 'trading post': 1 },
    outside: { seenForest: true }, population: 8, workers: { hunter: 2, tanner: 1, charcutier: 1 },
    world: { map, mask: Array.from({ length: 61 }, () => Array(61).fill(false)) } },
  stores: { compass: 1, wood: 1000, 'cured meat': 30, 'bone spear': 1, 'iron sword': 1,
    rifle: 1, bullets: 8, bolas: 2, torch: 3, waterskin: 1, rucksack: 1, 'i armour': 1 }
};
fs.writeFileSync(path.join(output, 'qa-save.json'), JSON.stringify(state, null, 2));
fs.writeFileSync(path.join(output, 'qa-save.txt'), Buffer.from(JSON.stringify(state)).toString('base64'));
console.log('Created isolated integration QA save at ' + output);
