# =============================================================================
# Baskı Hesap — Üretim imajı (Azure Ubuntu VM / Docker)
# =============================================================================
# Taban: node:22-bookworm-slim
#   • Debian bookworm = glibc → `impit` (Rust/N-API) prebuilt ikilisi çalışır.
#   • Alpine (musl) KULLANILMAZ: impit + Playwright ikilileri glibc ister.
#
# Playwright Chromium:
#   • ARG PLAYWRIGHT_KUR=1 (varsayılan) → `npx playwright install --with-deps chromium`
#     . Bu, yerel tarayıcı katmanının (Trendyol/Amazon/n11 için son çare)
#     çalışması için gerekli sistem kütüphanelerini de kurar (~400 MB).
#   • Bellek darsa `--build-arg PLAYWRIGHT_KUR=0` ile imaj küçültülür;
#     uygulama TARAYICI_KAPALI=1 ile de çalışabilir (impit + sağlayıcılar).
# =============================================================================
FROM node:22-bookworm-slim

# Çalışma zamanı temelleri + Playwright bağımlılıkları için gerekenler.
# (Playwright --with-deps kendi paketlerini kurar; buradakiler imajın
#  "en az çalışır" temelini garanti eder: CA sertifikaları, tzdata, curl.)
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    TZ=Europe/Istanbul \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    npm_config_update_notifier=false \
    npm_config_fund=false

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      tzdata \
      dumb-init \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Bağımlılıklar (katman önbelleği için önce manifest) ----
COPY package.json package-lock.json* ./
# `npm ci` kilit dosyası varsa deterministik kurulum yapar.
# Playwright paketi kurulur ama tarayıcı ikilisi ayrı adımda indirilir.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
 && npm cache clean --force

# ---- Chromium (opsiyonel ama varsayılan açık) ----
ARG PLAYWRIGHT_KUR=1
RUN if [ "$PLAYWRIGHT_KUR" = "1" ]; then \
      mkdir -p /ms-playwright && \
      npx playwright install --with-deps chromium && \
      chmod -R a+rX /ms-playwright ; \
    else \
      echo "PLAYWRIGHT_KUR=0 → Chromium kurulmadı (TARAYICI_KAPALI=1 önerilir)"; \
    fi

# ---- Uygulama kodu ----
COPY . .

# Kalıcı veri dizini (SQLite + WAL + önbellek). Volume ile bağlanır.
RUN mkdir -p /app/data \
 && chown -R node:node /app

USER node

ENV PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data

EXPOSE 3000

# Docker/Caddy sağlık kontrolü: /api/ping erişim kısıtından muaftır.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/ping" > /dev/null || exit 1

# dumb-init → PID 1 sinyal yönetimi (SIGTERM ile temiz SQLite kapanışı).
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
