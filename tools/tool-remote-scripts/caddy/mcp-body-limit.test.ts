import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, join } from 'node:path';

import { renderTemplate, siteCaddyTmpl } from '@tools/compose';
import { scratchSync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { siteContext } from '../src/lib/site';
import { CADDY_IMAGE } from './image';

const candidate = readFileSync(
  join(import.meta.dir, '../../../deploy/compose/site-dev.caddy.candidate'),
  'utf8',
);
const rendered = renderTemplate(
  siteCaddyTmpl,
  siteContext({ be: 'green', gw: 'blue', fe: 'green' }, 'dev.wbs.bulletpoints.club', true),
);

async function reservePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  if (address === null || typeof address === 'string') throw new Error('no TCP test address');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    listener.close((failure) => {
      if (failure === undefined) resolve();
      else reject(failure);
    }),
  );
  return port;
}

function notesRequest(bytes: number): string {
  const call = (notes: string) =>
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'syntheticUpdateNotes', arguments: { notes } },
    });
  const overhead = Buffer.byteLength(call(''));
  const body = call('n'.repeat(bytes - overhead));
  expect(Buffer.byteLength(body)).toBe(bytes);
  return body;
}

for (const [configuration, source] of [
  ['candidate', candidate],
  ['swap-rendered', rendered],
] as const) {
  describe(`${configuration} through real Caddy`, () => {
    it('enforces resource and anonymous boundaries without rejected upstream writes', async () => {
      const writes: { path: string; bytes: number; source: string | null }[] = [];
      const upstream = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        maxRequestBodySize: 8 * 1024 * 1024,
        async fetch(request) {
          const body = await request.text();
          JSON.parse(body);
          writes.push({
            path: new URL(request.url).pathname,
            bytes: Buffer.byteLength(body),
            source: request.headers.get('x-forwarded-for'),
          });
          return Response.json({ accepted: true });
        },
      });
      const port = await reservePort();
      const scratch = scratchSync('mcp-caddy-');
      const configurationPath = join(scratch, 'Caddyfile');
      // Only replace deployment addresses and the shared logging snippet. Route
      // handlers, limits, source overwrite, discovery, and ordering are untouched.
      // Trust loopback in this disposable server to exercise the documented
      // invariant even if trusted_proxies is later enabled on the public edge.
      // Proof: removing header_up forwarded the spoofed hop and failed both suites.
      writeFileSync(
        configurationPath,
        '{\n admin off\n auto_https off\n servers {\n trusted_proxies static 127.0.0.1/32\n }\n}\n(access-log) {\n log {\n output discard\n }\n}\n' +
          source
            .replace('dev.wbs.bulletpoints.club {', `http://127.0.0.1:${String(port)} {`)
            .replaceAll('wbs-dev-src:3300', `127.0.0.1:${String(upstream.port)}`),
      );
      const binary = process.env['MCP_CADDY_BINARY'];
      const container = `mcp-body-limit-${basename(scratch)}`;
      const command =
        binary === undefined
          ? [
              'docker',
              'run',
              '--rm',
              '--name',
              container,
              '--network=host',
              '--volume',
              `${scratch}:/test:ro`,
              CADDY_IMAGE,
              'caddy',
              'run',
              '--config',
              '/test/Caddyfile',
            ]
          : [binary, 'run', '--config', configurationPath];
      const caddy = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
      const logs = new Response(caddy.stderr).text();
      const stopCaddy = async () => {
        if (binary === undefined && caddy.exitCode === null) {
          const stop = Bun.spawn(['docker', 'stop', '--time=1', container], {
            stdout: 'pipe',
            stderr: 'pipe',
          });
          if ((await stop.exited) !== 0) {
            throw new Error(`cannot stop test Caddy: ${await new Response(stop.stderr).text()}`);
          }
        } else if (caddy.exitCode === null) {
          caddy.kill();
        }
        await caddy.exited;
      };
      try {
        let ready = false;
        for (let attempt = 0; attempt < 200; attempt++) {
          if (caddy.exitCode !== null) throw new Error(`Caddy exited: ${await logs}`);
          try {
            await fetch(`http://127.0.0.1:${String(port)}/ready`);
            ready = true;
            break;
          } catch (failure) {
            if (!(failure instanceof TypeError)) throw failure;
            await Bun.sleep(50);
          }
        }
        if (!ready) throw new Error('Caddy did not become ready within 10 seconds');
        const send = (path: string, body: string) =>
          fetch(`http://127.0.0.1:${String(port)}${path}`, {
            method: 'POST',
            headers: {
              authorization: 'Bearer synthetic-authenticated-call',
              'content-type': 'application/json',
              'x-forwarded-for': '203.0.113.123',
            },
            body,
          });
        const accept = async (path: string, body: string) => {
          const before = writes.length;
          const response = await send(path, body);
          expect(response.status).toBe(200);
          await response.text();
          expect(writes.length).toBe(before + 1);
          expect(writes.at(-1)).toEqual({
            path,
            bytes: Buffer.byteLength(body),
            source: '127.0.0.1',
          });
        };
        const refuse = async (path: string, bytes: number) => {
          const before = structuredClone(writes);
          const response = await send(path, notesRequest(bytes));
          expect(response.status).toBe(413);
          await response.text();
          expect(writes).toEqual(before);
        };
        // Synthetic equivalent of a notes update: 62,467 note UTF-8 bytes,
        // with JSON escaping making the complete serialized body 125,046 bytes.
        const escapedNotes = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'syntheticUpdateNotes', arguments: { notes: '\n'.repeat(62_467) } },
        });
        expect(Buffer.byteLength(escapedNotes)).toBeGreaterThan(64_000);
        console.log(
          `${configuration}: synthetic note=62467 bytes; on-wire JSON=${String(Buffer.byteLength(escapedNotes))} bytes`,
        );
        await accept('/mcp', escapedNotes);
        await accept('/mcp', notesRequest(4_194_304));
        await refuse('/mcp', 4_194_305);
        for (const path of ['/mcp/oauth/register', '/mcp/oauth/token', '/mcp/', '/mcpx']) {
          await accept(path, notesRequest(64_000));
          await refuse(path, 64_001);
        }
      } finally {
        try {
          await stopCaddy();
        } finally {
          await upstream.stop(true);
        }
      }
    }, 30_000);
  });
}
