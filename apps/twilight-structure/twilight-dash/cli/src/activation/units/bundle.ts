import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { renderObservationUnits } from './render';

/** The file names an administrator installs; the timer template's `Unit=` names the service. */
export const OBSERVATION_SERVICE_UNIT = 'twilight-dash-observation.service';
export const OBSERVATION_TIMER_UNIT = 'twilight-dash-observation.timer';

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
    writeFileSync(`${outputDirectory}/${OBSERVATION_SERVICE_UNIT}`, rendered.service, {
      flag: 'wx',
      mode: 0o600,
    });
    writeFileSync(`${outputDirectory}/${OBSERVATION_TIMER_UNIT}`, rendered.timer, {
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

/** The one line `render-observation-units` refuses with when its grammar is wrong. */
export const usage = 'Usage: render-observation-units <layout.json> <new-dir>';

/**
 * `render-observation-units <layout.json> <new-dir>`: parses its whole grammar before reading the
 * layout or creating the directory, then prints the three written paths. A refusal's message names
 * no input bytes, because a malformed layout's parse error would quote them; the cause keeps the
 * detail, and the entrypoint prints only its error codes.
 */
export function renderObservationUnitsCommand(
  argv: readonly string[],
  write: (text: string) => unknown,
): void {
  const [layoutPath, outputDirectory] = argv;
  // Proof: removing the `argv.length !== 2` half failed `render-observation-units refuses a
  // malformed grammar before any effect` at `[]`, which reached the layout read and refused as
  // "observation unit rendering refused" instead of the usage line (2026-10-12); removing the
  // empty-or-flag half failed it the same way at `['--layout', <dir>]`.
  if (
    argv.length !== 2 ||
    argv.some((argument) => argument.length === 0 || argument.startsWith('--'))
  ) {
    throw new Error(usage);
  }
  try {
    renderObservationBundle(layoutPath, outputDirectory);
  } catch (cause) {
    throw new Error('observation unit rendering refused; inspect trusted layout and output path', {
      cause,
    });
  }
  write(`${outputDirectory}/${OBSERVATION_SERVICE_UNIT}\n`);
  write(`${outputDirectory}/${OBSERVATION_TIMER_UNIT}\n`);
  write(`${outputDirectory}/runtime.sha256\n`);
}
