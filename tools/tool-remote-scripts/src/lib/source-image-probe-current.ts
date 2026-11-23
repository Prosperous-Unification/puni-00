/** Fixed current-profile image program: Bun observes its numeric user and both possible configuration roots without launching another owned script. */
export const CURRENT_SOURCE_IMAGE_PROBE = String.raw`
import { constants, accessSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, normalize } from 'node:path';
import { userInfo } from 'node:os';
if (process.getuid?.() !== 1000 || process.getgid?.() !== 1000) throw new Error('source image numeric identity differs');
const home = Object.hasOwn(process.env, 'HOME') ? process.env.HOME : userInfo().homedir;
if (typeof home !== 'string' || home.length === 0 || home.length > 4096 || !isAbsolute(home) || normalize(home) !== home || home.includes('\0') || home.includes('\n') || home.includes('\r')) throw new Error('source image home is invalid');
function readDirectory(directory, forbidden) {
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink() || realpathSync.native(directory) !== directory) throw new Error('source image configuration root is not canonical');
  accessSync(directory, constants.R_OK | constants.X_OK);
  const names = readdirSync(directory);
  if (names.length > 16384) throw new Error('source image configuration root exceeds bound');
  if (forbidden !== undefined && names.includes(forbidden)) throw new Error('source image contains configuration');
  return names;
}
readDirectory(home, '.bunfig.toml');
const SOURCE_ROOT = '/src';
if (readDirectory(dirname(SOURCE_ROOT)).includes(basename(SOURCE_ROOT))) readDirectory(SOURCE_ROOT, 'bunfig.toml');
process.stdout.write('wbs-source-image-config-absent-v2\n');
`;
