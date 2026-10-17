import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { writeCompilerDerivative } from './compiler-derivative';

const directory = resolve(import.meta.dirname, '../../dist/compiler-derivative');
await mkdir(dirname(directory), { recursive: true });
await writeCompilerDerivative(directory);
