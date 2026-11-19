# 🚀 Baskı Hesap — Sunucuya Dağıtım (baskihesap.tech)

Canlı sunucu: **158.158.38.174** (Caddy ters vekil → Node :3000)

---

## ⚡ Tek komut (önerilen)

PowerShell'de proje kökünde:

```powershell
.\deploy\gonder.ps1
```

Yaptığı iş:

1. `deploy/en-ucuz-nerede-<zaman>.tar.gz` paketini üretir (~2 MB, yalnızca kod)
2. Paketi + `sunucu-guncelle.sh` betiğini `scp` ile `/tmp/` altına atar
3. `ssh` ile sunucuda betiği çalıştırır:
   - uygulama dizinini ve çalışma biçimini (Docker / PM2) otomatik bulur
   - mevcut kodu `/root/baskihesap-yedek/` altına yedekler
   - yeni kodu açar (`data/`, `.env`, `node_modules` **korunur**)
   - `npm ci --omit=dev` (veya `docker compose up -d --build`)
   - servisi yeniden başlatır + `/api/ping` sağlık kontrolü
4. Canlı siteyi doğrular: `<title>` "Baskı Hesap" mi, `/logo.png` 200 mü?

Farklı kullanıcı:

```powershell
.\deploy\gonder.ps1 -Kullanici ubuntu
```

Yalnızca paket üretmek (elle yüklemek için):

```powershell
.\deploy\gonder.ps1 -SadecePaket
# veya
npm run deploy:paket
```

---

## 🔧 Elle dağıtım (adım adım)

```powershell
npm run deploy:paket
scp deploy\en-ucuz-nerede-*.tar.gz root@158.158.38.174:/tmp/
scp deploy\sunucu-guncelle.sh root@158.158.38.174:/tmp/
ssh root@158.158.38.174
```

Sunucuda:

```bash
bash /tmp/sunucu-guncelle.sh /tmp/en-ucuz-nerede-<zaman>.tar.gz
```

Önce görmek isteyip değişiklik yapmamak için:

```bash
bash /tmp/sunucu-guncelle.sh /tmp/paket.tar.gz --dry-run
```

Uygulama dizini otomatik bulunamazsa:

```bash
APPDIR_OVERRIDE=/var/www/en-ucuz-nerede bash /tmp/sunucu-guncelle.sh /tmp/paket.tar.gz
```

---

## 🛡️ Neyin üzerine YAZILMAZ

| Korunan | Neden |
|---|---|
| `data/` (SQLite + WAL + önbellek) | Canlı veritabanı; ezilirse tüm geçmiş gider |
| `.env` | Sunucudaki gerçek `ADMIN_ANAHTARI`, API anahtarları |
| `node_modules/` | Sunucuda `npm ci` ile kurulur |

Paket üretimi bunu otomatik **doğrular**: `data/`, `.env`, `.git`, `node_modules` pakete girerse betik hata verip durur.

---

## ↩️ Geri dönüş (rollback)

Her güncellemede yedek alınır. Geri dönmek için:

```bash
ls -lh /root/baskihesap-yedek/
tar -xzf /root/baskihesap-yedek/kod-<DAMGA>.tar.gz -C /var/www/en-ucuz-nerede
# Docker ise:
cd /var/www/en-ucuz-nerede && docker compose up -d --build
# PM2 ise:
pm2 restart en-ucuz-nerede
```

---

## 🔍 Sorun giderme

**Site açılıyor ama eski sürüm görünüyor**

```bash
# 1) Süreç gerçekten yeni kodla mı çalışıyor?
curl -s http://127.0.0.1:3000/api/ping
curl -sI http://127.0.0.1:3000/logo.png   # 200 olmalı

# 2) Tarayıcı önbelleği: Ctrl+Shift+R
# 3) Caddy önbelleği yok; ama Cloudflare eklendiyse "Purge Everything"
```

**`npm ci` hata veriyor (Python/build araçları)**

```bash
# impit ve playwright ön-derlenmiş ikili kullanır; glibc gerekir.
lsb_release -a        # Ubuntu/Debian olmalı (Alpine değil)
```

**Docker modunda volume yerinde mi**

```bash
docker inspect eun-app --format '{{range .Mounts}}{{.Source}} → {{.Destination}}{{"\n"}}{{end}}'
# ./data → /app/data görünmeli
```

**PM2 süreci yok**

```bash
cd <APPDIR> && pm2 start server.js --name en-ucuz-nerede && pm2 save
```
