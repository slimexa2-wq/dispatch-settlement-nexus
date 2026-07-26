FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY prisma ./prisma
COPY data ./data
COPY docs/source ./docs/source
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @xiangneng/api db:generate && pnpm --filter @xiangneng/shared build && pnpm --filter @xiangneng/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app ./
RUN mkdir -p /app/storage/uploads
EXPOSE 3310
CMD ["pnpm", "--filter", "@xiangneng/api", "start"]
