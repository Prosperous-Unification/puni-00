# Lab-only MCP image for the F8 k3d rehearsal. Production MCP has no Dagger
# image yet; this mirrors gw-01's runtime so the lab exercises the same Bun
# source-run contract. Build from the repo root:
#   docker build -f deploy/k8s/wbs/lab/mcp-01.Dockerfile -t wbs-mcp-01:lab .
FROM oven/bun:1.4.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.2-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY libs ./libs
COPY apps/wbs/mcp-01 ./apps/wbs/mcp-01
WORKDIR /app/apps/wbs/mcp-01
EXPOSE 3300
CMD ["bun", "run", "src/main.ts"]
