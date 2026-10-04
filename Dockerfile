# Build the app. Every dependency is bundled into ./build, so the final image
# needs no node_modules. The bundle is plain JavaScript, so it is built once, on
# the machine doing the build, whatever platform the image is for.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    # node:sqlite is stable enough to rely on but still announces itself as experimental.
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

COPY --from=build /app/build ./build
COPY package.json scripts/reset-password.mjs scripts/backup.mjs ./
# backup.mjs shares the app's own backup code, which Node runs as it is.
COPY src/lib/server/backups.ts ./src/lib/server/backups.ts

# The database and its backups live in /data; mount a volume there to keep them.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -q --spider http://127.0.0.1:3000/login || exit 1

CMD ["node", "build"]
