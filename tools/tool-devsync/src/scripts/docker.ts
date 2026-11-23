import type { Consumer } from './model';

interface DockerSite {
  readonly path: readonly (string | number)[];
  readonly kind: 'command' | 'reference';
  readonly body: Exclude<Consumer['body'], { readonly kind: 'file' }>;
}

/**
 * Retain a whole Dockerfile as an unresolved build/image boundary and expose ordinary
 * executable instruction spans for migration. Physical spelling and line endings stay exact.
 * Heredocs, custom frontends and escape directives keep only the complete opaque file:
 * treating their inner lines as ordinary instructions would invent execution sites.
 * This observation grants no Docker syntax validation, stage/image interpretation or host
 * target authority. Explicit build-file selections with other names need caller discovery.
 * @see https://docs.docker.com/reference/dockerfile/
 */
export function readDockerSites(contents: string): readonly DockerSite[] {
  // Proof: docker-inventory-fault-root-v116b omitted this reference; all three opaque-file cases failed their site-count oracle, then passed after exact restoration.
  const sites: DockerSite[] = [
    {
      path: [],
      kind: 'reference',
      body: { kind: 'reference', text: contents },
    },
  ];
  const frontends = contents.matchAll(/^[ \t]*#[ \t]*syntax[ \t]*=[ \t]*([^\r\n]*)/gimu);
  // Proof: separate heredoc/escape/frontend omissions (docker-inventory-fault-*-v116b) each invented ordinary sites in its opaque fixture and failed the site-count oracle; each restored control passed. These are observation boundaries, not Docker execution validation.
  if (
    contents.includes('<<') ||
    /^[ \t]*#[ \t]*escape[ \t]*=/imu.test(contents) ||
    [...frontends].some((frontend) => !/^docker\/dockerfile(?::[^\s]+)?$/u.test(frontend[1].trim()))
  )
    return sites;
  const lines = contents.split(/(?<=\n)/u).entries();
  for (const [index, line] of lines) {
    if (/^\s*(?:#|$)/u.test(line)) continue;
    const start = index + 1;
    let body = line,
      tail = line;
    // Proof: docker-inventory-fault-continuation-v116b disabled this loop; the exact multi-line command-body assertion failed and passed after restoration.
    while (/\\[ \t]*(?:\r?\n)?$/u.test(tail)) {
      const next = lines.next();
      if (next.done) break;
      body += next.value[1];
      // Docker ignores comment/blank physical lines within a continued instruction.
      if (!/^\s*(?:#|$)/u.test(next.value[1])) tail = next.value[1];
    }
    // Proof: docker-inventory-fault-healthcheck-v116b removed HEALTHCHECK from this roster; its expected site disappeared. Restoration passed; other instruction arms are ordinary coverage.
    if (/^\s*(?:RUN|CMD|ENTRYPOINT|HEALTHCHECK|ONBUILD)(?:\s|$)/iu.test(line))
      sites.push({
        path: ['instructions', start],
        kind: 'command',
        body: { kind: 'command', text: body },
      });
  }
  return sites;
}
