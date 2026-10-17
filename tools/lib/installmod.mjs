// Helpers for tools/install-mod.mjs: jar selection and old-jar replacement in mods/.
import fs from 'node:fs';
import path from 'node:path';

/**
 * Pick the built mod jar `<base>-<version>.jar` from a list of file names (never -sources/-dev/-javadoc).
 * @param {string[]} files names in mod/build/libs
 * @returns {string | null}
 */
export function selectModJar(files, { base, version }) {
  const want = `${base}-${version}.jar`;
  if (files.includes(want)) return want;
  const ok = files.filter((f) => f.startsWith(`${base}-`) && f.endsWith('.jar') && !/-(sources|dev|javadoc)\.jar$/.test(f));
  return ok.sort()[0] ?? null;
}

/**
 * Remove older `<base>-*.jar` from modsDir (except the new jar's name) and copy the new jar in.
 * @returns {{dest: string, removed: string[]}}
 */
export function replaceModJar({ jarPath, modsDir, base, fsImpl = fs }) {
  const name = path.basename(jarPath);
  fsImpl.mkdirSync(modsDir, { recursive: true });
  const removed = [];
  for (const f of fsImpl.readdirSync(modsDir)) {
    if (f !== name && f.startsWith(`${base}-`) && f.endsWith('.jar')) {
      fsImpl.rmSync(path.join(modsDir, f), { force: true });
      removed.push(f);
    }
  }
  const dest = path.join(modsDir, name);
  fsImpl.copyFileSync(jarPath, dest);
  return { dest, removed };
}
