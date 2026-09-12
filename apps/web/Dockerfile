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

COPY apps/web apps/web
ARG VITE_API_URL
ARG VITE_DIALER_MODE=external
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_DIALER_MODE=$VITE_DIALER_MODE
RUN test -n "$VITE_API_URL" && pnpm --filter web build

FROM nginx:stable-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1/health || exit 1
