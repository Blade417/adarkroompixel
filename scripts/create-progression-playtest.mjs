// Clearly synthetic UI-only fixtures; never confused with the earned fresh-* / first-trip-* saves.
import fs from 'node:fs/promises';
const dir='docs/engineering/playtest/2026-10-19-progression';
const base=JSON.parse(await fs.readFile('docs/engineering/playtest/2026-10-16-endgame/base.json','utf8'));
await fs.mkdir(dir,{recursive:true});
const cases={};
const fab=structuredClone(base);delete fab.features.location.spaceShip;cases.fabricator=fab;
const hull=structuredClone(base);hull.game.spaceShip.hull=0;cases.hull=hull;
const alloy=structuredClone(hull);alloy.stores['alien alloy']=0;alloy.stores.compass=1;cases.alloy=alloy;
const cold=structuredClone(base);delete cold.features.location.spaceShip;delete cold.features.location.fabricator;
cold.game.fire={value:0,text:'dead'};cold.game.temperature={value:0,text:'freezing'};cold.stores.wood=0;cases.cold=cold;
for(const [name,state]of Object.entries(cases)){
  await fs.writeFile(`${dir}/synthetic-${name}.json`,JSON.stringify(state,null,2)+'\n');
  await fs.writeFile(`${dir}/synthetic-${name}.txt`,Buffer.from(JSON.stringify(state)).toString('base64'));
}
console.log('Wrote four explicitly synthetic progression UI fixtures.');
