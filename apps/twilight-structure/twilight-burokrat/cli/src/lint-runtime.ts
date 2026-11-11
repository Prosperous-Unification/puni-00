import { realpathSync } from 'node:fs';
import { delimiter, isAbsolute, sep } from 'node:path';

import { createGitEnvironment } from './git-environment';
import { LintUsageRefusal } from './lint-request';

/** One physical trusted cwd and executable lookup identity for every probe and lint stage. */
export interface LintRuntime {
  readonly directory: string;
  readonly environment: Readonly<Record<string, string>>;
}

/**
 * Freeze PATH before any child changes cwd (including Git's own -C). Absolute components remain
 * verbatim; relative components retain native symlink/parent semantics through prefixing, and
 * an empty component denotes the trusted cwd. No inherited environment is merged.
 * @throws LintUsageRefusal when anchoring into a delimiter-containing cwd cannot be represented.
 * Missing/unreadable trusted cwd and other filesystem failures propagate.
 */
function readLookup(
  path: string,
  runtimeDirectory: string,
): { readonly directory: string; readonly path: string } {
  // Proof: runtime-native-cwd; `stable lint executable lookup > canonicalizes the trusted cwd with native symlink and parent semantics` fails with this injected fault and passes after restoration.
  // Proof: shared-runtime-native-cwd; `stable lint executable lookup > canonicalizes the trusted cwd with native symlink and parent semantics` failed under its recorded production fault and passed after restoration.
  const directory = realpathSync.native(runtimeDirectory);
  const components = path.split(delimiter).map((component) => {
    // Proof: runtime-absolute-path-preserved; `stable lint executable lookup > preserves absolute components verbatim including native parent segments` fails with this injected fault and passes after restoration.
    // Proof: shared-runtime-absolute-path-preserved; `stable lint executable lookup > preserves absolute components verbatim including native parent segments` failed under its recorded production fault and passed after restoration.
    if (isAbsolute(component)) return component;
    // Proof: runtime-delimiter-refusal; `stable lint executable lookup > refuses an unrepresentable anchored PATH ""` fails with this injected fault and passes after restoration.
    // Proof: shared-runtime-delimiter-refusal; `stable lint executable lookup > refuses an unrepresentable anchored PATH ""` failed under its recorded production fault and passed after restoration.
    if (directory.includes(delimiter))
      throw new LintUsageRefusal('relative PATH cannot represent the trusted runtime directory');
    // Proof: runtime-empty-path-confined; `stable lint executable lookup > keeps a wholly empty PATH confined to the trusted runtime cwd` fails with this injected fault and passes after restoration.
    // Proof: shared-runtime-empty-path-confined; `stable lint executable lookup > keeps a wholly empty PATH confined to the trusted runtime cwd` failed under its recorded production fault and passed after restoration.
    if (component === '') return directory;
    // Proof: runtime-relative-path-freeze; `keeps the selected Git PATH identity when the captured validator changes cwd` fails with this injected fault and passes after restoration.
    // Proof: shared-runtime-relative-path-freeze; `keeps the selected Git PATH identity when the captured validator changes cwd` failed under its recorded production fault and passed after restoration.
    return directory + (directory.endsWith(sep) ? '' : sep) + component;
  });
  return { directory, path: components.join(delimiter) };
}

/** Freeze ordinary executable lookup against the independently selected trusted origin. */
export function freezePath(path: string, runtimeDirectory: string): string {
  return readLookup(path, runtimeDirectory).path;
}

/** Build one physical trusted cwd and explicit Git environment through the shared lookup policy. */
export function readLintRuntime(path: string, runtimeDirectory: string): LintRuntime {
  const lookup = readLookup(path, runtimeDirectory);
  // Proof: runtime-controlled-environment; `stable lint executable lookup > freezes ordered relative and empty components against the trusted runtime cwd` fails with this injected fault and passes after restoration.
  // Proof: shared-runtime-controlled-environment; `stable lint executable lookup > freezes ordered relative and empty components against the trusted runtime cwd` failed under its recorded production fault and passed after restoration.
  return { directory: lookup.directory, environment: createGitEnvironment(lookup.path) };
}
