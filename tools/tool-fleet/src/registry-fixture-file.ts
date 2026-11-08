import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Pin actual artifact-file bytes, including credential/configuration files; this is integrity, not password verification. Read failures propagate. */
export async function pinFixtureFile(path: string): Promise<{ path: string; sha256: string }> {
  // Proof: replacing this read with empty bytes emits the wrong known SHA256 in registry-fixture-file.test.ts.
  const contents = await readFile(path);
  return { path, sha256: createHash('sha256').update(contents).digest('hex') };
}

/** Create an exclusive fixture file, preserve its requested mode independently of umask, then pin its actual written bytes. */
export async function writeFixtureFile(path: string, contents: string, mode = 0o644) {
  await mkdir(dirname(path), { recursive: true, mode: 0o755 });
  // Proof: changing wx to w overwrites the retained owned file in the occupied-path negative.
  await writeFile(path, contents, { flag: 'wx', mode });
  await chmod(path, mode);
  return pinFixtureFile(path);
}
