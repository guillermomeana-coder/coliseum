// First-run welcome text. Plain ASCII only so it renders in cmd/PowerShell.
import { readConfigFile } from './configpath.mjs';

export const LOGO = [
  String.raw`  ____ ___  _     ___ ____  _____ _   _ __  __ `,
  String.raw` / ___/ _ \| |   |_ _/ ___|| ____| | | |  \/  |`,
  String.raw`| |  | | | | |    | |\___ \|  _| | | | | |\/| |`,
  String.raw`| |__| |_| | |___ | | ___) | |___| |_| | |  | |`,
  String.raw` \____\___/|_____|___|____/|_____|\___/|_|  |_|`,
];

export const INTRO = [
  'Coliseum is an AI agent team (a lead plus workers) that plans and writes code in your git repos.',
  'You watch the team as characters working inside a Minecraft HQ or arena.',
  'You stay in charge by approving merges and decisions before anything lands.',
];

export function welcomeText() {
  return `\n${LOGO.join('\n')}\n\n${INTRO.join(' ')}\n`;
}

/** True when no config.json exists (new location or legacy). */
export function isFirstRun(opts) {
  return readConfigFile(opts) === null;
}
