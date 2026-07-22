# Module 20 — container image for the mini-Ruderal SERVER.
#
# The server runs TypeScript directly via tsx (no build step), so this image is
# just: install deps, copy source, run. The static CLIENT is deployed separately
# (a Vite build on any static host) — see lesson 20.
FROM node:22-slim
WORKDIR /app

# pnpm ships with Node via corepack.
RUN corepack enable

# Install dependencies first (cached unless the lockfile changes).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# App source.
COPY src ./src

# Persistence lives on a mounted volume so edits survive redeploys.
ENV PORT=2567
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 2567

CMD ["pnpm", "exec", "tsx", "src/server/index.ts"]
