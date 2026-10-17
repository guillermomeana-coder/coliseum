// Every CLI in tools/ must answer --help / -h with usage text on stdout, exit 0, quickly and without
// side effects (no game/Foreman connection, no launch, no prompts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = fs.readdirSync(TOOLS).filter((f) => f.endsWith('.mjs')).sort();

test('discovers the tool scripts', () => {
  assert.ok(scripts.length >= 12, `found ${scripts.join(', ')}`);
});

for (const script of scripts) {
  for (const flag of ['--help', '-h']) {
    test(`${script} ${flag} prints usage and exits 0`, () => {
      const r = spawnSync(process.execPath, [path.join(TOOLS, script), flag], {
        cwd: TOOLS,
        encoding: 'utf8',
        timeout: 5000,
        // Unreachable ports and an empty HOME: help must not touch either.
        env: { ...process.env, AGENTCRAFT_PORT: '1', AGENTCRAFT_DEV_PORT: '1', HOME: TOOLS, USERPROFILE: TOOLS },
        stdin: 'ignore',
      });
      assert.equal(r.error, undefined, String(r.error));
      assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`);
      assert.ok(r.stdout.trim().length > 0, 'stdout is empty');
      assert.match(r.stdout, /usage/i);
    });
  }
}
