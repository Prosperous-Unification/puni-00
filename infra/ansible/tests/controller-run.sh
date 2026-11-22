#!/usr/bin/env bash
# Runs one tool of the locked fleet controller image for node-roles.test.ts in CI, where the
# runner has no Ansible: the repository and /tmp (the tests' scratch) are mounted at their own
# paths and the network is off. As root, because `nft -c` needs NET_ADMIN in effect to parse in
# the container's own namespace and `ssh-keygen` refuses a uid without a passwd entry; the test
# therefore reads what the roles wrote through this same wrapper.
set -euo pipefail
# The image id is the lock's digest (`tool-fleet:controller-image` refuses any other), so the
# run cannot pick up a different image under the same tag.
image=$(jq --exit-status --raw-output '.controller.digest' \
  "$(git rev-parse --show-toplevel)/infra/versions/toolchain.json")
repository=$(git rev-parse --show-toplevel)
exec docker run --rm --network none --cap-add NET_ADMIN \
  --user 0:0 --tmpfs /home/ansible \
  --env ANSIBLE_CONFIG --env SSH_CONNECTION --env HOME=/home/ansible \
  --volume "$repository:$repository" --volume /tmp:/tmp \
  --workdir "$PWD" --entrypoint "$1" "$image" "${@:2}"
