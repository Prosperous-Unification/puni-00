# Intent

## Problem

Repository hooks, CI admission, the full gate, and deployment preparation still invoke the in-repository wiki implementation. Candidate changes can therefore affect code or dependency inputs near the trusted admission path.

## Desired outcome

Install a pinned Twilight Bureaucrat release from trusted base-owned inputs with scripts disabled, use it across every current consumer path, and bind deployment admission to source, package, activation, and image identities.

## Non-goals

- Letting a package upgrade replace an activation.
- Removing compatibility wrappers before all callers migrate.
- Giving pull-request code production credentials.

## Constraints

Candidate package pins, lockfiles, registry configuration, lifecycle scripts, validator source, Nx plugins, and activation variables are untrusted. Existing check names and inactive/unconfigured activation behavior remain stable. A real activation requires real review/check evidence.
