// Continue the earned fresh-start saves on their generated maps, without inserting items or encounters.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try {
  const { startGame }=await server.ssrLoadModule('/tests/helpers.ts');
  const { Expedition }=await server.ssrLoadModule('/src/app/expedition.ts');
  const { settlementGoal }=await server.ssrLoadModule('/src/app/progression.ts');
  const { seededRng }=await server.ssrLoadModule('/src/core/rng.ts');
  const dir='docs/engineering/playtest/2026-10-19-progression', reports=[];
  const directions=[['east',1,0],['south',0,1],['west',-1,0],['north',0,-1]];
  for(const seed of [42,7,99]){
    const state=JSON.parse(await fs.readFile(`${dir}/fresh-${seed}.json`,'utf8'));
    const g=startGame(state,{rng:seededRng(seed+1000)}), ex=new Expedition(g);
    const before={...g.store.get('stores')}, moves=[], combats=[], seen=new WeakSet();
    ex.open();ex.pack('cured meat',8);ex.pack('bone spear',1);ex.depart();
    const trail=[[...g.world.curPos]];
    const settle=()=>{
      let elapsed=0;
      while(g.events.active()&&g.active==='world'&&elapsed<180000){
        const ev=g.events.active(), c=ev.combat;
        if(c&&!seen.has(c)){seen.add(c);combats.push(c.enemy.id+':'+ev.scene.enemy);}
        if(c&&!c.isOver()){
          if(g.world.health<=g.world.getMaxHealth()-4)c.use('eat');
          const attack=c.attacks().find(a=>a.id==='bone spear'&&a.enabled);
          if(attack)ex.attack(attack.id);
        }else{
          for(const item of Object.keys(ev.loot??{}))g.events.takeAll(item);
          const buttons=g.events.buttons().filter(b=>b.enabled);
          const leave=buttons.find(b=>b.id==='leave')??buttons.find(b=>!b.cost)??buttons.at(-1);
          if(leave)g.events.click(leave.id);
        }
        g.tick(100);elapsed+=100;
      }
      if(g.events.active()&&g.active==='world')throw new Error(`Encounter did not settle: ${seed}`);
    };
    for(let step=0;step<4&&g.active==='world';step++){
      const [x,y]=g.world.curPos;
      // Only already visible terrain is eligible; unseen map cells never guide the route.
      const choice=directions.find(([,dx,dy])=>{
        const nx=x+dx,ny=y+dy,world=g.world.state;
        return world.mask[nx]?.[ny]&&g.world.isTerrain(world.map[nx]?.[ny])&&!trail.some(p=>p[0]===nx&&p[1]===ny);
      });
      if(!choice)break;
      if(!ex.move(choice[0]))throw new Error('Legal move rejected');
      moves.push(choice[0]);trail.push([...g.world.curPos]);settle();g.tick(1000);
    }
    for(let i=trail.length-2;i>=0&&g.active==='world';i--){
      const [x,y]=g.world.curPos,[tx,ty]=trail[i];
      const direction=directions.find(([,dx,dy])=>x+dx===tx&&y+dy===ty)?.[0];
      if(!direction||!ex.move(direction))throw new Error('Return route rejected');
      moves.push(direction);settle();g.tick(1000);
    }
    const returned=ex.phase==='home', outcome=ex.phase;
    if(returned)ex.close();
    const report={seed,method:'earned fresh save, visible terrain only, seeded normal encounter rolls, accelerated combat clock',returned,outcome,moves,combats,goal:settlementGoal(g).id,
      foodBefore:before['cured meat'],foodAfter:g.store.num('stores["cured meat"]'),health:g.world.health};
    reports.push(report);g.saveNow();
    await fs.writeFile(`${dir}/first-trip-${seed}.json`,JSON.stringify(JSON.parse(g.storage.getItem('emberveil.pixel.save')),null,2)+'\n');
    await fs.writeFile(`${dir}/first-trip-${seed}.txt`,g.exportCode());g.stop();console.log(JSON.stringify(report));
  }
  await fs.writeFile(`${dir}/first-trip-audit.json`,JSON.stringify(reports,null,2)+'\n');
  if(reports.some(r=>!r.returned))process.exitCode=1;
} finally {await server.close();}
