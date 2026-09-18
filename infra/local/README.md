# Local rehearsal inputs

- `platform.k3d.yaml`, `workers.k3d.yaml`: k3d clusters of `tool-fleet:lab` profiles `app`,
  `platform` and `fleet`. They are templates that `tools/tool-fleet/src/k3d-lab.ts` renders; do
  not pass them to k3d directly.
- `cloud-init.yaml`, `vm-lab.ts`: the Ubuntu VM lab (`tool-fleet:lab -- ... --lab-id <id>`).

Walkthrough, profiles, measurements and limits: [local lab](../../docs/infra/local.md).
