FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/arena npm run db:generate && npm run build

# Explicit test-only image: uses injected providers and arena_browser_test.
FROM build AS browser-test
ENV NODE_ENV=test
CMD ["node", "dist/test/browser-server.js"]

FROM build AS runtime
RUN npm prune --omit=dev
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && node dist/src/main.js"]
