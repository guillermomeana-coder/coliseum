#!/usr/bin/env node
/**
 * Coliseum — install the Fabric mod into a real Minecraft install.
 * Finds Java 25 and Minecraft, installs Fabric loader if needed, builds the mod, copies the jar
 * into mods/ (replacing older agentcraft-*.jar) and installs Fabric API.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { handleHelp } from './lib/help.mjs';
import { findJava, javaDownloadHint } from './lib/java.mjs';
import { findMinecraftDir, modsDir, isFabricInstalled } from './lib/minecraft.mjs';
import { readGradleProperties, installFabricLoader, installFabricApi } from './lib/fabric.mjs';
import { selectModJar, replaceModJar } from './lib/installmod.mjs';

const USAGE = `Usage: node tools/install-mod.mjs [--minecraft-dir PATH] [--skip-build] [--skip-fabric] [--dry-run]

Installs the Coliseum Fabric mod into your Minecraft: needs Java 25, builds mod/ with Gradle,
installs Fabric loader + Fabric API, and copies the jar into <minecraft>/mods.

Options:
  --minecraft-dir PATH   Minecraft directory (default: auto-detected)
  --skip-build           use the existing mod/build/libs jar instead of running Gradle
  --skip-fabric          do not install the Fabric loader (Fabric API is still installed)
  --dry-run              print each step, change nothing
  -h, --help             show this help
`;
handleHelp(USAGE);

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dry = flag('--dry-run');
const modDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mod');
const step = (m) => console.log(`${dry ? '[dry-run] ' : ''}${m}`);
const die = (m) => { console.error(m); process.exit(1); };

const java = findJava({ minMajor: 25 });
if (!java) {
  const h = javaDownloadHint();
  die(`Java 25 not found.\n  Download: ${h.url}\n  Or: ${h.hint}`);
}
step(`Java ${java.major}: ${java.javaBin}`);

const mc = findMinecraftDir({ override: opt('--minecraft-dir') });
if (!mc) die('Minecraft directory not found. Run the Minecraft launcher once, or pass --minecraft-dir PATH.');
step(`Minecraft: ${mc}`);

const props = readGradleProperties(path.join(modDir, 'gradle.properties'));
const mcVersion = props.minecraft_version;
const loaderVersion = props.loader_version;
const mods = modsDir(mc);

if (flag('--skip-fabric')) step('Skipping Fabric loader install (--skip-fabric)');
else if (isFabricInstalled(mc, mcVersion, loaderVersion)) step(`Fabric loader ${loaderVersion} for ${mcVersion} already installed`);
else {
  step(`Installing Fabric loader ${loaderVersion} for Minecraft ${mcVersion}`);
  if (!dry) await installFabricLoader({ javaBin: java.javaBin, mcDir: mc, mcVersion, loaderVersion });
}

if (flag('--skip-build')) step('Skipping Gradle build (--skip-build)');
else {
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  step(`Building mod: ${gradlew} build (in ${modDir})`);
  if (!dry) {
    const env = { ...process.env, ...(java.home ? { JAVA_HOME: java.home } : {}) };
    const r = spawnSync(gradlew, ['build'], { cwd: modDir, env, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.error || r.status !== 0) die('Gradle build failed.');
  }
}

const libs = path.join(modDir, 'build', 'libs');
const base = props.archives_base_name;
let jar = null;
try { jar = selectModJar(fs.readdirSync(libs), { base, version: props.mod_version }); } catch { /* no libs dir */ }
if (!jar) {
  if (dry) step(`Would copy ${base}-${props.mod_version}.jar from ${libs} to ${mods} (not built yet)`);
  else die(`No ${base}-${props.mod_version}.jar in ${libs}. Run without --skip-build.`);
} else if (dry) step(`Would copy ${jar} to ${mods}, removing older ${base}-*.jar`);
else {
  const { dest, removed } = replaceModJar({ jarPath: path.join(libs, jar), modsDir: mods, base });
  step(`Installed ${dest}${removed.length ? ` (removed ${removed.join(', ')})` : ''}`);
}

step(`Installing Fabric API ${props.fabric_api_version}`);
if (!dry) {
  const r = await installFabricApi({ modsDir: mods, version: props.fabric_api_version });
  console.log(r.skipped ? `Fabric API already present: ${r.path}` : `Installed ${r.path}`);
}

console.log(`\nDone. In the Minecraft launcher, pick the fabric-loader-${loaderVersion}-${mcVersion} profile.`);
