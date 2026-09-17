# Fleet toolchain lock

`toolchain.json` is the only version input for fleet installation and rendering. It was resolved on 2026-09-17 from the component's official GitHub release metadata, HashiCorp releases, Kubernetes downloads, Snap Store metadata, Ansible Galaxy, and the publishers' Helm indexes and OCI registries. Artifact SHA-256 values came from publisher metadata where available and from streaming the exact official URL otherwise.

The controller digest is the OCI manifest produced from `infra/controller/Containerfile`; it is prepared for `ghcr.io/prosperous-unification/fleet-controller:0.1.0` but is not a claim that the image has been pushed. A runner may use the local OCI artifact only after matching that manifest digest. Publication of the controller image is part of the protected infrastructure release path.

Only Ubuntu 24.04 amd64 hosts are supported initially. Another architecture needs its own binary, chart-image, controller, and local-VM locks.
