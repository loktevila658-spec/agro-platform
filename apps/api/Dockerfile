FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY apps/package.json apps/pnpm-workspace.yaml ./apps/
COPY apps/api ./apps/api
COPY packages ./packages
COPY security/headers.cjs ./security/headers.cjs
RUN cd apps && pnpm install --no-frozen-lockfile
RUN cd apps && pnpm --filter @agroplatform/api build

FROM node:22-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /workspace/apps/api
COPY --from=build /workspace/apps/node_modules ../node_modules
COPY --from=build /workspace/apps/api/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/packages/observability/src/index.cjs /workspace/packages/observability/src/index.cjs
COPY --from=build /workspace/security/headers.cjs /workspace/security/headers.cjs
EXPOSE 3000
CMD ["node", "dist/main.js"]
