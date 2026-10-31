import { assertParity, readParityInput } from './parity';

try {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 2 || arguments_[0] !== '--input')
    throw new Error('Usage: parity-cli.ts --input <json>');
  console.log(JSON.stringify(assertParity(await readParityInput(arguments_[1]))));
} catch (failure) {
  console.error(failure instanceof Error ? failure.message : String(failure));
  process.exit(1);
}
