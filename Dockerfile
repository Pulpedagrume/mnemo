# syntax=docker/dockerfile:1
# Mnemo self-hosted server: web app (PWA) + API + sync, in one container.
#   docker build -t mnemo .
#   docker run -p 8787:8787 -v mnemo-data:/data -e SESSION_SECRET=... mnemo

ARG NODE_IMAGE=node:24-slim

# --- build: install the workspace, build the PWA and bundle the server --------------------------
FROM ${NODE_IMAGE} AS build
ENV CI=true
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @mnemo/web build \
 && pnpm --filter @mnemo/server build
# argon2 is a native addon: install it (and only it) for the runtime image, same libc as runtime.
RUN mkdir -p /out \
 && cd /out \
 && echo '{"private":true,"type":"module"}' > package.json \
 && npm install --omit=dev --no-audit --no-fund \
      "@node-rs/argon2@$(node -p "require('/src/apps/server/package.json').dependencies['@node-rs/argon2']")"

# --- runtime: no toolchain, no sources, non-root ----------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data \
    WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /src/apps/server/dist ./
COPY --from=build /src/apps/web/dist ./web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.mjs"]
