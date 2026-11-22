#!/usr/bin/env bash
# Runs one tool of the locked fleet controller image for node-roles.test.ts in CI, where the
# runner has no Ansible. `PUNI_CONTROLLER_IMAGE` is the reference
# `tools/tool-fleet/src/controller-image-cli.ts` resolves, as `tool-fleet:check` does: by manifest
# digest on a containerd store, by the verified config digest on the classic store of hosted
# runners. The repository is mounted read-only and /tmp (the tests' scratch) read-write, both at
# their own paths, with the network off. As root, because `nft -c` needs NET_ADMIN in effect to
# parse in the container's own namespace and `ssh-keygen` refuses a uid without a passwd entry;
# the test therefore reads what the roles wrote through this same wrapper.
set -euo pipefail
image=${PUNI_CONTROLLER_IMAGE:?set PUNI_CONTROLLER_IMAGE from tools/tool-fleet/src/controller-image-cli.ts}
repository=$(git rev-parse --show-toplevel)
exec docker run --rm --network none --cap-add NET_ADMIN \
  --user 0:0 --tmpfs /home/ansible \
  --env ANSIBLE_CONFIG --env SSH_CONNECTION --env HOME=/home/ansible \
  --volume "$repository:$repository:ro" --volume /tmp:/tmp \
  --workdir "$PWD" --entrypoint "$1" "$image" "${@:2}"
