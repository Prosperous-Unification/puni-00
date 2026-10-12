import { createHash, sign } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Creates synthetic signing material; see [fixture provenance](./review-authentication.fixture.md). Its CA and claims are never production GitHub evidence. */
export function createTestOwnedReviewAttestation(
  manifest: Buffer,
  predicate: unknown,
  options: {
    readonly signer?: string;
    readonly issuer?: string;
    readonly signerDigest?: string;
    readonly sourceCommitSha?: string;
    readonly sourceRef?: string;
    readonly runnerEnvironment?: string;
    readonly ownerId?: number;
    readonly repositoryId?: number;
    readonly runUri?: string;
  } = {},
): {
  readonly directory: string;
  readonly manifestBytes: string;
  readonly bundleBytes: string;
  readonly trustedRootPath: string;
  readonly signer: string;
  readonly sourceCommitSha: string;
  readonly signerDigest: string;
  readonly dispose: () => void;
} {
  const directory = mkdtempSync(join(tmpdir(), 'test-owned-gh-review-'));
  chmodSync(directory, 0o700);
  try {
    function path(name: string): string {
      return join(directory, name);
    }
    function put(name: string, bytes: string | Buffer): void {
      writeFileSync(path(name), bytes, { mode: 0o600 });
    }
    function run(...args: string[]): void {
      const completed = Bun.spawnSync(args, {
        cwd: directory,
        env: {},
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (completed.exitCode !== 0)
        throw new Error(`${args.join(' ')}: ${new TextDecoder().decode(completed.stderr)}`);
    }
    const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    put('manifest.json', manifest);
    put(
      'ca.cnf',
      `[req]\ndistinguished_name=dn\nx509_extensions=v3_ca\nprompt=no\n[dn]\nO=GitHub, Inc.\nCN=Test Fulcio CA\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n`,
    );
    run('openssl', 'ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key');
    run(
      'openssl',
      'req',
      '-x509',
      '-new',
      '-sha256',
      '-key',
      'ca.key',
      '-days',
      '365',
      '-config',
      'ca.cnf',
      '-out',
      'ca.pem',
    );
    const signer =
      options.signer ??
      'https://github.com/test-owner/test-repo/.github/workflows/review.yml@refs/heads/main';
    const source = options.sourceCommitSha ?? 'b'.repeat(40);
    const revision = options.signerDigest ?? 'c'.repeat(40);
    const sourceRef = options.sourceRef ?? 'refs/heads/main';
    const issuer = options.issuer ?? 'https://token.actions.githubusercontent.com';
    const runner = options.runnerEnvironment ?? 'github-hosted';
    const runUri =
      options.runUri ?? 'https://github.com/test-owner/test-repo/actions/runs/44/attempts/1';
    const ownerId = options.ownerId ?? 11;
    const repositoryId = options.repositoryId ?? 22;
    put(
      'leaf.cnf',
      `[leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=codeSigning\nsubjectAltName=URI:${signer}\n1.3.6.1.4.1.57264.1.8=ASN1:UTF8String:${issuer}\n1.3.6.1.4.1.57264.1.9=ASN1:UTF8String:${signer}\n1.3.6.1.4.1.57264.1.10=ASN1:UTF8String:${revision}\n1.3.6.1.4.1.57264.1.11=ASN1:UTF8String:${runner}\n1.3.6.1.4.1.57264.1.12=ASN1:UTF8String:https://github.com/test-owner/test-repo\n1.3.6.1.4.1.57264.1.13=ASN1:UTF8String:${source}\n1.3.6.1.4.1.57264.1.14=ASN1:UTF8String:${sourceRef}\n1.3.6.1.4.1.57264.1.15=ASN1:UTF8String:${String(repositoryId)}\n1.3.6.1.4.1.57264.1.16=ASN1:UTF8String:https://github.com/test-owner\n1.3.6.1.4.1.57264.1.17=ASN1:UTF8String:${String(ownerId)}\n1.3.6.1.4.1.57264.1.18=ASN1:UTF8String:${signer}\n1.3.6.1.4.1.57264.1.19=ASN1:UTF8String:${revision}\n1.3.6.1.4.1.57264.1.20=ASN1:UTF8String:workflow_dispatch\n1.3.6.1.4.1.57264.1.21=ASN1:UTF8String:${runUri}\n`,
    );
    run('openssl', 'ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'leaf.key');
    run(
      'openssl',
      'req',
      '-new',
      '-sha256',
      '-key',
      'leaf.key',
      '-subj',
      '/CN=Test signing leaf',
      '-out',
      'leaf.csr',
    );
    run(
      'openssl',
      'x509',
      '-req',
      '-sha256',
      '-in',
      'leaf.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-set_serial',
      '2',
      '-days',
      '1',
      '-extfile',
      'leaf.cnf',
      '-extensions',
      'leaf',
      '-out',
      'leaf.pem',
    );
    run('openssl', 'x509', '-in', 'leaf.pem', '-outform', 'DER', '-out', 'leaf.der');
    run('openssl', 'x509', '-in', 'ca.pem', '-outform', 'DER', '-out', 'ca.der');
    put(
      'tsa.cnf',
      `[tsa_leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,timeStamping\n[tsa]\ndefault_tsa=tsa_config\n[tsa_config]\nserial=tsa.serial\ncrypto_device=builtin\nsigner_cert=tsa.pem\ncerts=ca.pem\nsigner_key=tsa.key\nsigner_digest=sha256\ndefault_policy=1.3.6.1.4.1.57264.1.100\ndigests=sha256\naccuracy=secs:1\nordering=yes\ntsa_name=yes\ness_cert_id_chain=no\n`,
    );
    run('openssl', 'ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'tsa.key');
    run(
      'openssl',
      'req',
      '-new',
      '-sha256',
      '-key',
      'tsa.key',
      '-subj',
      '/O=Test TSA/CN=Test TSA leaf',
      '-out',
      'tsa.csr',
    );
    run(
      'openssl',
      'x509',
      '-req',
      '-sha256',
      '-in',
      'tsa.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-set_serial',
      '3',
      '-days',
      '365',
      '-extfile',
      'tsa.cnf',
      '-extensions',
      'tsa_leaf',
      '-out',
      'tsa.pem',
    );
    run('openssl', 'x509', '-in', 'tsa.pem', '-outform', 'DER', '-out', 'tsa.der');
    put('tsa.serial', '01\n');
    const statement = Buffer.from(
      JSON.stringify({
        _type: 'https://in-toto.io/Statement/v1',
        subject: [{ name: 'manifest.json', digest: { sha256: digest(manifest) } }],
        predicateType: 'https://example.org/review-predicate/v1',
        predicate,
      }),
    );
    const payloadType = 'application/vnd.in-toto+json';
    const pae = Buffer.concat([
      Buffer.from(
        `DSSEv1 ${String(Buffer.byteLength(payloadType))} ${payloadType} ${String(statement.byteLength)} `,
      ),
      statement,
    ]);
    const signature = sign('sha256', pae, readFileSync(path('leaf.key')));
    put('signature.bin', signature);
    run(
      'openssl',
      'ts',
      '-query',
      '-data',
      'signature.bin',
      '-sha256',
      '-cert',
      '-out',
      'request.tsq',
    );
    run(
      'openssl',
      'ts',
      '-reply',
      '-queryfile',
      'request.tsq',
      '-config',
      'tsa.cnf',
      '-out',
      'timestamp.tsr',
    );
    const certificate = readFileSync(path('leaf.der')).toString('base64');
    const root = readFileSync(path('ca.der')).toString('base64');
    const tsa = readFileSync(path('tsa.der')).toString('base64');
    const timestamp = readFileSync(path('timestamp.tsr')).toString('base64');
    const bundle = {
      mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
      verificationMaterial: {
        certificate: { rawBytes: certificate },
        timestampVerificationData: { rfc3161Timestamps: [{ signedTimestamp: timestamp }] },
      },
      dsseEnvelope: {
        payloadType,
        payload: statement.toString('base64'),
        signatures: [{ sig: signature.toString('base64') }],
      },
    };
    put('bundle.json', JSON.stringify(bundle));
    const validFor = { start: '2020-01-01T00:00:00Z', end: '2035-01-01T00:00:00Z' };
    const trustedRoot = {
      mediaType: 'application/vnd.dev.sigstore.trustedroot+json;version=0.1',
      tlogs: [],
      ctlogs: [],
      certificateAuthorities: [
        {
          subject: { organization: 'GitHub, Inc.', commonName: 'Test Fulcio CA' },
          uri: 'https://test.invalid/ca',
          certChain: { certificates: [{ rawBytes: root }] },
          validFor,
        },
      ],
      timestampAuthorities: [
        {
          subject: { organization: 'Test TSA', commonName: 'Test TSA leaf' },
          uri: 'https://test.invalid/tsa',
          certChain: { certificates: [{ rawBytes: tsa }, { rawBytes: root }] },
          validFor,
        },
      ],
    };
    put('trusted_root.jsonl', JSON.stringify(trustedRoot) + '\n');
    return {
      directory,
      manifestBytes: manifest.toString('utf8'),
      bundleBytes: JSON.stringify(bundle),
      trustedRootPath: path('trusted_root.jsonl'),
      signer,
      sourceCommitSha: source,
      signerDigest: revision,
      dispose: () => {
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (cause) {
    rmSync(directory, { recursive: true, force: true });
    throw cause;
  }
}
