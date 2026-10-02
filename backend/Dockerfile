FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY drizzle ./drizzle
RUN pnpm build && pnpm prune --prod

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=staging
WORKDIR /app

RUN groupadd --system --gid 10001 attendance \
  && useradd --system --uid 10001 --gid attendance --home-dir /app attendance

COPY --from=build --chown=attendance:attendance /app/package.json ./package.json
COPY --from=build --chown=attendance:attendance /app/node_modules ./node_modules
COPY --from=build --chown=attendance:attendance /app/dist ./dist
COPY --from=build --chown=attendance:attendance /app/drizzle ./drizzle

USER attendance
EXPOSE 3000
CMD ["node", "dist/server.js"]
