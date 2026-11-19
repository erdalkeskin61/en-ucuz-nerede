#!/usr/bin/env bash
# =============================================================================
# Baskı Hesap — sunucu güncelleme betiği (2026-11-19)
#
# Ne yapar:
#   1. Uygulama dizinini ve çalışma biçimini (Docker / PM2) OTOMATİK bulur
#   2. Mevcut kodu yedekler  (/root/baskihesap-yedek/)
#   3. Yeni kodu açar — data/, .env ve node_modules'a DOKUNMAZ
#   4. Bağımlılıkları kurar, servisi yeniden başlatır
#   5. Sağlık kontrolü yapar (yerel /api/ping)
#
# Kullanım:
#   bash sunucu-guncelle.sh /tmp/en-ucuz-nerede-2026-11-19T07-49.tar.gz
#   bash sunucu-guncelle.sh /tmp/paket.tar.gz --dry-run     # sadece göster
# =============================================================================
set -euo pipefail

PAKET="${1:-}"
DRY_RUN=0
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=1

if [[ -z "$PAKET" || ! -f "$PAKET" ]]; then
  echo "Kullanım: bash $0 <paket.tar.gz> [--dry-run]" >&2
  exit 1
fi

say()  { printf '\033[1;34m▶\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✅\033[0m %s\n' "$*"; }
uyar() { printf '\033[1;33m⚠️\033[0m %s\n' "$*"; }
hata() { printf '\033[1;31m❌\033[0m %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# 1) Uygulama dizinini bul
# ---------------------------------------------------------------------------
APPDIR=""

# (a) Çalışan Node sürecinin cwd'sinden
if command -v pgrep >/dev/null 2>&1; then
  for pid in $(pgrep -f "node .*server\.js" 2>/dev/null || true); do
    cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)
    if [[ -n "$cwd" && -f "$cwd/server.js" ]]; then APPDIR="$cwd"; break; fi
  done
fi

# (b) Docker container etiketinden
if [[ -z "$APPDIR" ]] && command -v docker >/dev/null 2>&1; then
  cid=$(docker ps --format '{{.ID}} {{.Names}}' 2>/dev/null | awk '/eun-app|en-ucuz/{print $1; exit}' || true)
  if [[ -n "${cid:-}" ]]; then
    wp=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$cid" 2>/dev/null || true)
    [[ -n "$wp" && -f "$wp/server.js" ]] && APPDIR="$wp"
  fi
fi

