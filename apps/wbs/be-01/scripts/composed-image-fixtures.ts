import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

/** Exact external test-only closure, never an addition to the production image. */
export const COMPOSED_IMAGE_FIXTURES = [
  'app-fixture.ts',
  'auth-fixture.ts',
  'calendar-marker-fixture.ts',
  'capacity-fixture.ts',
  'clock-fixture.ts',
  'directory-fixture.ts',
  'email-verification-fixture.ts',
  'history-fixture.ts',
  'login-throttle-fixture.ts',
  'onboarding-fixture.ts',
  'organization-access-fixture.ts',
  'priority-band-fixture.ts',
  'project-address-search-fixture.ts',
  'project-fixture.ts',
  'project-rank-fixture.ts',
  'replay-fixture.ts',
  'saved-plan-fixture.ts',
  'solver-composed-image-client.ts',
  'space-fixture.ts',
  'step-fixture.ts',
  'work-item-fixture.ts',
  'writes-fixture.ts',
] as const;

/** Source identity of external fixtures; this is test metadata, never image or adoption authority. */
export interface ComposedFixtureProvenance {
  readonly directory: string;
  readonly files: readonly { readonly name: string; readonly sha256: string }[];
}

/**
 * Copies only the named regular fixtures into a fresh caller-owned directory and verifies every
 * delivered byte and entry. Source files are never modified. A failed stage removes only the
 * directory this call created; an existing destination is refused before cleanup ownership exists.
 * The optional copy operation is an internal fault seam; the CLI always uses copyFileSync.
 *
 * @throws for missing/unreadable/symlink fixtures, corrupt copies or unexpected staged entries.
 */
export function stageComposedImageFixtures(
  repository: string,
  directory: string,
  copy: (source: string, destination: string) => void = copyFileSync,
): ComposedFixtureProvenance {
  mkdirSync(directory, { mode: 0o700 });
  try {
    const files = COMPOSED_IMAGE_FIXTURES.map((name) => {
      const source = join(repository, 'apps/wbs/be-01/src/testing', name);
      const evidence = lstatSync(source);
      // Proof: omitting this check accepted the source symlink in the required-source fixture test.
      if (!evidence.isFile()) throw new Error(`fixture is not a regular file: ${name}`);
      // Proof: omitting this distinction changed the unreadable case to raw EACCES and failed its named refusal assertion.
      if ((evidence.mode & 0o444) === 0)
        throw new Error(`fixture has no read permissions: ${name}`);
      const bytes = readFileSync(source);
      const destination = join(directory, name);
      copy(source, destination);
      // Proof: omitting this check accepted the injected symlink in `refuses a symlink copied stage`.
      if (!lstatSync(destination).isFile())
        throw new Error(`staged fixture is not a regular file: ${name}`);
      // Proof: omitting readback accepted the corrupt-copy fault in `refuses a corrupt copied stage`.
      if (!readFileSync(destination).equals(bytes))
        throw new Error(`staged fixture bytes differ: ${name}`);
      // Proof: omitting chmod failed the delivered-file 0444 assertion in the exact-closure test.
      chmodSync(destination, 0o444);
      return { name, sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex') };
    });
    const entries = readdirSync(directory).sort();
    // Proof: omitting this comparison accepted unlisted.ts in `refuses a extra copied stage`.
    if (
      entries.length !== COMPOSED_IMAGE_FIXTURES.length ||
      entries.some((name, index) => name !== COMPOSED_IMAGE_FIXTURES[index])
    )
      throw new Error('staged fixture directory contains unexpected entries');
    // The private parent stays 0700; this bind-mounted child must be traversable
    // by the image's user, with no reliance on root or CAP_DAC_OVERRIDE.
    // Proof: omitting chmod left 0700 and failed the exact-closure test's 0755 assertion.
    chmodSync(directory, 0o755);
    return { directory, files };
  } catch (cause) {
    rmSync(directory, { recursive: true });
    throw cause;
  }
}

if (import.meta.main) {
  const repository = process.argv.at(2);
  const directory = process.argv.at(3);
  // Proof: omitting validation changed malformed CLI diagnostics and failed its three input negatives.
  if (repository === undefined || directory === undefined || process.argv.length !== 4)
    throw new Error('expected repository and fresh fixture directory');
  console.log(JSON.stringify(stageComposedImageFixtures(repository, directory)));
}
