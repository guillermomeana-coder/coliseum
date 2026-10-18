// Installs production dependencies for foreman/ and tools/ before packaging.
// Skips a directory when node_modules already exists. Foreman runs its TypeScript
// through tsx at runtime, and tsx is a devDependency there, so it is added back
// after the `--omit=dev` install.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cwd, args) {
  console.log(`[prepare] ${path.basename(cwd)}: npm ${args.join(' ')}`);
  const r = spawnSync(npm, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`npm ${args.join(' ')} failed in ${cwd}`);
}

for (const name of ['foreman', 'tools']) {
  const dir = path.join(root, name);
  if (existsSync(path.join(dir, 'node_modules'))) {
    console.log(`[prepare] ${name}: node_modules present, skipping`);
    continue;
  }
  run(dir, ['ci', '--omit=dev']);
  if (name === 'foreman') {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const ver = pkg.devDependencies?.tsx;
    if (!ver) throw new Error('foreman/package.json has no tsx devDependency');
    run(dir, ['install', '--no-save', '--no-audit', '--no-fund', `tsx@${ver}`]);
  }
}
