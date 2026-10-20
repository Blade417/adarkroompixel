import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const release = { name: pkg.name, version: pkg.version, commit };
await writeFile(new URL('dist/release.json', root), JSON.stringify(release, null, 2) + '\n');
await writeFile(new URL('dist/.nojekyll', root), '');
console.log(`Release: ${pkg.version} (${commit.slice(0, 7)})`);
