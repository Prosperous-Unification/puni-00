import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const paths = process.argv.slice(2);
const capturePath = paths.at(0);
// Proof: removing the argument/path guard made `digest CLI refuses paths outside /tmp`
// attempt to read a database path and lose the explicit capture-path refusal.
if (paths.length !== 1 || !capturePath?.startsWith('/tmp/')) {
  throw new Error('expected exactly one /tmp capture path');
}

console.log(createHash('sha256').update(readFileSync(capturePath)).digest('hex'));
