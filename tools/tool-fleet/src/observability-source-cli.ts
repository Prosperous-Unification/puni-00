import { readFile } from 'node:fs/promises';

import { type } from 'arktype';

import { validateObservabilitySources } from './observability-source-validation';
/** Only fixed public refusal categories cross the CLI logging boundary. */
class SourceRefusal extends Error {
  constructor(
    category: 'invalid-arguments' | 'input-absent' | 'input-unreadable' | 'input-malformed',
  ) {
    super(`observability source: ${category}`);
  }
}
try {
  const arguments_ = process.argv.slice(2);
  // Proof: removing argument closure made the extra-argument CLI negative succeed with a full pinned receipt.
  if (arguments_.length !== 3 || arguments_.some((argument) => argument.trim() === ''))
    throw new SourceRefusal('invalid-arguments');
  let source: string;
  try {
    source = await readFile(arguments_[2], 'utf8');
  } catch (failure) {
    // Proof: disabling ENOENT classification changed the absent-input negative to unreadable; unreadable mode-000 input has its own permanent control.
    const fault = type({ code: 'string' })(failure);
    throw new SourceRefusal(
      !(fault instanceof type.errors) && fault.code === 'ENOENT'
        ? 'input-absent'
        : 'input-unreadable',
    );
  }
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    // Proof: replacing this refusal with a raw Error lost the fixed input-malformed diagnostic in the CLI negative.
    throw new SourceRefusal('input-malformed');
  }
  console.log(
    JSON.stringify(await validateObservabilitySources(arguments_[0], arguments_[1], input)),
  );
} catch (failure) {
  // Proof: exposing String(failure) printed PRIVATE-MARKER source paths in the source-unreadable CLI negative.
  console.error(
    failure instanceof SourceRefusal ? failure.message : 'observability source: validation-refused',
  );
  process.exit(1);
}
