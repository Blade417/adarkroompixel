// Explicit prepared QA snapshots. Imported via visible settings on a separate origin only.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try {
  const {startGame,expeditionState}=await server.ssrLoadModule('/tests/helpers.ts');
  const {Expedition}=await server.ssrLoadModule('/src/app/expedition.ts');
  const {DEEP_SITES}=await server.ssrLoadModule('/src/app/expedition-art.ts');
  const {scriptedRng}=await server.ssrLoadModule('/src/core/rng.ts');
  const dir='docs/engineering/playtest/2026-10-19-deep-expedition';await fs.mkdir(dir,{recursive:true});
  const write=async(name,g)=>{g.saveNow();const raw=g.storage.getItem('emberveil.pixel.save');
    await fs.writeFile(`${dir}/${name}.json`,JSON.stringify(JSON.parse(raw),null,2)+'\n');
    await fs.writeFile(`${dir}/${name}.txt`,Buffer.from(raw).toString('base64'));g.stop();};
  const prepared=id=>{
    const state=expeditionState({stores:{'kinetic armour':1,'cargo drone':1,waterskin:1,rifle:1,bullets:90,medicine:35,torch:4,charm:1}});
    for(const [site,x,y] of [['city',31,30],['battlefield',30,29],['borehole',30,31],['ship',29,30],['swamp',31,31],['executioner',29,29]])
      state.game.world.map[x][y]=DEEP_SITES[site].tile;
    // Every site fixture is one step east, to make a visible return possible without test-only game hooks.
    if(id)state.game.world.map[31][30]=DEEP_SITES[id].tile;
    for(let x=27;x<=33;x++)for(let y=27;y<=33;y++)state.game.world.mask[x][y]=true;
    const g=startGame(state),ex=new Expedition(g);ex.open();
    for(const [item,n]of Object.entries({'cured meat':15,rifle:1,bullets:90,medicine:30,torch:3,charm:1}))ex.pack(item,n);
    ex.depart();g.rng=scriptedRng([.1]);if(id)ex.move('east');return {g,ex};
  };
  await write('map',prepared().g);
  for(const id of Object.keys(DEEP_SITES))await write(id,prepared(id).g);
  for(const [name,scene] of [['sniper','b3'],['commando','d6'],['frail-man','b5'],['old-man','b8'],
    ['youth','d8'],['squatters','c11'],['deformed','d10'],['lizards','c12'],['bird','d1'],['rats','d3'],['tentacles','d11'],['city-cleared','end13']]) {
    const {g}=prepared('city');g.events.loadScene(scene);await write(name,g);
  }
  const {g}=prepared('executioner');g.events.loadScene('7');await write('warship-device',g);
  console.log('Created six deep entrances, map, eleven city enemy fixtures, city ending and battleship device fixture.');
} finally {await server.close();}
