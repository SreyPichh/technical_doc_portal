# NSK Technical Information Portal — production image
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY scripts/copy-pdfjs-assets.mjs scripts/copy-pdfjs-assets.mjs
RUN npm ci

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/copy-pdfjs-assets.mjs && npx next build && npm prune --omit=dev

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_LOCAL_DIR=/data/storage \
    OCR_CACHE_DIR=/data/storage/.ocr-cache \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium
# Chromium is only used to export portal-authored documents to PDF.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-cjk ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app -d /app app \
 && mkdir -p /data/storage && chown -R app:app /data
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/package.json /app/next.config.ts /app/tsconfig.json /app/drizzle.config.ts ./
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=build --chown=app:app /app/src ./src
USER app
VOLUME ["/data/storage"]
EXPOSE 3000
# Apply database migrations, then start the server.
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx next start -p ${PORT}"]
