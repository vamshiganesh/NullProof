# Relayer API — container image for Railway / Fly.io / Render
#
# Build from repo root:
#   docker build -f oracle/Dockerfile -t nullproof-relayer .
# Run:
#   docker run -p 3001:3001 --env-file oracle/.env nullproof-relayer

FROM node:20-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY oracle/package.json oracle/package.json

RUN pnpm install --filter nullproof-oracle...

COPY oracle oracle/

WORKDIR /app/oracle

ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "api"]
