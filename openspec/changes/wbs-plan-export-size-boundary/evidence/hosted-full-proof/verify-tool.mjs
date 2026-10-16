import console from 'node:console';
import process from 'node:process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const packageRoot = process.argv[2];
const manifest = JSON.parse(readFileSync(join(packageRoot, 'dist/package-manifest.json'), 'utf8'));
const descriptor = JSON.parse(readFileSync(join(packageRoot, 'dist/toolkit/toolkit.json'), 'utf8'));
const digest = createHash('sha256')
  .update(readFileSync(join(packageRoot, 'dist/bin.mjs')))
  .digest('hex');
console.log(JSON.stringify({ manifest, executableSha256: digest, descriptor }, null, 2));
// Hosted attempt 38860460162 observed different bundles with builder paths;
// these are the new hosted pins, never aliases for the lost db3dcf/3432df bytes.
assert.equal(manifest.sourceRevision, 'ac774f0c358db369c2048e537151e263cc29361e');
assert.equal(
  manifest.toolkitIdentity,
  '2417f876901efadcc817e7518a8f796985c9e62409ab6f68458b55ea21d2b69a',
);
assert.equal(digest, '92ca1424826b325dad64a160090fb8c83521a5e581a48f6bed510a1d7d00ef4c');
assert.equal(descriptor.bunVersion, '1.4.2');
assert.equal(
  descriptor.trustedNodeModulesIdentity,
  'efe812480b995ccef8634e9c17adf9a51d8f3e016c771232ec49ea71aaba94ac',
);
