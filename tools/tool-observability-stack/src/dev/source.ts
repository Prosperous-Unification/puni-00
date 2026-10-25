import { type } from 'arktype';

/** Sanitized request outcome; SSH timing is independent from the measured HTTP duration. */
export type HealthSource =
  | { kind: 'local-http-rehearsal' }
  | { kind: 'ssh-dev-container'; containerValidated: false; containerId: null }
  | { kind: 'ssh-dev-container'; containerValidated: true; containerId: string };

export interface HealthRead {
  source: HealthSource;
  success: boolean;
  revision: string | null;
  reason: string | null;
  startedAt: number;
  finishedAt: number;
  requestDurationMs: number | null;
  transportDurationMs: number | null;
}
export type HealthReader = (signal: AbortSignal) => Promise<HealthRead>;
// Proof: accepting any commit string makes actual HTTP invalid-health test fail.
const Health = type({ status: "'ok'", commit: /^[a-f0-9]{40}$/ });
const remoteEndpoint = 'http://127.0.0.1:3100/health';

/** Reads a stream incrementally; a declared Content-Length is never trusted as the bound. */
export async function readBounded(response: Response, limit: number): Promise<string> {
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      // Proof: actual oversized/chunked HTTP tests fail with this bound removed.
      if (length > limit) throw new RangeError('response-size');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

function failure(reason: string, startedAt: number, duration: number): HealthRead {
  return {
    source: { kind: 'local-http-rehearsal' },
    success: false,
    revision: null,
    reason,
    startedAt,
    finishedAt: Date.now(),
    requestDurationMs: duration,
    transportDurationMs: null,
  };
}

/** Loopback-only direct source for local launch/rehearsal; never follows redirects to another target. */
export function createHttpHealthReader(endpoint: string): HealthReader {
  const url = new URL(endpoint);
  // Proof: removing target policy makes unsafe health target tests accept credentials/non-loopback/foreign routes.
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/health' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new Error('Invalid loopback health endpoint');
  return async (signal) => {
    const startedAt = Date.now();
    const started = performance.now();
    try {
      const response = await fetch(url, { signal, redirect: 'manual' });
      const text = await readBounded(response, 4096);
      const duration = performance.now() - started;
      if (response.status !== 200) return failure('http-status', startedAt, duration);
      let health: unknown;
      try {
        health = JSON.parse(text);
      } catch (error) {
        if (error instanceof SyntaxError) return failure('malformed-health', startedAt, duration);
        throw error;
      }
      const checked = Health(health);
      if (checked instanceof type.errors) return failure('invalid-health', startedAt, duration);
      return {
        source: { kind: 'local-http-rehearsal' },
        success: true,
        revision: checked.commit,
        reason: null,
        startedAt,
        finishedAt: Date.now(),
        requestDurationMs: duration,
        transportDurationMs: null,
      };
    } catch (error) {
      if (signal.aborted) return failure('deadline', startedAt, performance.now() - started);
      if (error instanceof RangeError)
        return failure('response-size', startedAt, performance.now() - started);
      if (
        error instanceof TypeError ||
        (error instanceof Error &&
          ['ConnectionRefused', 'ECONNREFUSED', 'ConnectionClosed', 'ENOTFOUND'].includes(
            error.name,
          ))
      )
        return failure('request-unavailable', startedAt, performance.now() - started);
      throw error;
    }
  };
}

// Proof: removing the 64hex ID predicate accepts malformed Docker ID before exec.
const Inspect = type({
  Id: /^[a-f0-9]{64}$/,
  Name: "'/wbs-dev-src'",
  State: { Running: 'boolean' },
  Mounts: type({ Type: 'string', Source: 'string', Destination: 'string' }).array(),
  NetworkSettings: { Networks: 'object' },
  Config: { WorkingDir: 'string', Cmd: 'string[]' },
}).array();
const RemoteRead = type({
  success: 'boolean',
  revision: 'string | null',
  reason: 'string | null',
  startedAt: 'number',
  finishedAt: 'number',
  requestDurationMs: 'number | null',
  transportDurationMs: 'null',
});

/** Exact dev identity, checked before every request; absent/malformed Docker state throws. */
export function validateDevContainer(text: string): string {
  const inspected = Inspect.assert(JSON.parse(text));
  const container = inspected[0];
  // Proof: actual SSH fixture identity/mount/network/runtime negatives fail when this guard is removed.
  if (
    inspected.length !== 1 ||
    !container.State.Running ||
    container.Config.WorkingDir !== '/src' ||
    JSON.stringify(container.Config.Cmd) !== JSON.stringify(['bun', 'run', 'dev']) ||
    Object.keys(container.NetworkSettings.Networks).length !== 1 ||
    !Object.hasOwn(container.NetworkSettings.Networks, 'wbs-dev-net') ||
    !container.Mounts.some(
      (mount) =>
        mount.Type === 'bind' &&
        mount.Source === '/home/puni1/wbs-dev/src' &&
        mount.Destination === '/src',
    )
  )
    throw new Error('Dev container identity refused');
  return container.Id;
}

// Proof: remote size/revision/status guard mutations each fail their fixed-stdin actual HTTP test.
// A fixed stdin program: no endpoint, shell source or credential is interpolated from callers.
const healthProgram = `const startedAt=Date.now(),started=performance.now();
let success=false,revision=null,reason=null;
try {
 const response=await fetch('${remoteEndpoint}',{signal:AbortSignal.timeout(15000),redirect:'manual'});
 const reader=response.body?.getReader();if(!reader)throw new Error('invalid-health');
 let text='',length=0;const decoder=new TextDecoder();
 try {for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>4096)throw new Error('response-size');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
 if(response.status!==200)reason='http-status';
 else {let health;try{health=JSON.parse(text);}catch{throw new Error('malformed-health');}
 if(health?.status!=='ok'||typeof health.commit!=='string'||!/^[a-f0-9]{40}$/.test(health.commit))reason='invalid-health';else{success=true;revision=health.commit;}}
} catch(error){if(['response-size','malformed-health','invalid-health'].includes(error.message))reason=error.message;else if(error.name==='TimeoutError'||error.name==='AbortError')reason='deadline';else if(error instanceof TypeError)reason='request-unavailable';else throw error;}
console.log(JSON.stringify({success,revision,reason,startedAt,finishedAt:Date.now(),requestDurationMs:performance.now()-started,transportDurationMs:null}));`;

/** Finite, capped subprocess capture; cancellation kills the SSH process and closes its pipes. */
export async function executeBounded(
  command: string[],
  stdin: string,
  signal: AbortSignal,
): Promise<{ exitCode: number; stdout: string }> {
  signal.throwIfAborted();
  const child = Bun.spawn(command, {
    stdin: new TextEncoder().encode(stdin),
    stdout: 'pipe',
    stderr: 'ignore',
  });
  // Proof: blocked actual SSH fixture is killed at the deadline and its PID no longer exists.
  const kill = () => {
    child.kill();
  };
  signal.addEventListener('abort', kill, { once: true });
  try {
    const stdout = await readBounded(new Response(child.stdout), 32768);
    const exitCode = await child.exited;
    signal.throwIfAborted();
    return { exitCode, stdout };
  } finally {
    signal.removeEventListener('abort', kill);
    if (child.exitCode === null) child.kill();
  }
}

/** Existing authenticated SSH only; fixed host/container/argv never falls back to a different source. */
export function createSshHealthReader(sshExecutable = 'ssh'): HealthReader {
  const prefix = createDevDockerCommand(sshExecutable);
  return async (signal) => {
    const started = performance.now();
    const startedAt = Date.now();
    let containerId: string | null = null;
    const source = (): HealthSource =>
      containerId === null
        ? { kind: 'ssh-dev-container', containerValidated: false, containerId: null }
        : { kind: 'ssh-dev-container', containerValidated: true, containerId };
    try {
      const inspected = await executeBounded([...prefix, 'inspect', 'wbs-dev-src'], '', signal);
      if (inspected.exitCode !== 0)
        return {
          ...failure('source-unavailable', startedAt, 0),
          source: source(),
          requestDurationMs: null,
          transportDurationMs: performance.now() - started,
        };
      containerId = validateDevContainer(inspected.stdout);
      const measured = await executeBounded(
        // Proof: using the name here makes the actual recreation fixture read a foreign revision.
        [...prefix, 'exec', '-i', containerId, 'bun', 'run', '-'],
        healthProgram,
        signal,
      );
      if (measured.exitCode !== 0)
        return {
          ...failure('source-unavailable', startedAt, 0),
          source: source(),
          requestDurationMs: null,
          transportDurationMs: performance.now() - started,
        };
      const reading = RemoteRead.assert(JSON.parse(measured.stdout));
      if (
        (reading.success &&
          (reading.revision === null ||
            !/^[a-f0-9]{40}$/.test(reading.revision) ||
            reading.reason !== null)) ||
        (!reading.success &&
          (reading.revision !== null ||
            ![
              'http-status',
              'invalid-health',
              'malformed-health',
              'response-size',
              'deadline',
              'request-unavailable',
            ].includes(reading.reason ?? '')))
      )
        throw new Error('Invalid source measurement');
      return {
        ...reading,
        source: source(),
        transportDurationMs: performance.now() - started,
      };
    } catch (error) {
      if (signal.aborted)
        return {
          ...failure('deadline', startedAt, 0),
          source: source(),
          requestDurationMs: null,
          transportDurationMs: performance.now() - started,
        };
      throw error;
    }
  };
}

/** Existing fixed SSH/Docker read path shared by health and bounded application logs. */
export function createDevDockerCommand(sshExecutable = 'ssh'): string[] {
  return [
    sshExecutable,
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=5',
    'h2puni',
    'sudo',
    '-n',
    'docker',
  ];
}
