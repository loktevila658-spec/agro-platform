FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY apps/package.json apps/pnpm-workspace.yaml ./apps/
COPY apps/api ./apps/api
COPY packages ./packages
RUN cd apps && pnpm install --no-frozen-lockfile
RUN cd apps && pnpm --filter @agroplatform/api build

FROM node:22-alpine
WORKDIR /workspace/apps/api
COPY --from=build /workspace/apps/node_modules ../node_modules
COPY --from=build /workspace/apps/api/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
