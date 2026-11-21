import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { scratchAsync } from '@tools/test-scratch';

const clusterId = 'platform-local';
const bucket = 'puni-cold-restore-fixture';
const publicationPrefix = `${clusterId}/captures/`;
const captureId = 'fixture-capture';
const snapshotKey = `${clusterId}/snapshot.db`;
const snapshotVersion = 'snapshot-v1';
const substitutedVersion = 'snapshot-v2';
const evidenceKey = `${publicationPrefix}${captureId}/membership.json`;
const evidenceVersion = 'evidence-v1';
const readerId = 'fixture-cold-restore-reader';
const plainSnapshot = Buffer.from('fixed snapshot bytes shared by two immutable versions');
const machineId = 'f'.repeat(32);
const allocation = 'qemu:70d824af-bc65-42ce-a20a-a15b8606a86b';
const providerBody = 'fixture provider response body';

const memberId = '18446744073709551615';
const memberName = 'h4claw-37a00c01';
const member = { memberId, memberName, isLearner: false };
const witness = {
  etcdClusterId: '21',
  memberId,
  leaderId: memberId,
  peerSha256: 'd'.repeat(64),
  term: '3',
  committedIndex: '83',
  appliedIndex: '83',
};

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function objectResponse(version: string, body: string | Uint8Array, encoding?: 'gzip'): Response {
  const bytes = Buffer.from(body);
  return new Response(bytes, {
    headers: {
      'content-length': String(bytes.byteLength),
      'x-amz-version-id': version,
      ...(encoding === undefined ? {} : { 'content-encoding': encoding }),
    },
  });
}

function issueCertificate(keyPath: string, certificatePath: string): void {
  execFileSync(
    '/usr/bin/openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ed25519',
      '-noenc',
      '-days',
      '1',
      '-subj',
      '/CN=Cold restore test store',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      keyPath,
      '-out',
      certificatePath,
    ],
    { timeout: 5000, stdio: 'pipe' },
  );
}

type RecorderScenario =
  | 'matching'
  | 'version-substitution'
  | 'advanced-index'
  | 'encoded-snapshot'
  | 'hcloud-provider'
  | 'machine-derived-provider'
  | 'malformed-qemu-provider'
  | 'malformed-hcloud-provider'
  | 'missing-publication'
  | 'denied-publication'
  | 'untrusted-publication';

export function matchingRecorderInputs(directory: string) {
  return {
    clusterId,
    k3sVersion: 'v1.36.4+k3s1',
    sourceRevision: 'c'.repeat(40),
    snapshotPath: join(directory, 'snapshot'),
    objectKey: snapshotKey,
    objectVersion: snapshotVersion,
    captureId,
    tokenPath: join(directory, 'token'),
    sopsIdentityPath: join(directory, 'identity'),
    storesPath: join(directory, 'stores.json'),
  };
}

