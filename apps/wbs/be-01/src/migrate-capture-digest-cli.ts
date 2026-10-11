import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

// Prints the SHA-256 of a copied migration capture:
//
//   bun run src/migrate-capture-digest-cli.ts --root=<dir> <capture-path>
//
// The caller names the directory it copied the capture into (the swap uses `/tmp` inside
// green; the adapter tests use their own temp directory), and the path must lie inside it,
// so this CLI can never be pointed at the database or another file the caller did not place.
const arguments_ = process.argv.slice(2);
const rootFlag = arguments_.at(0);
const capturePath = arguments_.at(1);
// Proof: removing the argument guard made `digest CLI refuses paths outside the named root
// and ambiguous arguments` miss the `expected --root=<absolute dir>` refusal (2026-10-11).
if (
  arguments_.length !== 2 ||
  rootFlag === undefined ||
  !rootFlag.startsWith('--root=') ||
  capturePath === undefined
) {
  throw new Error('expected --root=<absolute dir> and exactly one capture path inside it');
}
const root = rootFlag.slice('--root='.length);
const fromRoot = relative(resolve(root), resolve(capturePath));
// Proof: removing the containment refusal made the same test read /data/wbs.db (ENOENT)
// instead of refusing it as outside the named root (2026-10-11). The old hard-coded `/tmp/`
// prefix refused h2puni's adapter tests, whose temp root is /var/tmp.
if (
  !isAbsolute(root) ||
  !isAbsolute(capturePath) ||
  fromRoot === '' ||
  fromRoot === '..' ||
  fromRoot.startsWith(`..${sep}`) ||
  isAbsolute(fromRoot)
) {
  throw new Error(`capture path ${capturePath} is not inside the named root ${root}`);
}

console.log(createHash('sha256').update(readFileSync(capturePath)).digest('hex'));
