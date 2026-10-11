import { isAbsolute } from 'node:path';

import { ordinaryServerDescriptors, parseOrdinaryPortShift } from './playwright.ordinary-servers';

const repoRoot = process.argv.at(2);
const askedShift = process.argv.at(3);
const runDatabase = process.argv.at(4);
// Proof: the production CLI subprocess test omitted arguments and supplied a
// relative root; both exited nonzero with this named refusal before output.
if (
  process.argv.length !== 5 ||
  repoRoot === undefined ||
  askedShift === undefined ||
  runDatabase === undefined ||
  !isAbsolute(repoRoot) ||
  !isAbsolute(runDatabase)
)
  throw new Error('Ordinary server descriptors require root, shift and absolute database path');

const shift = parseOrdinaryPortShift(askedShift, true);
process.stdout.write(
  `${JSON.stringify(ordinaryServerDescriptors(repoRoot, shift, true, runDatabase))}\n`,
);
