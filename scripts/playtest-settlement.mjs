import { createServer } from 'vite';
import fs from 'node:fs/promises';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { playFreshSettlement } = await server.ssrLoadModule('/tests/support/fresh-settlement.ts');
  const runs = [42, 7, 99].map(seed => playFreshSettlement(seed));
  const report = JSON.stringify(runs.map(run => run.result), null, 2) + '\n';
  console.log(report);
  if (process.argv.includes('--export')) {
    const dir = 'docs/engineering/playtest/2026-10-16-settlement-economy';
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/fresh-progression.json`, report, 'utf8');
    await fs.mkdir('tmp', { recursive: true });
    await fs.writeFile('tmp/fresh-settlement-save.txt', runs[0].save, 'utf8');
  }
  if (runs.some(run => !run.result.completed)) process.exitCode = 1;
} finally {
  await server.close();
}
