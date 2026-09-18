/**
 * A read-only Git smart-HTTP server for lab Flux sources: `git http-backend` behind Bun, serving
 * every bare repository under `root`. Pushes are refused (`receive-pack` is never enabled);
 * the lab moves branches through the filesystem path, as the coordinator's deploy clone does.
 */
export interface GitHttpServer {
  readonly port: number;
  stop(): Promise<void>;
}

/** CGI response: header lines, a blank line, then the body. */
function splitCgi(output: Uint8Array): { status: number; headers: Headers; body: Uint8Array } {
  const text = new TextDecoder('latin1').decode(output);
  const crlf = text.indexOf('\r\n\r\n');
  const lf = text.indexOf('\n\n');
  let headerEnd: number;
  let bodyStart: number;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) {
    headerEnd = crlf;
    bodyStart = crlf + 4;
  } else if (lf !== -1) {
    headerEnd = lf;
    bodyStart = lf + 2;
  } else {
    throw new Error('git http-backend printed no header block');
  }
  const headers = new Headers();
  let status = 200;
  for (const line of text.slice(0, headerEnd).split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    const name = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (name.toLowerCase() === 'status') status = Number(value.split(' ')[0]);
    else headers.set(name, value);
  }
  return { status, headers, body: output.slice(bodyStart) };
}

export function serveGitHttp(root: string, hostname: string): GitHttpServer {
  const server = Bun.serve({
    hostname,
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (
        url.searchParams.get('service') === 'git-receive-pack' ||
        url.pathname.endsWith('/git-receive-pack')
      ) {
        return new Response('read-only', { status: 403 });
      }
      const body = new Uint8Array(await request.arrayBuffer());
      const child = Bun.spawn({
        cmd: ['git', 'http-backend'],
        env: {
          PATH: process.env['PATH'] ?? '/usr/bin:/bin',
          GIT_PROJECT_ROOT: root,
          GIT_HTTP_EXPORT_ALL: '1',
          REQUEST_METHOD: request.method,
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.slice(1),
          CONTENT_TYPE: request.headers.get('content-type') ?? '',
          CONTENT_LENGTH: String(body.length),
          GIT_PROTOCOL: request.headers.get('git-protocol') ?? '',
          REMOTE_ADDR: '127.0.0.1',
        },
        stdin: body,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [output, exitCode] = await Promise.all([
        new Response(child.stdout).arrayBuffer(),
        child.exited,
      ]);
      if (exitCode !== 0) {
        return new Response(await new Response(child.stderr).text(), { status: 500 });
      }
      const { status, headers, body: payload } = splitCgi(new Uint8Array(output));
      return new Response(Buffer.from(payload), { status, headers });
    },
  });
  return { port: server.port ?? 0, stop: () => server.stop(true) };
}
