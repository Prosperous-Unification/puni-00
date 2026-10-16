import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const [path, fault] = process.argv.slice(2);
const source = readFileSync(path, 'utf8');
if (fault === 'pointer-filter') {
  const guard = 'if (from?.pointerId !== event.pointerId) return;';
  assert.equal(source.split(guard).length - 1, 2);
  writeFileSync(path, source.replaceAll(guard, 'if (from === null) return;'));
} else if (fault === 'release-commit') {
  const commit = '        resize.commit(columnId, widthAt(event.clientX, from));';
  assert.equal(source.split(commit).length - 1, 1);
  writeFileSync(path, source.replace(commit, ''));
} else {
  throw new Error(`Unknown fault: ${fault}`);
}
