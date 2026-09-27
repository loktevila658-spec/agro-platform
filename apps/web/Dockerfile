FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY apps/package.json apps/pnpm-workspace.yaml ./apps/
COPY apps/web ./apps/web
COPY packages ./packages
RUN cd apps && pnpm install --no-frozen-lockfile
RUN cd apps && pnpm --filter @agroplatform/web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
