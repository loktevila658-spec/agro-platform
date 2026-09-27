FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY apps/package.json apps/pnpm-workspace.yaml ./apps/
COPY apps/workers ./apps/workers
COPY packages ./packages
RUN cd apps && pnpm install --no-frozen-lockfile
RUN cd apps && pnpm --filter @agroplatform/workers build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/apps/workers/dist ./dist
CMD ["node", "dist/main.js"]
