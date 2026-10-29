import { chmod, lstat, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Proof: ACK/EOF omissions emitted ordinary REAPED; removing the five-second lifetime reached the independent seven-second SIGKILL watchdog. All three owned-peer negatives failed.
const PEER = `#!/usr/bin/python3 -I
import os,re,signal,stat,sys
signal.setitimer(signal.ITIMER_REAL,5)
if len(sys.argv)!=5 or sys.argv[1]!='--' or re.fullmatch('[A-Za-z0-9-]{1,64}',sys.argv[2]) is None:sys.exit(75)
nonce,receipt,path=sys.argv[2:]
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
try:os.write(fd,str(os.getpid()).encode())
finally:os.close(fd)
fd=os.open(receipt,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
    metadata=os.fstat(fd)
    if not stat.S_ISREG(metadata.st_mode) or not 0<metadata.st_size<=32*1024*1024:sys.exit(75)
    body=os.read(fd,32*1024*1024+1)
    if len(body)!=metadata.st_size:sys.exit(75)
finally:os.close(fd)
sys.stdout.buffer.write(body);sys.stdout.buffer.flush()
if sys.stdin.buffer.readline(129)!=('ACK '+nonce+'\\n').encode():sys.exit(77)
if sys.stdin.buffer.read(1)!=b'':sys.exit(78)
sys.stdout.buffer.write(('REAPED\\0'+nonce+'\\0').encode());sys.stdout.buffer.flush()
`;

/** Fixed local test peer: one owned process, bounded receipt/ACK, mandatory input EOF and a five-second independent lifetime; never executes Docker or another child. */
export async function createReadinessByteTransportFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'readiness-byte-cli-'));
  const path = join(directory, 'docker');
  await Bun.write(path, PEER);
  await chmod(path, 0o700);
  const identity = await lstat(path, { bigint: true });
  return {
    directory,
    environment: {
      ...process.env,
      PATH: `${directory}:/usr/bin:/bin`,
      READINESS_MODEL_DOCKER: path,
      READINESS_MODEL_DOCKER_IDENTITY: `${String(identity.dev)}:${String(identity.ino)}`,
    },
  };
}

/** Requires the exact owned fixed peer at child startup before invoking the production streaming transport. */
export async function assertReadinessByteTransportFixture(): Promise<void> {
  const path = process.env['READINESS_MODEL_DOCKER'];
  const expected = process.env['READINESS_MODEL_DOCKER_IDENTITY'];
  if (path === undefined || expected === undefined || Bun.which('docker') !== path)
    throw new Error('local readiness byte peer absent or misresolved');
  const identity = await lstat(path, { bigint: true });
  const uid = process.getuid?.();
  // Proof: omitting private mode admitted the exact owned peer at mode0755 and dispatched it; its startup-mapping negative failed on exit0.
  if (
    uid === undefined ||
    !identity.isFile() ||
    identity.uid !== BigInt(uid) ||
    (identity.mode & 0o777n) !== 0o700n ||
    `${String(identity.dev)}:${String(identity.ino)}` !== expected ||
    (await realpath(path)) !== path ||
    (await readFile(path, 'utf8')) !== PEER
  )
    throw new Error('local readiness byte peer identity or content changed');
}
