// Accelerated-clock legal-action checks, not a claim of real-time/manual full completion.
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try {
  const { playFreshSettlement }=await server.ssrLoadModule('/tests/support/fresh-settlement.ts');
  const dir='docs/engineering/playtest/2026-10-19-progression';
  await fs.mkdir(dir,{recursive:true});
  const reports=[];
  for(const reload of [false,true]) for(const seed of [42,7,99]){
    const checkpoints=reload?['forest','builder','cart','hut','lodge','workshop','compass']:[];
    const run=playFreshSettlement(seed,10800,checkpoints);
    const name=`fresh-${seed}${reload?'-reload':''}`;
    await fs.writeFile(`${dir}/${name}.txt`,run.save);
    await fs.writeFile(`${dir}/${name}.json`,JSON.stringify(JSON.parse(Buffer.from(run.save,'base64').toString('utf8')),null,2)+'\n');
    reports.push({...run.result,mode:reload?'milestone-reloads':'continuous'});
    console.log(JSON.stringify({name,completed:run.result.completed,seconds:run.result.seconds,reloads:run.result.reloads.length,goal:run.result.goal}));
  }
  await fs.writeFile(`${dir}/fresh-audit.json`,JSON.stringify({method:'fresh state, legal actions, accelerated clock; not manual full-game completion',runs:reports},null,2)+'\n');
  if(reports.some(run=>!run.completed))process.exitCode=1;
} finally {await server.close();}
