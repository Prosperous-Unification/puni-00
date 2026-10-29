import type { SourceEntry, SourceStartupManifest } from './source-startup-manifest';

export type SourceFrontendProfile = 'wbs-source-frontend-wire-v1';
// These exact logical inputs select one response profile, not the complete producer closure.
const INPUTS = {
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
  'bun.lock': {
    bytes: 533044,
    sha256: 'bf54a6c6202a5d8f54f9bb8fe7e76935a8f4c667c660da720db3fd5f16391383',
  },
  'package.json': {
    bytes: 4885,
    sha256: 'bf45a6e5f8f806d2762dfb22af77375a9ad55d806781a34812812de31f07eb74',
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

function refuse(): never {
  throw new Error('source frontend input profile unsupported');
}

function readFrontendInput(
  namespace: ReadonlyMap<string, SourceEntry>,
  path: string,
): SourceEntry | undefined {
  let pending = path.split('/');
  const resolved: string[] = [];
  let links = 0;
  while (pending.length > 0) {
    const [segment, ...remaining] = pending;
    pending = remaining;
    if (segment === '..') {
      // Proof: root-escape omission accepted traversal above the shared namespace; its direct selector negative failed, then passed after restoration.
      if (resolved.length === 0) refuse();
      resolved.pop();
      continue;
    }
    const prefix = [...resolved, segment].join('/');
    const child = namespace.get(prefix);
    if (child?.kind === 'symlink') {
      // Proof: ceiling omission admitted a forty-first declared link; the selector refusal failed, then passed after restoration.
      if (++links > 40) refuse();
      // Proof: substituting the still-present good target admitted a valid changed-target original capture; its refusal failed, then passed after restoration.
      pending.unshift(...child.target.split('/'));
      continue;
    }
    const root = prefix === 'node_modules' || prefix === '.git';
    // Proof: ancestor-gate omission independently admitted missing/file ancestors before '..'; both selector negatives failed, then passed after restoration.
    if (!root && (child === undefined || (pending.length > 0 && child.kind !== 'directory')))
      refuse();
    resolved.push(segment);
  }
  return namespace.get(resolved.join('/'));
}

/** Selects only the reviewed eighteen size/hash inputs from the original already decoded canonical manifest. Private lookup follows declared relative links in its source/dependencies/git namespace, including real ancestors before '..', with the same forty-link ceiling. No live filesystem, response, version fallback or caller digest supplies expectations; this literal grants no readiness or startup authority. */
export function selectSourceFrontendProfile(
  manifest: SourceStartupManifest,
): SourceFrontendProfile {
  const namespace = new Map<string, SourceEntry>();
  for (const entry of manifest.entries) {
    const name =
      entry.root === 'source'
        ? entry.path
        : entry.root === 'dependencies'
          ? `node_modules/${entry.path}`
          : `.git/${entry.path}`;
    // Proof: namespace-gate omission admitted duplicate and synthetic-root ambiguity; both selector negatives failed, then passed after restoration.
    if (name === 'node_modules' || name === '.git' || namespace.has(name)) refuse();
    namespace.set(name, entry);
  }
  for (const [path, expected] of Object.entries(INPUTS)) {
    const entry = readFrontendInput(namespace, path);
    // Proof: tuple-gate omission admitted an independently captured changed index; original capture's refusal failed, then passed after restoration.
    if (entry?.kind !== 'file' || entry.size !== expected.bytes || entry.sha256 !== expected.sha256)
      refuse();
  }
  return 'wbs-source-frontend-wire-v1';
}
