import { assertParity } from './parity';
import { renderParityInput } from './parity-render';

try {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 2 || arguments_.some((argument) => argument.trim() === ''))
    throw new Error('Usage: parity-render-cli.ts <root> <locked-tools-directory>');
  console.log(JSON.stringify(assertParity(await renderParityInput(arguments_[0], arguments_[1]))));
} catch (failure) {
  console.error(failure instanceof Error ? failure.message : String(failure));
  process.exit(1);
}
