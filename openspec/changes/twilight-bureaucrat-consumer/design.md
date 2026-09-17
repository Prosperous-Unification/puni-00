# Design

P5 of [the package plan](../../../docs/superpowers/plans/2026-09-17-twilight-bureaucrat-package.md#p5--switch-every-consumer-path-to-the-package) defines the adoption sequence. Trusted bootstrap creates a scratch consumer from base-owned package and lock files, configures an explicit registry, installs frozen with lifecycle scripts disabled, and only then reads candidate bytes. Root diagnostics use the local installed executable while `bin/tool-wiki-lint.sh` remains an external compatibility route.

Package compatibility is checked against the externally selected activation. Deployment preparation consumes the admitted source SHA, package identity, activation identity, and staged image digest as separate fields.
