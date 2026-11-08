import { rejects } from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';

import { expect, test } from 'bun:test';

import { readParticipantHttp } from './dependency-participant-http';

function readPort(server: { readonly port?: number }): number {
  const port = server.port;
  if (port === undefined) throw new Error('native TCP fixture port absent');
  return port;
}

test('participant HTTP reads only its numeric bound endpoint without following redirects or leaking private failures', async () => {
  let redirected = 0;
  let stalledTimer: ReturnType<typeof setTimeout> | undefined;
  const foreign = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      redirected++;
      return new Response('PRIVATE_FOREIGN_ENDPOINT');
    },
  });
  const endpoint = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/health') return Response.json({ status: 'ok', commit: null });
      if (path === '/health/readiness')
        return new Response(null, {
          status: 302,
          headers: {
            location: `http://127.0.0.1:${String(readPort(foreign))}/health`,
            'content-type': 'application/json',
          },
        });
      if (path === '/api/runtime/dependency-capability')
        return new Response('PRIVATE_OVERSIZE'.repeat(30000), {
          headers: { 'content-type': 'application/json' },
        });
      if (path === '/src/main.tsx')
        return new Response(new Uint8Array([255]), {
          headers: { 'content-type': 'application/json' },
        });
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('PRIVATE_STALLED'));
            stalledTimer = setTimeout(() => {
              controller.close();
            }, 1500);
          },
          cancel() {
            if (stalledTimer !== undefined) clearTimeout(stalledTimer);
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    },
  });
  try {
    const health = await readParticipantHttp(
      '127.0.0.1',
      readPort(endpoint),
      '/health',
      performance.now() + 10000,
    );
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ status: 'ok', commit: null });
    await rejects(
      readParticipantHttp(
        '127.0.0.1',
        readPort(endpoint),
        '/health/readiness',
        performance.now() + 10000,
      ),
    );
    expect(redirected).toBe(0);
    for (const path of ['/api/runtime/dependency-capability', '/src/main.tsx', '/'] as const) {
      const started = performance.now();
      await rejects(
        readParticipantHttp(
          '127.0.0.1',
          readPort(endpoint),
          path,
          performance.now() + (path === '/' ? 100 : 10000),
        ),
        (cause) => {
          expect(cause).toBeInstanceOf(Error);
          if (!(cause instanceof Error)) return false;
          expect(cause.message).not.toContain('PRIVATE_');
          expect(cause.cause).toBeUndefined();
          return true;
        },
      );
      if (path === '/') expect(performance.now() - started).toBeLessThan(1000);
    }
    await rejects(
      readParticipantHttp('localhost', readPort(endpoint), '/health', performance.now() + 10000),
    );
    await rejects(
      readParticipantHttp('0.0.0.0', readPort(endpoint), '/health', performance.now() + 10000),
    );
    await rejects(readParticipantHttp('127.0.0.1', 0, '/health', performance.now() + 10000));
    await rejects(
      readParticipantHttp('127.0.0.1', readPort(endpoint), '/health', performance.now() - 1),
    );
  } finally {
    if (stalledTimer !== undefined) clearTimeout(stalledTimer);
    await Promise.all([endpoint.stop(true), foreign.stop(true)]);
  }
}, 20000);

test('participant HTTP bypasses an actual ambient proxy and reaches its selected numeric endpoint', async () => {
  let proxied = 0;
  const proxy = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      proxied++;
      return Response.json({ status: 'PRIVATE_PROXY' });
    },
  });
  const endpoint = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      return Response.json({ status: 'ok', commit: null });
    },
  });
  const module = new URL('./dependency-participant-http.ts', import.meta.url).pathname;
  const proxyUrl = `http://127.0.0.1:${String(readPort(proxy))}`;
  const endpointUrl = `http://127.0.0.1:${String(readPort(endpoint))}/health`;
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '-e',
      `const control=await(await fetch(${JSON.stringify(endpointUrl)})).text();const {readParticipantHttp}=await import(${JSON.stringify(module)});const observed=await readParticipantHttp('127.0.0.1',${String(readPort(endpoint))},'/health',performance.now()+10000);process.stdout.write(JSON.stringify({control,body:observed.body}));`,
    ],
    {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        HTTP_PROXY: proxyUrl,
        http_proxy: proxyUrl,
        HTTPS_PROXY: proxyUrl,
        https_proxy: proxyUrl,
        ALL_PROXY: proxyUrl,
        all_proxy: proxyUrl,
        NO_PROXY: '',
        no_proxy: '',
      },
    },
  );
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ stderr, code }).toEqual({ stderr: '', code: 0 });
    const report: unknown = JSON.parse(stdout);
    if (
      report === null ||
      typeof report !== 'object' ||
      !('control' in report) ||
      !('body' in report)
    )
      throw new Error('native proxy report malformed');
    expect(report.control).toBe('{"status":"PRIVATE_PROXY"}');
    expect(report.body).toBe('{"status":"ok","commit":null}');
    expect(proxied).toBe(1);
  } finally {
    child.kill('SIGKILL');
    await child.exited;
    await Promise.all([endpoint.stop(true), proxy.stop(true)]);
  }
}, 20000);

