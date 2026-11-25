FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY scripts/patch-baileys.mjs ./scripts/patch-baileys.mjs
RUN npm ci

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY scripts/patch-baileys.mjs ./scripts/patch-baileys.mjs
RUN mkdir /data && chown node:node /data
USER node
CMD ["npm", "start", "--", "--config", "/app/config.yaml"]

FROM runtime AS test
COPY --chown=node:node tests ./tests
CMD ["npm", "test"]

FROM runtime AS bot