# (c) Bilinen yollar
if [[ -z "$APPDIR" ]]; then
  for p in /root/en-ucuz-nerede /opt/en-ucuz-nerede /var/www/en-ucuz-nerede \
           /srv/en-ucuz-nerede /home/*/en-ucuz-nerede /root/baskihesap /opt/baskihesap; do
    if [[ -f "$p/server.js" ]]; then APPDIR="$p"; break; fi
  done
fi

if [[ -z "$APPDIR" ]]; then
  hata "Uygulama dizini bulunamadı. Elle belirtin:"
  echo "   APPDIR=/yol/en-ucuz-nerede bash $0 $PAKET"
  exit 1
fi

# Elle geçersiz kılma
[[ -n "${APPDIR_OVERRIDE:-}" ]] && APPDIR="$APPDIR_OVERRIDE"

say "Uygulama dizini      : $APPDIR"
say "Paket                : $PAKET"

# ---------------------------------------------------------------------------
# 2) Çalışma biçimini tespit et
# ---------------------------------------------------------------------------
MOD="pm2"
if [[ -f "$APPDIR/docker-compose.yml" ]] && command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE '^eun-app$'; then
    MOD="docker"
  elif docker compose version >/dev/null 2>&1 && (cd "$APPDIR" && docker compose ps --quiet 2>/dev/null | grep -q .); then
    MOD="docker"
  fi
fi
say "Çalışma biçimi       : $MOD"

# ---------------------------------------------------------------------------
# 3) Yedek
# ---------------------------------------------------------------------------
YEDEK_DIZIN=/root/baskihesap-yedek
DAMGA=$(date +%Y%m%d-%H%M%S)
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p "$YEDEK_DIZIN"
  say "Yedekleniyor → $YEDEK_DIZIN/kod-$DAMGA.tar.gz"
  tar -czf "$YEDEK_DIZIN/kod-$DAMGA.tar.gz" \
      --exclude='node_modules' --exclude='data' -C "$APPDIR" . 2>/dev/null || true
  ok "Yedek alındı ($(du -h "$YEDEK_DIZIN/kod-$DAMGA.tar.gz" | cut -f1))"
fi

if [[ $DRY_RUN -eq 1 ]]; then
  uyar "--dry-run: hiçbir değişiklik yapılmadı."
  echo "   Açılacak dosya sayısı: $(tar -tzf "$PAKET" | wc -l)"
  exit 0
fi

# ---------------------------------------------------------------------------
# 4) Kodu aç (data/, .env, node_modules KORUNUR)
# ---------------------------------------------------------------------------
# `--exclude` sadece arşivdeki yolları etkiler; mevcut dosyaları SİLMEZ.
# Böylece canlı SQLite (.db + WAL), .env ve kurulu bağımlılıklar yerinde kalır.
say "Yeni kod açılıyor…"
tar -xzf "$PAKET" -C "$APPDIR" \
    --exclude='./data/*' --exclude='./.env' --exclude='./node_modules/*'
ok "Kod güncellendi"

# ---------------------------------------------------------------------------
# 5) Bağımlılıklar
# ---------------------------------------------------------------------------
if [[ "$MOD" == "docker" ]]; then
  say "Docker imajı yeniden derleniyor (bağımlılıklar imaj içinde)…"
  cd "$APPDIR"
  docker compose up -d --build
  ok "Konteynerler güncellendi"
else
  cd "$APPDIR"
  if [[ -f package-lock.json ]]; then
    say "npm ci --omit=dev"
    npm ci --omit=dev --no-audit --no-fund
  else
    say "npm install --omit=dev"
    npm install --omit=dev --no-audit --no-fund
  fi
  ok "Bağımlılıklar kuruldu"

  # PM2 ile çalışıyorsa yeniden başlat
  if command -v pm2 >/dev/null 2>&1 && pm2 describe en-ucuz-nerede >/dev/null 2>&1; then
    say "pm2 restart en-ucuz-nerede"
    pm2 restart en-ucuz-nerede --update-env
    ok "PM2 süreci yeniden başlatıldı"
  elif command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet baskihesap 2>/dev/null; then
    say "systemctl restart baskihesap"
    systemctl restart baskihesap
    ok "systemd servisi yeniden başlatıldı"
  else
    uyar "PM2/systemd servisi bulunamadı. Süreci elle başlatmanız gerekebilir."
  fi
fi

# ---------------------------------------------------------------------------
# 6) Sağlık kontrolü
# ---------------------------------------------------------------------------
say "Sağlık kontrolü…"
for i in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/ping >/dev/null 2>&1; then
    ok "Servis ayakta (deneme $i)"
    curl -s --max-time 3 http://127.0.0.1:3000/api/ping; echo
    # Marka kontrolü: logo yayında mı?
    if curl -fsSI --max-time 3 http://127.0.0.1:3000/logo.png >/dev/null 2>&1; then
      ok "Yeni logo yayında (/logo.png)"
    else
      uyar "/logo.png 404 — kod güncellenmiş olabilir ama servis eski süreci kullanıyor."
    fi
    exit 0
  fi
  sleep 2
done

hata "Servis 40 sn içinde yanıt vermedi. Günlükleri kontrol edin:"
echo "   docker compose logs --tail=60      # docker ise"
echo "   pm2 logs en-ucuz-nerede --lines 60 # pm2 ise"
echo
echo "Geri dönmek için:"
echo "   tar -xzf $YEDEK_DIZIN/kod-$DAMGA.tar.gz -C $APPDIR"
exit 1
