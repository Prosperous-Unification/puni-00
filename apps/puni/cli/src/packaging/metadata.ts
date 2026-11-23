import { packageVersion } from '../version';

/** Exact current local producer metadata; validators compare bytes before trusting another JSON interpretation. */
export function createPackageMetadata(bunVersion: string): Buffer {
  return serializePackageMetadata(packageVersion, bunVersion);
}

/** Historical record1 retains the exact original0.3 package metadata byte contract. */
export function createHistoricalPackageMetadata(bunVersion: string): Buffer {
  return serializePackageMetadata('0.3.0', bunVersion);
}

function serializePackageMetadata(version: '0.3.0' | '0.4.0', bunVersion: string): Buffer {
  return Buffer.from(
    JSON.stringify(
      {
        name: 'puni',
        version,
        type: 'module',
        description: 'PUNI Navigator, Burokrat and Dash',
        license: 'MIT',
        bin: { puni: 'dist/puni.mjs' },
        files: ['dist/', 'README.md', 'LICENSE', 'NOTICE'],
        engines: { bun: bunVersion },
      },
      null,
      2,
    ) + '\n',
  );
}
