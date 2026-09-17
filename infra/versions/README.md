# Fleet toolchain lock

`toolchain.json` is the only version input for fleet installation and rendering. It was resolved on 2026-09-17 from the component's official GitHub release metadata, HashiCorp releases, Kubernetes downloads, Snap Store metadata, Ansible Galaxy, and the publishers' Helm indexes and OCI registries. Artifact SHA-256 values came from publisher metadata where available and from streaming the exact official URL otherwise.

The controller digest is the OCI manifest produced from `infra/controller/Containerfile`; it is prepared for `ghcr.io/prosperous-unification/fleet-controller:0.1.0` but is not a claim that the image has been pushed. A runner may use the local OCI artifact only after matching that manifest digest. Publication of the controller image is part of the protected infrastructure release path.

Only Ubuntu 24.04 amd64 hosts are supported initially. Another architecture needs its own binary, chart-image, controller, and local-VM locks.

The Kubernetes baseline is k3s v1.36.4+k3s1 with kubectl v1.36.4.
[cert-manager's release table](https://cert-manager.io/docs/releases/) lists
Kubernetes 1.33 through 1.36 for v1.21, so this baseline is inside its published
compatibility range. The k3d node image is locked separately from the host k3s
binary. Every chart records the exact enabled image roles and components that
the platform profile disables; the reader rejects a missing or extra role.
