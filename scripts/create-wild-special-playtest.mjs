// Isolated synthetic QA: original encounter definitions, balances and site buttons.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try {
  const {startGame,expeditionState}=await server.ssrLoadModule('/tests/helpers.ts');
  const {Expedition}=await server.ssrLoadModule('/src/app/expedition.ts');
  const {PRESTIGE_STORES,TILE}=await server.ssrLoadModule('/src/core/data.ts');
  const {scriptedRng}=await server.ssrLoadModule('/src/core/rng.ts');
  const dir='docs/engineering/playtest/2026-10-19-wild-special';await fs.mkdir(dir,{recursive:true});
  const write=async(name,g)=>{g.saveNow();const raw=g.storage.getItem('emberveil.pixel.save');
    await fs.writeFile(`${dir}/${name}.json`,JSON.stringify(JSON.parse(raw),null,2)+'\n');
    await fs.writeFile(`${dir}/${name}.txt`,Buffer.from(raw).toString('base64'));g.stop();};
  const prepare=(charm=1)=>{
    const state=expeditionState({previous:{stores:PRESTIGE_STORES.map((_,i)=>i===0?123:i===4?7:0)},
      stores:{'kinetic armour':1,'cargo drone':1,waterskin:1,'plasma rifle':1,'energy cell':40,medicine:20,charm}});
    state.game.world.map[31][30]=TILE.SWAMP;state.game.world.map[29][30]=TILE.CACHE;
    for(let x=27;x<=33;x++)for(let y=27;y<=33;y++)state.game.world.mask[x][y]=true;
    const g=startGame(state,{language:'zh'}),ex=new Expedition(g);ex.open();
    for(const [id,n] of Object.entries({'plasma rifle':1,'energy cell':40,medicine:20,'cured meat':12,charm}))ex.pack(id,n);
    ex.wieldedWeapon='plasma rifle';ex.depart();g.rng=scriptedRng([.1]);return {g,ex};
  };
  await write('map-ready',prepare().g);
  const noCharm=prepare(0);noCharm.ex.move('east');noCharm.g.events.click('enter');await write('cabin-no-charm',noCharm.g);
  for(const [name,dir] of [['swamp','east'],['cache','west']]) {
    const {g,ex}=prepare();ex.move(dir);await write(name+'-entrance',g);
  }
  for(const [enemy,terrain,distance] of [['shivering man',TILE.BARRENS,11],['man-eater',TILE.FOREST,11],['feral terror',TILE.FOREST,21]]) {
    const {g}=prepare();g.world.curPos=[30+distance,30];g.world.state.map[30+distance][30]=terrain;
    const def=g.content.events.Encounters.find(e=>e.scenes.start.enemy===enemy);
    if(!def.isAvailable())throw Error('Invalid original tier/terrain fixture');
    g.events.startEvent(def);await write(enemy.replaceAll(' ','-'),g);
  }
  console.log('Created seven synthetic map, site and tier-correct wilderness fixtures. No natural playthrough claim.');
} finally {await server.close();}
