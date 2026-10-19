// Synthetic late-game QA only. Import through visible settings on a separate origin.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { startGame, expeditionState } = await server.ssrLoadModule('/tests/helpers.ts');
  const { Expedition } = await server.ssrLoadModule('/src/app/expedition.ts');
  const { scriptedRng } = await server.ssrLoadModule('/src/core/rng.ts');
  const dir = 'docs/engineering/playtest/2026-10-19-warship'; await fs.mkdir(dir, { recursive: true });
  const write = async (name, g) => {
    g.saveNow(); const raw = g.storage.getItem('emberveil.pixel.save');
    await fs.writeFile(`${dir}/${name}.json`, JSON.stringify(JSON.parse(raw), null, 2)+'\n');
    await fs.writeFile(`${dir}/${name}.txt`, Buffer.from(raw).toString('base64')); g.stop();
  };
  const prepared = (completed = false) => {
    const state = expeditionState({
      features: { location: { fabricator: true } },
      game: { world: { executioner: true, engineering: completed, medical: completed, martial: completed } },
      stores: { 'kinetic armour': 1, 'cargo drone': 1, waterskin: 1, 'plasma rifle': 1,
        'energy blade': 1, disruptor: 1, 'energy cell': 140, medicine: 30, hypo: 8,
        'cured meat': 12, 'alien alloy': 3, grenade: 2 }
    });
    state.game.world.map[31][30] = 'X';
    for (let x=27;x<=33;x++) for (let y=27;y<=33;y++) state.game.world.mask[x][y] = true;
    const g = startGame(state), ex = new Expedition(g); ex.open();
    for (const [item,n] of Object.entries({ 'plasma rifle': 1, 'energy blade': 1, disruptor: 1,
      'energy cell': 140, medicine: 30, hypo: 8, 'cured meat': 12, 'alien alloy': 3, grenade: 2 })) ex.pack(item,n);
    ex.depart(); g.rng = scriptedRng([.1]); ex.move('east'); return { g, ex };
  };
  await write('antechamber', prepared().g);
  await write('command-ready', prepared(true).g);
  for (const wing of ['engineering', 'martial', 'medical', 'command']) {
    const {g} = prepared(wing === 'command'); g.events.click(wing); await write(wing, g);
  }
  const representatives = new Map();
  const {g: probe} = prepared();
  for (const [event,def] of Object.entries(probe.content.events.Executioner)) for (const [scene,s] of Object.entries(def.scenes)) {
    if (s.enemy && !representatives.has(s.enemy)) representatives.set(s.enemy, { event, scene });
  }
  probe.stop();
  for (const [enemy,{event,scene}] of representatives) {
    const {g} = prepared(event === 'executioner-command');
    g.events.switchEvent(g.content.events.Executioner[event]); g.events.loadScene(scene);
    await write('enemy-'+enemy.replaceAll(' ','-'), g);
  }
  // Real timer-created boss status; explicit combat-position fixtures, not full playthroughs.
  for (const [name,wing,scene,ms,roll] of [
    ['prototype-shield','engineering','7',5100,.1], ['sparring-energised','martial','12',13100,.1],
    ['experiment-enraged','medical','16',16100,.1], ['immortal-meditation','command','6',7100,.99]
  ]) {
    const {g} = prepared(wing === 'command'); g.events.click(wing); g.events.loadScene(scene);
    g.rng = scriptedRng([roll]); g.tick(ms); await write(name, g);
  }
  console.log('Created independent antechamber, four deck starts, command-ready, 16 enemies and four timed boss status fixtures.');
} finally { await server.close(); }
