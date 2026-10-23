# Lab MCP image for the backup and cutover rehearsals. It matches
# apps/wbs/mcp-01/Dockerfile, the Dagger release image that the F8 lab builds.
# Build from the repo root:
#   docker build -f deploy/k8s/wbs/lab/mcp-01.Dockerfile -t wbs-mcp-01:lab .
FROM oven/bun:1.4.4-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM deps AS document
COPY tsconfig.base.json ./
COPY libs ./libs
# Proof: omitting this COPY failed the minimal Docker document-stage test.
COPY apps/wbs/be-01/tsconfig.json ./apps/wbs/be-01/tsconfig.json
COPY apps/wbs/be-01/src/openapi/emit-openapi-cli.ts ./apps/wbs/be-01/src/openapi/emit-openapi-cli.ts
RUN bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts /app/openapi.json

FROM oven/bun:1.4.4-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY libs ./libs
COPY apps/wbs/mcp-01 ./apps/wbs/mcp-01
COPY --from=document /app/openapi.json ./apps/wbs/mcp-01/src/openapi.json
WORKDIR /app/apps/wbs/mcp-01
EXPOSE 3300
CMD ["bun", "run", "src/main.ts"]
