import type {
  ProductMetadataChild,
  ProductMetadataRequest,
  SpawnProductMetadata,
} from '../lib/docker-product-metadata';
import { participantActivationFixture } from './dependency-participant-restoration';

function echoChild(contents: string): ProductMetadataChild {
  const child = Bun.spawn(
    ['/usr/bin/python3', '-I', '-c', 'import sys;sys.stdout.buffer.write(sys.stdin.buffer.read())'],
    {
      stdin: new TextEncoder().encode(contents),
      stdout: 'pipe',
      stderr: 'pipe',
      killSignal: 'SIGKILL',
    },
  );
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exited: child.exited,
    kill: () => {
      child.kill('SIGKILL');
    },
  };
}

/** Explicit local child mapping for genuine-context observer negatives; top has no synthetic PID default. */
export async function productProcessFixture() {
  const fixture = await participantActivationFixture();
  const requests: ProductMetadataRequest[] = [];
  const tops = new Map<string, string>();
  let execs = 0;
  const spawnProductMetadata: SpawnProductMetadata = (request, signal) => {
    if (signal?.aborted) throw new Error('product fixture request cancelled');
    requests.push(request);
    if (request.kind === 'top') {
      const top = tops.get(request.id);
      if (top === undefined) throw new Error('product fixture actual top roster absent');
      return echoChild(top);
    }
    if (request.kind === 'container') {
      if (request.id === fixture.backend.Id) return echoChild(JSON.stringify(fixture.backend));
      if (request.id === fixture.gateway.Id) return echoChild(JSON.stringify(fixture.gateway));
      throw new Error('product fixture foreign container');
    }
    const image = fixture.images.get(request.id);
    if (image === undefined) throw new Error('product fixture foreign image');
    return echoChild(JSON.stringify([image]));
  };
  return {
    ...fixture,
    ports: {
      ...fixture.ports,
      spawnProductMetadata,
      execDocker: async (...args: Parameters<typeof fixture.ports.execDocker>) => {
        execs++;
        await fixture.ports.execDocker(...args);
      },
    },
    requests,
    execs: () => execs,
    setTop: (roster: string, id = fixture.backend.Id) => {
      tops.set(id, roster);
    },
  };
}
