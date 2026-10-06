<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The `dev.puni.dev` preview is moving from a Compose stack onto the platform k3s cluster as its
first tenant, with its manifests in a private fleet repository. Three public prerequisites block
that: the platform has no namespace for the preview; the committed Traefik values leave the
chart's 8000/8443 entry points and a LoadBalancer Service that never binds without ServiceLB, so
the host network would never serve 80/443; and there is no safe way to work on a private
repository from inside a public checkout without risking a leak into public history.

## What Changes

- `infra/platform/policy` declares `website-dev` with Pod Security `restricted` enforced and a
  `default-deny` NetworkPolicy; `tool-fleet:check` refuses any tenant namespace without both.
  The production blackbox probes both preview hostnames.
- Traefik listens on host ports 80/443, redirects HTTP permanently to HTTPS and sits behind a
  `ClusterIP` Service; the values schema, the rendered chart and a k3d rehearsal bind it.
- The Ansible base role lowers `net.ipv4.ip_unprivileged_port_start` to 0 on ingress nodes only,
  so Traefik stays non-root; `tool-fleet:check` renders the template per static inventory host.
- `docs/infra/platform.md` documents the second Flux source and its read-only credential.
- `bun run private:checkout <repo>` clones a private companion beside `origin` into the ignored
  `private/<repo>/`; `private:check` and `private:rehearse` run its own targets or skip visibly.
- A pre-commit hook and a CI step refuse any tracked path under `private/`, gitlinks,
  `.gitmodules`, a `.gitignore` without `/private/`, and an empty file list.

## Non-goals

- Any host, cluster, DNS, registry or credential change; the fleet repository's contents.
- Moving the preview itself, its manifests, images, secrets, backups or cutover.
- Proving the sysctl on a real kernel here: the QEMU platform lab is owed.

## Constraints

- No private URL, revision or content in public files; repository names only.
- Traefik stays non-root (UID 65532); no added capability.
- Public CI never depends on a private fetch.

## Capabilities

- `platform-ingress-edge`: Traefik host ports, redirect, Service type, ingress-node port floor.
- `tenant-namespaces`: restricted, default-deny tenant namespaces and preview probes.
- `private-companion-nesting`: nested checkout, wrappers, leak check.

## Decisions Recorded

- [ADR 0036](../../../docs/adr/0036-private-companions-are-nested-ignored-clones.md): private
  companions are nested, ignored clones.