test('participant HTTP refuses a healthy-looking truncated native response', async () => {
  const sockets = new Set<Socket>();
  const failures: Error[] = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', (cause) => {
      if (!('code' in cause) || cause.code !== 'ECONNRESET') failures.push(cause);
    });
    socket.resume();
    socket.end(
      'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 200\r\nConnection: close\r\n\r\n{"status":"ok","commit":null}',
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('native truncated fixture address unavailable');
    await rejects(
      readParticipantHttp('127.0.0.1', address.port, '/health', performance.now() + 1000),
    );
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((cause) => {
        if (cause === undefined) resolve();
        else reject(cause);
      }),
    );
  }
  if (failures.length !== 0) throw new AggregateError(failures, 'native truncated fixture failed');
}, 20000);

test('participant HTTP success and ordinary refusal return only after actual request and response close', async () => {
  const endpoint = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      return Response.json(
        { status: 'ok', commit: null },
        { status: new URL(request.url).pathname === '/health' ? 200 : 503 },
      );
    },
  });
  const module = new URL('./dependency-participant-http.ts', import.meta.url).pathname;
  const program = `
    import http from 'node:http';
    import { mock } from 'bun:test';
    let dispatched=0,requestClosed=0,responseClosed=0;
    const native=http.request;
    mock.module('node:http',()=>({...http,request:(...args)=>{
      dispatched++;
      const client=native(...args);
      client.once('close',()=>requestClosed++);
      client.once('response',message=>message.once('close',()=>responseClosed++));
      return client;
    }}));
    const {readParticipantHttp}=await import(${JSON.stringify(module)});
    const lifecycle=[];
    for(const path of ['/health','/health/readiness']){
      let accepted=false;
      try{
        await readParticipantHttp('127.0.0.1',${String(readPort(endpoint))},path,performance.now()+10000);
        accepted=true;
      }catch(cause){
        if(!(cause instanceof Error)||cause.message!=='participant HTTP observation refused')throw cause;
      }
      lifecycle.push({accepted,dispatched,requestClosed,responseClosed});
    }
    process.stdout.write(JSON.stringify(lifecycle));
  `;
  const child = Bun.spawn([process.execPath, '--no-env-file', '-e', program], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ stderr, code }).toEqual({ stderr: '', code: 0 });
    const lifecycle: unknown = JSON.parse(stdout);
    expect(lifecycle).toEqual([
      { accepted: true, dispatched: 1, requestClosed: 1, responseClosed: 1 },
      { accepted: false, dispatched: 2, requestClosed: 2, responseClosed: 2 },
    ]);
  } finally {
    child.kill('SIGKILL');
    await child.exited;
    await endpoint.stop(true);
  }
}, 20000);

test('participant HTTP refuses IPv4-mapped IPv6 routing to an owned IPv4 listener', async () => {
  const endpoint = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      return Response.json({ status: 'ok', commit: null });
    },
  });
  try {
    await rejects(
      readParticipantHttp(
        '::ffff:127.0.0.1',
        readPort(endpoint),
        '/health',
        performance.now() + 10000,
      ),
    );
  } finally {
    await endpoint.stop(true);
  }
}, 20000);

for (const fault of ['missing-type', 'long-type', 'unsupported-encoding'] as const)
  test(`participant HTTP refuses native ${fault} metadata`, async () => {
    const body = '{"status":"ok","commit":null}';
    const metadata =
      fault === 'missing-type'
        ? ''
        : fault === 'long-type'
          ? `Content-Type: application/json;${'x'.repeat(1100)}\r\n`
          : 'Content-Type: application/json\r\nContent-Encoding: gzip\r\n';
    const sockets = new Set<Socket>();
    const failures: Error[] = [];
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      socket.on('error', (cause) => {
        if (!('code' in cause) || cause.code !== 'ECONNRESET') failures.push(cause);
      });
      socket.resume();
      socket.end(
        `HTTP/1.1 200 OK\r\n${metadata}Content-Length: ${String(Buffer.byteLength(body))}\r\nConnection: close\r\n\r\n${body}`,
      );
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: '127.0.0.1', port: 0 }, resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === 'string')
        throw new Error('native metadata fixture address absent');
      await rejects(
        readParticipantHttp('127.0.0.1', address.port, '/health', performance.now() + 10000),
      );
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((cause) => {
          if (cause === undefined) resolve();
          else reject(cause);
        }),
      );
    }
    if (failures.length !== 0) throw new AggregateError(failures, 'native metadata fixture failed');
  }, 20000);
