import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wrapperSource = `
const realGit = process.env.WIKI_REAL_GIT;
const blob = process.env.WIKI_CHANGED_BLOB;
const changed = Buffer.from(process.env.WIKI_CHANGED_BYTES, 'utf8');
const args = process.argv.slice(2);
if (args[2] !== 'cat-file' || args[3] !== '--batch') {
  const passed = Bun.spawnSync([realGit, ...args], { stdio: ['inherit', 'inherit', 'inherit'] });
  process.exit(passed.exitCode);
}
const batch = Bun.spawnSync([realGit, ...args], {
  stdin: await Bun.stdin.bytes(),
  stdout: 'pipe',
  stderr: 'inherit',
});
let output = Buffer.from(batch.stdout);
const header = output.indexOf(blob + ' blob ');
if (header >= 0) {
  const newline = output.indexOf(10, header);
  const size = Number(output.subarray(header + blob.length + 6, newline).toString('utf8'));
  output = Buffer.concat([
    output.subarray(0, header),
    Buffer.from(blob + ' blob ' + String(changed.length) + '\\n', 'utf8'),
    changed,
    output.subarray(newline + 1 + size),
  ]);
}
await Bun.write(Bun.stdout, output);
process.exit(batch.exitCode);
`;

/**
 * A `git` for PATH that answers `cat-file --batch` with `WIKI_CHANGED_BYTES` in place of the
 * selected bytes of `WIKI_CHANGED_BLOB`, under the blob's own identity and a matching size, so
 * only a digest binding can tell. Other Git calls go to `WIKI_REAL_GIT` unchanged.
 * @returns the directory to put first on PATH.
 */
export function installChangedBatchGit(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-changed-batch-git-'));
  const wrapper = join(directory, 'git');
  writeFileSync(wrapper, `#!${process.execPath}\n${wrapperSource}`);
  chmodSync(wrapper, 0o755);
  return directory;
}