/** Exercise the ordinary recorder command with a separately published HTTPS fixture store. */
export async function runRecorderFixture(
  scenario: RecorderScenario,
  escrow: { token: string; identity: string },
  faultPath?: 'direct' | 'cli',
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  evidenceSha256: string;
  snapshotReads: readonly string[];
  sidecarReads: readonly string[];
  publicationStatuses: readonly number[];
  httpRequests: number;
  sdkFaultReceipt: string;
  storedSnapshot: { sha256: string; bytes: number };
}> {
  const directory = await scratchAsync('cold-restore-recorder-');
  const enrollment = join(directory, 'controller');
  await mkdir(enrollment, { mode: 0o700 });
  const keyPath = join(directory, 'fixture-key.pem');
  const certificatePath = join(enrollment, 'fixture-ca.pem');
  issueCertificate(keyPath, certificatePath);
  if (scenario === 'untrusted-publication') {
    const wrongCa = join(enrollment, 'wrong-ca.pem');
    issueCertificate(join(directory, 'wrong-key.pem'), wrongCa);
    await chmod(wrongCa, 0o644);
  }

  const encoding = scenario === 'encoded-snapshot' ? 'gzip' : undefined;
  const snapshot = encoding === 'gzip' ? gzipSync(plainSnapshot) : plainSnapshot;
  const storedSnapshot = { sha256: sha256(snapshot), bytes: snapshot.byteLength };
  const providerLabels: Partial<Record<RecorderScenario, string>> = {
    'hcloud-provider': 'hcloud:9007199254740993',
    'machine-derived-provider': `ssh:${machineId}`,
    'malformed-qemu-provider': 'qemu:70d824af-bc65-12ce-a20a-a15b8606a86b',
    'malformed-hcloud-provider': 'hcloud:09007199254740993',
  };
  const providerIdentity = providerLabels[scenario] ?? allocation;
  const evidence = JSON.stringify({
    schemaVersion: 2,
    clusterId,
    snapshot: {
      bucket,
      objectKey: snapshotKey,
      versionId: snapshotVersion,
      ...storedSnapshot,
    },
    witness: {
      before: witness,
      afterFirstChunk:
        scenario === 'advanced-index'
          ? { ...witness, committedIndex: '84', appliedIndex: '84' }
          : witness,
    },
    members: [member],
    mappings: [
      {
        memberId,
        memberName,
        nodeName: 'h4claw',
        nodeUid: '76861c62-3e25-4d79-9b09-b98b111bd1ef',
        machineId,
        providerIdentity,
      },
    ],
  });
  const evidenceSha256 = sha256(evidence);
  const publication = JSON.stringify({
    schemaVersion: 1,
    clusterId,
    captureId,
    sidecar: { objectKey: evidenceKey, versionId: evidenceVersion, sha256: evidenceSha256 },
  });
  const snapshotReads: string[] = [];
  const sidecarReads: string[] = [];
  const publicationStatuses: number[] = [];
  let httpRequests = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    tls: {
      cert: Bun.file(certificatePath),
      key: Bun.file(keyPath),
    },
    fetch(request) {
      httpRequests++;
      const { pathname, searchParams } = new URL(request.url);
      if (
        request.method !== 'GET' ||
        !request.headers.get('authorization')?.includes(`Credential=${readerId}/`)
      )
        return new Response(null, { status: 403 });
      const objectVersion = searchParams.get('versionId');
      if (
        pathname === `/${bucket}/${publicationPrefix}${captureId}/publication.json` &&
        objectVersion === null
      ) {
        const status =
          scenario === 'missing-publication' ? 404 : scenario === 'denied-publication' ? 403 : 200;
        publicationStatuses.push(status);
        if (status !== 200) return new Response(providerBody, { status });
        return objectResponse('publication-v1', publication);
      }
      if (pathname === `/${bucket}/${evidenceKey}` && objectVersion === evidenceVersion) {
        sidecarReads.push(objectVersion);
        return objectResponse(evidenceVersion, evidence);
      }
      if (
        pathname === `/${bucket}/${snapshotKey}` &&
        (objectVersion === snapshotVersion || objectVersion === substitutedVersion)
      ) {
        snapshotReads.push(objectVersion);
        return objectResponse(objectVersion, snapshot, encoding);
      }
      return new Response(null, { status: 404 });
    },
  });
  try {
    const config = {
      schemaVersion: 1,
      clusterId,
      endpoint: server.url.origin,
      bucket,
      publicationPrefix,
      region: 'us-east-1',
      caFile:
        scenario === 'untrusted-publication'
          ? '/etc/puni/wrong-ca.pem'
          : '/etc/puni/fixture-ca.pem',
      credentialsFile: '/etc/puni/cold-restore-credentials.json',
    };
    const reader = join(enrollment, 'cold-restore-reader.json');
    await writeFile(reader, JSON.stringify(config), { mode: 0o644 });
    await chmod(reader, 0o644);
    await chmod(certificatePath, 0o644);
    await writeFile(
      join(enrollment, 'cold-restore-credentials.json'),
      JSON.stringify({ accessKeyId: readerId, secretAccessKey: 'fixture-only-key' }),
      { mode: 0o600 },
    );
    await writeFile(join(directory, 'token'), escrow.token, { mode: 0o600 });
    await writeFile(join(directory, 'identity'), escrow.identity, { mode: 0o600 });
    await writeFile(join(directory, 'snapshot'), snapshot);
    await writeFile(join(directory, 'stores.json'), '[]');

    const faultReceipt = join(directory, 'sdk-fault-receipt');
    if (faultPath !== undefined) await writeFile(faultReceipt, '', { mode: 0o600 });

    const recorderArgs = [
      join(import.meta.dir, 'recover.ts'),
      'record-manifest',
      '--cluster',
      clusterId,
      '--source-revision',
      'c'.repeat(40),
      '--snapshot',
      join(directory, 'snapshot'),
      '--object-key',
      snapshotKey,
      '--object-version',
      scenario === 'version-substitution' ? substitutedVersion : snapshotVersion,
      '--token-file',
      join(directory, 'token'),
      '--sops-age-key-file',
      join(directory, 'identity'),
      '--stores',
      join(directory, 'stores.json'),
      '--membership-evidence',
      captureId,
    ];
    const child = Bun.spawn(
      [
        '/usr/bin/bwrap',
        '--die-with-parent',
        '--unshare-user',
        '--unshare-pid',
        '--uid',
        '0',
        '--gid',
        '0',
        '--ro-bind',
        '/',
        '/',
        '--dev',
        '/dev',
        '--proc',
        '/proc',
        '--tmpfs',
        '/etc',
        '--ro-bind',
        enrollment,
        '/etc/puni',
        '--clearenv',
        ...(faultPath === undefined
          ? []
          : [
              '--bind',
              faultReceipt,
              faultReceipt,
              '--setenv',
              'F10_TEST_FAULT_RECEIPT',
              faultReceipt,
            ]),
        '--',
        process.execPath,
        ...(faultPath === undefined
          ? []
          : [
              '--no-install',
              '--no-env-file',
              '--no-macros',
              '--preload',
              join(import.meta.dir, 'cold-restore-cause.preload.ts'),
            ]),
        ...(faultPath === 'direct'
          ? [join(import.meta.dir, 'cold-restore-cause.direct.ts'), directory]
          : recorderArgs),
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 10_000 },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return {
      exitCode,
      stdout,
      stderr,
      evidenceSha256,
      snapshotReads,
      sidecarReads,
      publicationStatuses,
      httpRequests,
      sdkFaultReceipt: faultPath === undefined ? '' : await readFile(faultReceipt, 'utf8'),
      storedSnapshot,
    };
  } finally {
    await server.stop(true);
  }
}
