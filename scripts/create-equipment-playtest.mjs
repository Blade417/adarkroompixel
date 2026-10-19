// Synthetic equipment QA, imported through visible settings on a separate origin.
// Armour is owned in stores, never packed: this retains the original Path rules.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { startGame, expeditionState } = await server.ssrLoadModule('/tests/helpers.ts');
  const { Expedition } = await server.ssrLoadModule('/src/app/expedition.ts');
  const { scriptedRng } = await server.ssrLoadModule('/src/core/rng.ts');
  const dir = 'docs/engineering/playtest/2026-10-19-equipment'; await fs.mkdir(dir, { recursive: true });
  const write = async (name, g) => {
    g.saveNow(); const raw = g.storage.getItem('emberveil.pixel.save');
    await fs.writeFile(`${dir}/${name}.json`, JSON.stringify(JSON.parse(raw), null, 2)+'\n');
    await fs.writeFile(`${dir}/${name}.txt`, Buffer.from(raw).toString('base64')); g.stop();
  };
  const prepare = (weapon, armour = 'kinetic armour', supplies = {}, battle = true) => {
    const packed = { [weapon]: 1, 'energy cell': 20, medicine: 12, 'cured meat': 12, ...supplies };
    const state = expeditionState({ stores: { ...(armour ? {[armour]: 1} : {}), 'cargo drone': 1, waterskin: 1, ...packed } });
    for(let x=27;x<=34;x++) for(let y=27;y<=34;y++) {
      if(x!==30 || y!==30) state.game.world.map[x][y]=',';
      state.game.world.mask[x][y]=true;
    }
    const g = startGame(state, { language: 'zh' }), ex = new Expedition(g); ex.open();
    for(const [id,n] of Object.entries(packed)) ex.pack(id,n);
    ex.wieldedWeapon=weapon; if(!ex.depart()) throw Error('Could not depart');
    g.rng=scriptedRng([.99]); ex.move('east');
    if(battle) { g.events.startEvent(g.content.events.Executioner['executioner-command']); g.events.loadScene('6'); }
    return {g,ex};
  };
  const late=['bayonet','laser rifle','grenade','plasma rifle','energy blade','disruptor'];
  for(const weapon of late) {
    await write('weapon-'+weapon.replaceAll(' ','-'),prepare(weapon).g);
    const attacking=prepare(weapon); attacking.ex.attack(weapon); attacking.g.tick(50);
    await write('attack-'+weapon.replaceAll(' ','-'),attacking.g);
  }
  for(const [name,id] of [['none',''],['leather','l armour'],['iron','i armour'],['steel','s armour'],['kinetic','kinetic armour']]) {
    await write('armour-'+name,prepare('bayonet',id).g);
    await write('map-'+name,prepare('bayonet',id,{},false).g);
  }
  await write('all-weapons',prepare('bayonet','kinetic armour',{
    'laser rifle':1, grenade:2, 'plasma rifle':1, 'energy blade':1, disruptor:1, bolas:2
  }).g);
  await write('laser-last-cell',prepare('laser rifle','kinetic armour',{'energy cell':1,'energy blade':1}).g);
  await write('plasma-last-cell',prepare('plasma rifle','kinetic armour',{'energy cell':1}).g);
  const pending=prepare('plasma rifle','kinetic armour',{'energy cell':1});
  pending.ex.attack('plasma rifle'); pending.g.tick(100); await write('plasma-in-flight',pending.g);
  const shield=prepare('disruptor'); shield.g.events.active().combat.use('shield'); shield.g.tick(100);
  await write('shield-in-flight',shield.g);
  const stun=prepare('disruptor'); stun.ex.attack('disruptor'); stun.g.tick(300); await write('disruptor-stunned',stun.g);
  console.log('Created 28 isolated equipment, armour, map and real pending attack/status fixtures. Not natural progression.');
} finally { await server.close(); }
