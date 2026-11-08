import { readdir } from 'node:fs/promises';

import { type } from 'arktype';
import { spyOn } from 'bun:test';

import { copyImages } from '../../../tools/tool-fleet/src/platform-registry';
import { readPublicationEnrollment } from '../../../tools/tool-fleet/src/registry-enrollment';

const source = process.argv.at(2);
const target = process.argv.at(3);
const authority = process.argv.at(4);
const journal = process.argv.at(5);
if (
  source === undefined ||
  target === undefined ||
  authority === undefined ||
  journal === undefined
)
  throw new Error('Missing native copy fixture arguments');
const enrollment = await readPublicationEnrollment(target);
if (enrollment === undefined) throw new Error('Managed copy enrollment absent');
const before = await readdir(enrollment.builder.path);
const original = Bun.spawn;
let commands = 0;
const substitute = (
  argv: readonly string[],
  options: Bun.Spawn.SpawnOptions<'pipe', 'pipe', 'pipe'>,
) => {
  if (argv[0] === '/usr/bin/ssh') {
    if (
      JSON.stringify(argv) !==
      JSON.stringify([
        '/usr/bin/ssh',
        '-o',
        'BatchMode=yes',
        '--',
        'fixture',
        'sudo -n /usr/local/sbin/puni-registry-authority',
      ])
    )
      throw new Error('Unexpected production authority transport');
    commands += 1;
    return original([process.execPath, authority, journal], options);
  }
  return original([...argv], options);
};
// Fixture boundary: both production spawn callers use argv+options. Only the exact fixed
// SSH command is replaced; the same actual authority CLI runs under the fixture UID59001.
const transport = spyOn(Bun, 'spawn').mockImplementation(substitute as unknown as typeof Bun.spawn);
try {
  const copied = await copyImages(
    { url: source },
    { url: target },
    enrollment.requiredRepositories.map((repository) => ({ repository, reference: 'v1' })),
  );
  const CompletedCopies = type({
    digest: 'string',
    publication: { receipt: { state: "'completed'" } },
  })
    .array()
    .exactlyLength(3);
  const completed = CompletedCopies(copied);
  if (
    completed instanceof type.errors ||
    commands !== 7 ||
    completed.some(
      (image) =>
        image.digest !== 'sha256:27ddb6fd651405cb8f8b78089a405d330cff8e3154dde0b8bd90febfcd95d7ed',
    )
  )
    throw new Error('Managed copy omitted the exact complete bundle receipt');
  if (
    JSON.stringify((await readdir(enrollment.builder.path)).sort()) !==
    JSON.stringify(before.sort())
  )
    throw new Error('Managed copy left its owned scratch directory');
  console.log(
    'PASS native managed copyImages stages exact source closure and completes all required tiers',
  );
} finally {
  transport.mockRestore();
}
