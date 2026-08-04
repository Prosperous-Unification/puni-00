# The only image build in the cheap-dev design. It carries toolchain and no
# application code: the app arrives through a bind mount, so this is rebuilt
# when Bun or Node moves, not when the app changes.
FROM oven/bun:1.2.20-debian

# be-01 and gw-01 run under `bun --watch`, but fe-01 runs `bunx vite`, and
# vite's bin starts with `#!/usr/bin/env node` -- bunx honours the shebang and
# hands execution to Node. Without Node here, be and gw come up healthy and
# only fe dies, which makes the cause hard to see from the outside.
ENV NODE_VERSION=24.18.1
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl xz-utils git ca-certificates \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/SHASUMS256.txt \
  && (cd /tmp && grep " node-v${NODE_VERSION}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -) \
  && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
  && rm -rf /tmp/node.tar.xz /tmp/SHASUMS256.txt /var/lib/apt/lists/* \
  && node --version \
  && bun --version

WORKDIR /src
CMD ["bun", "run", "dev"]
