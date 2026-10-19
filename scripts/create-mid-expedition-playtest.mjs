// Synthetic prepared saves for isolated QA; never imported by production.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { startGame, expeditionState } = await server.ssrLoadModule('/tests/helpers.ts');
  const { Expedition } = await server.ssrLoadModule('/src/app/expedition.ts');
  const { scriptedRng } = await server.ssrLoadModule('/src/core/rng.ts');
  const dir = 'docs/engineering/playtest/2026-10-19-mid-expedition';
  await fs.mkdir(dir, { recursive: true });
  const write = async (name, g) => {
    g.saveNow(); const raw = g.storage.getItem('emberveil.pixel.save');
    await fs.writeFile(`${dir}/${name}.json`, JSON.stringify(JSON.parse(raw),null,2)+'\n');
    await fs.writeFile(`${dir}/${name}.txt`,Buffer.from(raw).toString('base64'));
  };
  const prepared = () => {
    const state = expeditionState({ stores: { 's armour':1,'cargo drone':1,waterskin:1,rifle:1,bullets:60,medicine:15,torch:4 } });
    state.game.world.map[31][30]='C'; state.game.world.map[30][31]='S'; state.game.world.map[30][29]='O';
    for(let x=27;x<=33;x++)for(let y=27;y<=33;y++)state.game.world.mask[x][y]=true;
    const g=startGame(state),ex=new Expedition(g);ex.open();
    for(const [id,n] of Object.entries({'cured meat':10,rifle:1,bullets:60,medicine:10,torch:3}))ex.pack(id,n);
    ex.depart();g.rng=scriptedRng([.1]);return {g,ex};
  };
  const {g}=prepared();await write('map',g);g.stop();
  for(const [name,direction,scene] of [
    ['coal','east',null],['sulphur','south',null],['town','north',null],
    ['chief','east','a3'],['veteran','south','a3'],
    ['thug','north','a2'],['scavenger','north','b2'],['madman','north','b5'],['vigilante','north','d2'],
    ['town-cleared','north','end1']
  ]){
    const {g,ex}=prepared();ex.move(direction);
    if(scene)g.events.loadScene(scene); // Explicit scene fixtures, not natural branch rolls.
    await write(name,g);g.stop();
  }
  console.log('Created map, three entrances, six scene fixtures and town-cleared QA saves.');
} finally {await server.close();}
