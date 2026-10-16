import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const receipts = process.argv[2];
const read = (name) => readFileSync(join(receipts, name), 'utf8');
const pointer = read('fault-pointer-filter.log');
const release = read('fault-release-commit.log');
assert(
  pointer.includes(
    'uses the initial width across multiple moves and commits only on matching release',
  ),
);
assert(/expected.*2 times.*3 times/.test(pointer));
assert(
  release.includes(
    'uses the initial width across multiple moves and commits only on matching release',
  ),
);
assert(release.includes('measures an unresolved Name once and clamps its width'));
assert(release.includes('Number of calls: 0'));
assert(/Tests\s+1 failed \| 2 passed/.test(pointer));
assert(/Tests\s+2 failed \| 1 passed/.test(release));
for (const name of ['mounted-positive.log', 'mounted-restored.log']) {
  assert(/Tests\s+3 passed/.test(read(name)));
}
console.log(
  'Fresh expected assertion failures observed for both production-path faults; positives and restoration passed.',
);
