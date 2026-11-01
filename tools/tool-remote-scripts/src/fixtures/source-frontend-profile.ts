import { createHash } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../../..');
const PINS = {
  'apps/wbs/fe-01/index.html': {
    bytes: 2482,
    sha256: '12a941b6fbccfe6530b333b9e9c59bd77d6246001e72f90f76ce3fdfbdd62ae7',
  },
  'apps/wbs/fe-01/src/main.tsx': {
    bytes: 527,
    sha256: '9da12f96ac12958e268241fe0c8c6cdd6cbcb0f56db569830af1ced291a7200e',
  },
  'apps/wbs/fe-01/vite.config.ts': {
    bytes: 19302,
    sha256: '0cd1af512952d71c83929cbff1e6ead7e8c2a80edd69ce66bfeb619df189de1b',
  },
  'apps/wbs/fe-01/project.json': {
    bytes: 8117,
    sha256: '9b28a0981a67d3d8397d60bf0eacfea15ce0d5043dceba8097e63f3cff74cc7e',
  },
  'deploy/dev-src/Dockerfile': {
    bytes: 1721,
    sha256: '431666ddc8762b08feaa201642c95df6d4b7de983d002b09d32e360161167fcc',
  },
  'deploy/dev-src/compose.yml': {
    bytes: 3762,
    sha256: '7c8d1168a38f89c4bf3390c12664d769d8d5f447041b7125ec4e99be4366b5b1',
  },
  'node_modules/vite/package.json': {
    bytes: 5093,
    sha256: '4e41dd20c7a12e7e70915b235c0bf5b5158ec6709c1390804128af0867d6d6d9',
  },
  'node_modules/vite/dist/node/chunks/node.js': {
    bytes: 1354063,
    sha256: 'f64038f08022030b77efee87b6baa81933a7b77d820aaa64bc3262fda44d80b0',
  },
  'node_modules/vite/dist/node/index.js': {
    bytes: 2670,
    sha256: 'c7ea52906f843318d7971209ce62bd24bab60590275e8f415c5564fa35cb82dc',
  },
  'node_modules/@vitejs/plugin-react/package.json': {
    bytes: 2246,
    sha256: 'c5420bbbe5ea17fec4b09d44114f9eedd774efbfcc6f9a1d6228103b590af705',
  },
  'node_modules/@vitejs/plugin-react/dist/index.js': {
    bytes: 9466,
    sha256: '843c8567286d06945301c9c5568cad44b1a2f74cd00969152cbd210c2ff07117',
  },
  'node_modules/@tailwindcss/vite/package.json': {
    bytes: 992,
    sha256: 'cba2bb8613106ca608bbd757998b2cf56a464584e3848310338fe3fe3b4761aa',
  },
  'node_modules/@tailwindcss/vite/dist/index.mjs': {
    bytes: 8351,
    sha256: 'f80662823db60a7d2060ae37bedb98ab3a5039a32f9ab88a2a0c9c39e79f4d28',
  },
  'node_modules/react/package.json': {
    bytes: 1242,
    sha256: 'e40c3ed9b633c9ecf188e09a4be309780a1ea0a9c068278a30ff6a27e7b2dbb6',
  },
  'node_modules/react-dom/package.json': {
    bytes: 3057,
    sha256: '7c82f0967114d4b5d38b1f07e543af87c9919e8d3243f9604004819319cb2200',
  },
  'node_modules/rolldown/package.json': {
    bytes: 6127,
    sha256: '4a001feffe9d32b5fb63860d4faa8725f8a4d7a13c2c37b92587234ab3d66c23',
  },
};

const PAIRS = [
  {
    epoch: 'before-ctt',
    'package.json': {
      bytes: 4885,
      sha256: 'bf45a6e5f8f806d2762dfb22af77375a9ad55d806781a34812812de31f07eb74',
    },
    'bun.lock': {
      bytes: 533044,
      sha256: 'bf54a6c6202a5d8f54f9bb8fe7e76935a8f4c667c660da720db3fd5f16391383',
    },
  },
  {
    epoch: 'ctt-0.12.0',
    'package.json': {
      bytes: 4930,
      sha256: '74ba36c471df0f1dd7ca4221a49f1dd9bab2c7feb7d022a5ff6be39a3aff0e8a',
    },
    'bun.lock': {
      bytes: 533521,
      sha256: 'e3e915704bce2282142eae1f2374cd6217f408d1fed38ae116579a4f6fb1025d',
    },
  },
];

/** Materializes only the reviewed public selection inputs in a disposable restoration artifact; this is not a complete frontend producer or private environment copy. */
export async function prepareSourceFrontendProfile(root: string): Promise<void> {
  const retained = new Map<string, Buffer>();
  for (const path of [...Object.keys(PINS), 'package.json', 'bun.lock'])
    retained.set(path, await readFile(join(ROOT, path)));
  const matches = (path: string, expected: { bytes: number; sha256: string }) => {
    const bytes = retained.get(path);
    if (bytes === undefined) throw new Error('frontend fixture retained input absent');
    return (
      bytes.byteLength === expected.bytes &&
      createHash('sha256').update(bytes).digest('hex') === expected.sha256
    );
  };
  if (
    !PAIRS.some(
      (pair) =>
        matches('package.json', pair['package.json']) && matches('bun.lock', pair['bun.lock']),
    ) ||
    !Object.entries(PINS).every(([path, expected]) => matches(path, expected))
  )
    throw new Error('frontend fixture inputs unsupported');
  for (const [path, bytes] of retained) {
    const selected = path.startsWith('node_modules/vite/')
      ? path.replace('node_modules/vite/', 'node_modules/.frontend-profile/vite/')
      : path;
    const target = join(root, selected);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  await symlink('.frontend-profile/vite', join(root, 'node_modules/vite'));
}
