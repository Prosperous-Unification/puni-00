import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import type {ToolkitSourceSelection} from '../policy/source-selection';
import { readInstalledPuniToolkit } from './installed';

/** Observed profile kind is explicit; a legacy record never supplies missing selected-source metadata. */
export type PuniInstallation={readonly entrypoint:string}&(
  |{readonly profileVersion:'0.3.0'}
  |{readonly profileVersion:'0.4.0';readonly sourceSelection:ToolkitSourceSelection}
);

/**
 * Check only current installed PUNI profile/role/closure consistency and the regular native main.
 * The caller must already authenticate the archive and admit placement; this does not authenticate
 * root bytes independently or claim a clean/public release. Historical readers stay unchanged.
 */
export function verifyPuniInstallation(packageDirectory: string): PuniInstallation {
  const directory = realpathSync.native(packageDirectory);
  const dist = realpathSync.native(join(directory, 'dist'));
  const contained = (path: string) => {
    const offset = relative(directory, path);
    return offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset);
  };
  if (!contained(dist)) throw new Error('installed PUNI dist escapes its package');
  const toolkit=readInstalledPuniToolkit(dist, join(dist, 'toolkit'));
  const entrypoint = realpathSync.native(join(dist, 'puni.mjs'));
  if (!contained(entrypoint) || !statSync(entrypoint).isFile())
    throw new Error('installed PUNI main is not a contained regular file');
  return toolkit.schemaVersion===3
    ?{entrypoint,profileVersion:'0.4.0',sourceSelection:structuredClone(toolkit.sourceSelection)}
    :{entrypoint,profileVersion:'0.3.0'};
}
