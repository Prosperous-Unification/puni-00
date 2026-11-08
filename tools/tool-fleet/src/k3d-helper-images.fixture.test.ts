export const selectedHelpers = {
  provider: 'k3d',
  version: 'v5.9.0',
  sourceRevision: '15dd1e2dbd62c53ed990fce9b7332335e8cb053c',
  serverlb: {
    name: 'ghcr.io/k3d-io/k3d-proxy',
    indexDigest: 'sha256:7be40abfeb6ac9a81d0d4157a7cbf3aacc68a64a1780ca2efb160f1aea915177',
    manifestDigest: 'sha256:9181bb55f3c04c86510af3526dda86baa9abc389ef988a3c4bb4879b32d8c21c',
    configDigest: 'sha256:403bc5ae35461509e3e08ee334645f37df3fdc9b391ee924fe533fc6b911ced1',
    os: 'linux',
    arch: 'amd64',
  },
  tools: {
    name: 'ghcr.io/k3d-io/k3d-tools',
    indexDigest: 'sha256:c57abce697e66feeb826922718738fe186b47779312d49d4e51e6fb9b8a6f34d',
    manifestDigest: 'sha256:f18c1e21aba123fe6ff315c514a0feffc005f587aa3db773e89489c2118842dd',
    configDigest: 'sha256:1931b29061730f9c55dca0b88407d914e8794535a11ac0cc492b79b6d2bd9710',
    os: 'linux',
    arch: 'amd64',
  },
} as const;
