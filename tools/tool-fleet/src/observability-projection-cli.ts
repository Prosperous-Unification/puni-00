import { readFile } from 'node:fs/promises';

import { type } from 'arktype';

import { validateObservabilityProjections } from './observability-projection-render';

/** Only fixed public refusal categories may cross the command's logging boundary. */
class ProjectionRefusal extends Error {
  constructor(
    category: 'invalid-arguments' | 'input-absent' | 'input-unreadable' | 'input-malformed',
  ) {
    super(`observability projection: ${category}`);
  }
}

try {
  const arguments_ = process.argv.slice(2);
  // Proof: the real CLI extra-argument negative succeeds when this exact argument-count guard is removed.
  if (arguments_.length !== 3 || arguments_.some((argument) => argument.trim() === ''))
    throw new ProjectionRefusal('invalid-arguments');
  let source: string;
  try {
    source = await readFile(arguments_[2], 'utf8');
  } catch (failure) {
    const fault = type({ code: 'string' })(failure);
    throw new ProjectionRefusal(
      !(fault instanceof type.errors) && fault.code === 'ENOENT'
        ? 'input-absent'
        : 'input-unreadable',
    );
  }
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    throw new ProjectionRefusal('input-malformed');
  }
  console.log(
    JSON.stringify(await validateObservabilityProjections(arguments_[0], arguments_[1], input)),
  );
} catch (failure) {
  // Proof: forwarding raw failures exposed the synthetic private marker from both schema values and failed Helm stderr in CLI negatives.
  console.error(
    failure instanceof ProjectionRefusal
      ? failure.message
      : 'observability projection: validation-refused',
  );
  process.exit(1);
}
