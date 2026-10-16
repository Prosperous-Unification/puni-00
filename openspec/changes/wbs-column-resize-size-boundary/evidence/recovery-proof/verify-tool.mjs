import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const packageRoot = process.argv[2];
const manifest = JSON.parse(readFileSync(join(packageRoot, 'dist/package-manifest.json'), 'utf8'));
const digest = createHash('sha256')
  .update(readFileSync(join(packageRoot, 'dist/bin.mjs')))
  .digest('hex');
console.log(JSON.stringify({ manifest, executableSha256: digest }, null, 2));
assert.equal(manifest.sourceRevision, 'ac774f0c358db369c2048e537151e263cc29361e');
assert.equal(
  manifest.toolkitIdentity,
  'db3dcf59b03555b34b0219b400c9a0ce077df031aa550eb2c1f2f03eae494a79',
);
assert.equal(digest, '3432dfb59cc8d2caa31ea4dbd561aa2963ceb1572174f7e98a5410ece455849c');
