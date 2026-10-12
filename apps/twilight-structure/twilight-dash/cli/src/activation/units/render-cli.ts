import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { renderObservationUnits } from './render';

/** Writes reviewable, uninstalled unit bytes into one newly created private directory. */
export function renderObservationBundle(inputPath: string, outputDirectory: string): void {
  // Proof: outputpath omitted canonicality; `alias/../aliased-render` was created.
  if (!isAbsolute(outputDirectory) || resolve(outputDirectory) !== outputDirectory)
    throw new Error('observation bundle directory malformed');
  const source = readFileSync(inputPath, 'utf8');
  if (Buffer.byteLength(source, 'utf8') > 16 * 1024)
    throw new Error('observation unit input too large');
  const raw: unknown = JSON.parse(source);
  const rendered = renderObservationUnits(raw);
  // Proof: fresh made mkdir recursive; a preexisting empty directory was accepted.
  mkdirSync(outputDirectory, { mode: 0o700 });
  try {
    writeFileSync(`${outputDirectory}/tool-wiki-observation.service`, rendered.service, {
      flag: 'wx',
      mode: 0o600,
    });
    writeFileSync(`${outputDirectory}/tool-wiki-observation.timer`, rendered.timer, {
      flag: 'wx',
      mode: 0o600,
    });
    writeFileSync(`${outputDirectory}/runtime.sha256`, rendered.runtimePins, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (cause) {
    try {
      rmSync(outputDirectory, { recursive: true, force: true });
    } catch (cleanupCause) {
      throw new AggregateError(
        [cause, cleanupCause],
        'observation bundle write and cleanup failed',
        {
          cause: cleanupCause,
        },
      );
    }
    throw cause;
  }
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 4) throw new Error('observation renderer arguments malformed');
    renderObservationBundle(process.argv[2], process.argv[3]);
  } catch {
    process.stderr.write(
      'observation unit rendering refused; inspect trusted layout and output path\n',
    );
    process.exitCode = 1;
  }
}
