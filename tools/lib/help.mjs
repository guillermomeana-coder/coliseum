// Shared --help / -h handling for the tools/*.mjs CLIs. Call handleHelp() as the first statement of a
// script (right after the imports) so help is printed to stdout and the process exits 0 before any
// connection, launch, prompt or file write happens.
import fs from 'node:fs';

/** True when `-h` or `--help` appears in argv. */
export function helpRequested(argv = process.argv.slice(2)) {
  return argv.includes('--help') || argv.includes('-h');
}

/** Print `text` to stdout and exit 0 when help was requested; otherwise do nothing. */
export function handleHelp(text, argv = process.argv.slice(2)) {
  if (!helpRequested(argv)) return;
  try { fs.writeSync(1, text.endsWith('\n') ? text : `${text}\n`); } catch { /* closed stdout */ }
  process.exit(0);
}
