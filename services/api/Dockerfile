FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api/package.json services/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/extension/package.json apps/extension/package.json
RUN pnpm install --frozen-lockfile

COPY services/api services/api
RUN pnpm --filter @callangos/api build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/api/node_modules ./services/api/node_modules
COPY --from=build /app/services/api/package.json ./services/api/package.json
COPY --from=build /app/services/api/dist ./services/api/dist
COPY --from=build /app/services/api/migrations ./services/api/migrations

WORKDIR /app/services/api
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3333/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
