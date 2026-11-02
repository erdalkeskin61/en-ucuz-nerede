# 🏷️ En Ucuz Nerede?

Türkiye'deki **61 e-ticaret mağazasında** aynı ürünün **gerçekte ödeyeceğin**
en ucuz fiyatını bulan fiyat karşılaştırma platformu.

Etiket fiyatı değil; kargo, kupon, cashback ve kampanyalar düştükten sonraki
**net tutar** karşılaştırılır. "Sahte ucuz" (düşük gramaj / şişirilmiş etiket)
tuzakları ayrıca işaretlenir.

---

## İçindekiler

- [Özellikler](#özellikler)
- [Mimari](#mimari)
- [Kurulum](#kurulum)
- [Ortam değişkenleri](#ortam-değişkenleri)
- [API uçları](#api-uçları)
- [3D baskı modülü](#3d-baskı-modülü)
- [Testler](#testler)
- [Güvenlik](#güvenlik)

---

## Özellikler

### 🔎 Karşılaştırma motoru
- **61 mağaza paralel tarama** (Trendyol, Hepsiburada, Amazon TR, Vatan,
  MediaMarkt, Teknosa, n11, İtopya, Pazarama, İncehesap, Robotistan,
  Direnc.net, Robitshop, SAMM ve 45+ mağaza).
- **Ürün kimliği eşleştirme**: model kodu → barkod → başlık benzerliği →
  semantik (YZ) eşleşme. Farklı renk/varyant ayrı işaretlenir.
- **Net fiyat motoru**: kupon, kargo, banka indirimi, taksit vade farkı,
  cashback ve koşullu kampanyalar ayrıştırılır.
- **Sahte ucuz uyarısı**: 800 g / 1 kg gibi gramaj tuzakları ₺/kg üzerinden
  yakalanır; şişirilmiş liste fiyatları işaretlenir.
- **Stok hiyerarşisi**: stokta olan ürünler her zaman tükenenlerin önünde.
- **SSE canlı akış** + polling yedeği: siteler tamamlandıkça kartlar güncellenir.

### ⚡ SWR — 0 saniye yanıt
- Daha önce taranan ürün **anında** (≈0,2 sn) gösterilir, arka planda sessizce
  tazelenir; fiyatı düşen kart yeşil parlar.
- SQLite `snapshot` tablosu (WAL), 5 saat TTL, sürüm kontrolü.
- URL normalizasyonu: `utm_*`, `gclid`, `fbclid`, `ref`, `source`… atılır;
  `www`, `http/https`, fragment ve sonda `/` farkı yok sayılır.

### 🧠 Fiyat zekası
- 30/90 günlük fiyat geçmişi, dip fiyat / ortalama / tavan analizi.
- **Sahte indirim radarı**: şişirilmiş etiket ve gerçek indirim ayrımı.
- 30 günlük trend grafiği (Chart.js, gerçek veri yoksa uydurma çizgi yok).
- Muadil ürün önerileri (stok yok / bütçe aşımı).

### 🖨️ 3D baskı uzmanlık modülü
- **Dilimleyici maliyet simülatörü**: 100 g model için hammadde + elektrik,
  makaradan çıkacak adet, metre başına maliyet.
- **Çap kalkanı**: 1.75 mm / 2.85 mm ayrımı ve uyarı rozeti.
- **Hammadde sınıflandırma**: PLA, PLA+, Hyper, PETG, ABS/ASA, TPU, PVA,
  CF + reçine alt türleri; Silk/Mat/Biyo-Uyumlu/UV nitelik rozetleri.
- **Birim fiyat**: `🏷️ 350,00 TL / kg` · `🧪 720,00 TL / L`; gramaj/hacim
  farkı gözetmeden "₺/kg En Ucuz" sıralaması.

### 🛒 Akıllı sepet
- 2–10 ürün linki; kargo eşiklerine göre üç senaryo: tek mağaza,
  akıllı bölünmüş, maksimum tasarruf.
- Kupon eşleştirme, kargo tamamlayıcı önerileri.
- **WhatsApp ile paylaş** + kalıcı salt okunur paylaşım linki (`/sepet/paylas/:id`).

### 🔔 Alarmlar ve bildirimler
- Takip edilen ürünler günde 5 kez kontrol edilir (09/12/15/18/21).
- Hedef fiyat, en ucuz mağaza değişimi ve stok değişimi alarmları.
- **E-posta (SMTP), Telegram, WhatsApp ve Web Push** (VAPID) kanalları.
- Alarm öncesi fiyat sayfadan yeniden çekilerek doğrulanır.

### 📢 Otonom fırsat kanalı
- Gerçek taramalardan "günün fırsatı" seçip Telegram kanalına paylaşır.
- Minimum indirim, günlük limit, cooldown ve şablonlu mesaj.
- Referans fiyat yoksa paylaşım yapılmaz (uydurma indirim yok).

### 🎨 Arayüz
- **Plus Jakarta Sans**, indigo→mor gradyan, zümrüt tasarruf vurgusu.
- **Açık/koyu tema** (`html[data-theme="dark"]`), WCAG AA kontrast.
- **Hibrit arama**: link yapıştır / doğal dil / ürün adı.
- **Typeahead**: 150 ms debounce, klavye (↑/↓/Enter/Esc), ARIA combobox.
- **Skeleton + Bento özet**: spotlight, trend sparkline, fiyat dağılımı.
- **PWA**: mobil alt navigasyon, çevrimdışı kabuk, service worker.
- Barkod kamera, fotoğraftan arama, raf fiyatı karşılaştırması.

## 🧹 Bakım
- Her gece 04:00: WAL checkpoint (TRUNCATE), `PRAGMA optimize`, eski kayıt ve
  önbellek temizliği, log rotasyonu.
- Ayarlar sayfasından tek tıkla çalıştırma + kuru tarama (dry-run).

---

## Mimari

```
server.js                 Express uçları, kalıcı iş kuyruğu, SSE
src/pipeline.js           61 mağaza paralel karşılaştırma
src/sites/                mağaza adaptörleri + platform fabrikaları
src/netFiyat.js           kupon/kargo/taksit/cashback net fiyat
src/pricing.js            fiyat değerlendirme (dip/sahte indirim)
src/birimFiyat.js         ₺/kg · ₺/L + birim maliyet
src/baskiMaliyet.js       dilimleyici maliyet + çap/hammadde
src/anlikOnbellek.js      SQLite snapshot + SWR
src/store.js              SQLite (WAL) tüm kalıcı veri
src/alarms.js             fiyat alarmları + bildirim kanalları
src/push.js               Web Push (VAPID)
src/firsatKanali.js       otonom Telegram fırsat kanalı
src/dbBakim.js            WAL checkpoint / önbellek temizliği
src/oneriler.js           arama önerileri (typeahead)
public/                   PWA arayüzü (Vanilla JS + modern CSS)
scripts/                  test ve teşhis betikleri
```

**Veri katmanı:** `node:sqlite` (WAL modu). Tablolar: `settings`, `tracked`,
`history`, `price_history`, `snapshot`, `snapshot` sürümü, `firsat_gonderim`,
`shared_carts`, `push_subscriptions`, `jobs`, `adapter_health`.

---

## Kurulum

```bash
git clone <repo-url>
cd en-ucuz-nerede
npm install
cp .env.example .env
# .env içindeki API anahtarlarını doldurun
npm start
```

Varsayılan adres: <http://localhost:3000>

> Node.js **20+** gerekir; `node:sqlite` için **22+** önerilir.

### PM2 ile kalıcı çalıştırma

```bash
npm install -g pm2
pm2 start server.js --name en-ucuz-nerede
pm2 save
```

---

## Ortam değişkenleri

| Değişken | Açıklama |
|---|---|
| `PORT`, `HOST` | Sunucu portu / adresi (varsayılan 3000 / 0.0.0.0) |
| `SCRAPERAPI_KEY` | Birincil kazıma sağlayıcısı |
| `CRAWLBASE_TOKEN`, `ZENROWS_API_KEY`, `SCRAPINGBEE_API_KEY`, `ZYTE_API_KEY` | Yedek sağlayıcılar |
| `EVREN_LLM_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | YZ eşleştirme + kampanya sınıflandırma |
| `ERISIM_ANAHTARI` | Doluysa API tek anahtarla korunur |
| `CACHE_TTL_MINUTES` | Sayfa önbelleği (varsayılan 360 dk) |
| `SNAPSHOT_TTL_MINUTES` | SWR ömrü (varsayılan 300 dk) |
| `CACHE_SAKLAMA_GUN`, `CACHE_MAKS_MB` | Önbellek bakım sınırları |
| `MAX_CANDIDATES` | Site başına aday ürün sayısı |
| `ALARM_CHECK_MINUTES`, `ALARM_SAATLERI` | Alarm zamanlaması |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (boşsa otomatik üretilir) |
| `PUBLIC_URL` | Mutlak linkler için genel adres (Telegram botu) |
| `BASKI_YAZICI_GUC_W`, `BASKI_ELEKTRIK_KWH_TL`, `BASKI_GRAM_SAAT` | 3D maliyet varsayımları |

---

## API uçları (özet)

| Uç | Açıklama |
|---|---|
| `POST /api/compare` | Karşılaştırma başlat (`taze:true` önbelleği atlar) |
| `GET /api/compare/:id` | İş durumu / sonucu |
| `GET /api/stream/:id` | SSE canlı akış |
| `POST /api/compare/:id/iptal` | İptal |
| `POST /api/oneri` | Doğal dil ürün önerisi |
| `POST /api/sepet`, `GET /api/sepet/:id` | Akıllı sepet |
| `POST /api/sepet/paylas`, `GET /api/sepet/paylas/:id` | Sepet paylaşımı |
| `GET /api/search-suggestions?q=` | Typeahead önerileri |
| `POST /api/link-coz` | Link çözümleme (mağaza + ürün adı) |
| `GET /api/history` | Son aramalar (ürün + en ucuz linkleri) |
| `GET /api/tracked`, `POST /api/tracked` | Fiyat takipleri |
| `POST /api/alarm/calistir` | Alarmları elle çalıştır |
| `GET/POST /api/settings` | Ayarlar |
| `GET /api/push/vapid-key`, `POST /api/push/subscribe` | Web Push |
| `GET /api/firsat/durum`, `POST /api/firsat/calistir` | Fırsat kanalı |
| `GET /api/radar/durum`, `POST /api/radar/calistir` | Otonom 3D fiyat radarı |
| `GET/POST /api/radar/katalog`, `DELETE /api/radar/katalog/:id` | Radar takip kataloğu |
| `GET/POST /api/db/bakim` | Veritabanı/önbellek bakımı |
| `GET /api/durum`, `GET /api/ping` | Sağlık ve site listesi |

Tam liste için `server.js` içindeki `app.get/post` tanımlarına bakın.

---

## 🤖 Telegram Asistanı (`@erdal_fiyat_takip_bot`)

Bot iki yönlü çalışır: **ürün linki** veya **düz ürün adı** gönderilebilir.

### Metin araması
`Bambu Lab P1S`, `eSun PLA+ Siyah`, `Creality K1 Max` gibi metinler
`hizliKaynakUrunBul()` ile kanonik ürün sayfasına çevrilir ve 61 mağazada
karşılaştırılır. Eşleşme yoksa model adını detaylandırma önerisi verilir.

### Yanıt biçimi

```
🏷️ Bambu Lab P1S Combo 3D Yazıcı
━━━━━━━━━━━━━━━━━━━━
🏆 En Ucuz: ₺34.899,00 (Robotistan)
🚚 Kargo: Kargo Bedava
📦 Stok: 🟢 5 mağazada var
━━━━━━━━━━━━━━━━━━━━
📊 Mağaza Karşılaştırması (61 Site):
1. 🥇 Robotistan — ₺34.899,00 (Kargo Bedava)
2. 🥈 Robitshop — ₺35.250,00 (+₺45,00 Kargo)
3. 🥉 3DMarketim — ₺36.100,00 (Kargo Bedava)
💡 En ucuz mağaza ile diğerleri arasında ₺2.600,00 tasarruf farkı var!
```

Filamentlerde ek satırlar:

```
⚖️ Birim Fiyat: ₺440,00 / kg
🧮 En iyi birim fiyat: Hepsiburada — ₺350,00 / kg (2,5 kg makara)
```

> Etiket fiyatı en düşük olan 500 g makara ₺440/kg iken, 2.5 kg makara
> ₺350/kg olabilir; bot bunu ayrıca belirtir. Reçinelerde `₺/L` gösterilir.

### Butonlar
| Buton | Davranış |
|---|---|
| 🛒 En Ucuz Mağazaya Git | Afiliye linkle mağazayı açar |
| 🔔 Fiyatı Takibe Al | `alarm:takip:<hash>` → `addTracked()` (hedef = mevcut en ucuz, **sohbet bazlı**) |
| 🌐 Sitede Detaylı İncele | `PUBLIC_URL/?url=…` karşılaştırma sayfası |

Kişisel alarm kaydı `tracked.chatId` ile saklanır: fiyat düştüğünde / mağaza
değiştiğinde bildirim **yalnızca alarmı kuran sohbete** gider (`/liste` de o
sohbetin alarmlarını gösterir).

### SWR
Son **2 saat** içinde taranmış ürün önbellekten **anında** yanıtlanır:
`⚡ (Son kontrol: 15 dk önce)`.

### Komutlar

| Komut | Yetki | Açıklama |
|---|---|---|
| `/start`, `/yardim` | Herkes | Yardım menüsü (radar komutları dahil) |
| `/liste`, `/takipler` | Herkes | **Yalnızca o sohbetin** fiyat alarmları |
| `/radar`, `/radar_durum` | Herkes | 🟢/⚪ durum, katalog sayısı, son tur, stoktaki dip fiyatlar + `[🧪 Şimdi Taramayı Başlat]` |
| `/radar_liste` | Herkes | Takip kataloğu (ID + kategori + ad) |
| `/radar_tara` | **Yönetici** | `radarBaslat({ zorla:true, gonder:true })` — arka planda 61 mağaza |
| `/radar_ekle <ürün adı>` | **Yönetici** | `katalogEkle({ ad, sorgu })` — ör. `/radar_ekle Polymaker PolyTerra PLA Beyaz 1kg` |
| `/radar_sil <ID \| ürün adı>` | **Yönetici** | `katalogSil(id)` — ürün ve `radar_durum` kaydı silinir |

Yönetici = `settings.telegram.chatId` (radar bildirim sohbeti de kabul edilir).
Yabancı kullanıcı yönetim komutunu denerse
`⚠️ Bu komut yalnızca sistem yöneticisine açıktır.` yanıtı alır; arama, `/liste`
ve kişisel alarmlar herkese açıktır. Radar kartlarındaki
**🔔 Fiyatı Takibe Al** butonu `alarm:takip:radar:<katalogId>` callback'i ile
kullanıcıya özel alarm kurar.

### Dayanıklılık
- Token yoksa bot çökmez; uyarı basıp bekler. Token geçersizse (401/404) polling durur.
- Tüm metinler `esc()` ile HTML-escape edilir (parse hatası yok).
- Sohbet başına sıralı kuyruk: peş peşe aramalar botu kilitlemez.

Test: `node scripts/test-telegram-bot.mjs` (88 kontrol) ·
`node scripts/test-telegram-radar.mjs` (103 kontrol; admin koruması, komutlar,
callback'ler ve kişisel alarm `chatId` izolasyonu — ağ isteği yok).
Bot token'ı Ayarlar sayfasından girilir (`telegram.botToken`).


## 🎯 Otonom 3D Baskı & Filament Fiyat Radarı

Kullanıcı müdahalesi olmadan çalışan nöbetçi motor. Popüler filamentleri ve
3D yazıcıları SQLite'taki katalogdan okur, **61 mağazada** karşılaştırır ve
yalnızca **stokta + satın alınabilir** en ucuz teklifi Telegram'a kart olarak
gönderir.

### Katı stok filtresi
`teklifStoktaMi()` bir teklifi yalnızca **kanıt varsa** eler:

- `inStock:false`, `stock:false/0`, `outOfStock:true`, `addToCart:false`
- `availability` içinde `OutOfStock` / `SoldOut` / `BackOrder`
- stok metninde `Tükendi`, `Stokta Yok`, `Gelince Haber Ver`, `Temin Edilemiyor`

Stok bilgisi **hiç yoksa** teklif elenmez (kanıtsız suçlama yok); ancak
"tükenen mağaza en ucuz olsa bile" asla birinci sıraya yerleşmez. Farklı
renk/varyant (`renkAyni:false`) da elenir. Fiyat okunamıyorsa teklif sayılmaz.

### Zamanlama ve cooldown
- Varsayılan **4 saatte bir** (Ayarlar'dan 1–24 saat), ürünler arasında **2 sn**
  nefes payı (`radar.urunArasiMs`).
- Aynı ürün için bildirim yalnızca şu durumlarda gider:
  1. fiyat **düştüyse**,
  2. stoktaki en ucuz **mağaza değiştiyse**,
  3. son paylaşımdan **48 saat** geçtiyse.
- Tek turda en fazla 5 bildirim (`donguBasina`) — ilk kurulumda 13 ürünün
  hepsi tek seferde gönderilmez.
- Stokta teklif yoksa sessizce kaydedilir; ürün yeniden stoğa girdiğinde
  "yeniden stokta" bildirimi gider.

### Kart biçimi

```
🎯 OTONOM FİYAT RADARI: GÜNCEL EN UCUZ
━━━━━━━━━━━━━━━━━━━━
🧵 eSun ePLA-HS (High Speed) PLA Siyah 1kg
━━━━━━━━━━━━━━━━━━━━
🏆 Stoktaki En Ucuz: ₺389,00
🏪 Mağaza: Robotistan
🚚 Kargo: Ücretsiz Kargo
⚖️ Birim Fiyat: ₺389,00 / kg
✅ Stok Durumu: Doğrulandı — Satın Alınabilir
(⚠️ 3 tükenen/stokta olmayan mağaza elendi)
━━━━━━━━━━━━━━━━━━━━
📊 Diğer Stoklu Seçenekler:
• Robitshop: ₺415,00
• Trendyol: ₺445,00
━━━━━━━━━━━━━━━━━━━━
💡 Diğer mağazalara göre ₺56,00 tasarruf!
🏷️ @EnUcuzNerede | Otonom Fiyat Radarı
```

Butonlar: **🛒 Stoktaki En Ucuz Mağazaya Git** (afiliye link) ve
**🌐 Karşılaştırmayı Aç** (`PUBLIC_URL/?url=…`). Kısmi taramada kart
"n site yanıt vermedi" notunu düşer; "61 mağazanın en ucuzu" iddia edilmez.
Gramaj/hacim yoksa `₺/kg` / `₺/L` uydurulmaz; mağaza başlığında gramaj yoksa
hedef ürünün katalog ağırlığı yedek olarak kullanılır (farklı gramaj varsa
mağaza başlığı esas alınır).

### Ayarlar
Ayarlar → **🎯 Otonom Fiyat Radarı (3D Baskı)**:

- `[x] Otonom 3D Baskı Fiyat Avcısını Etkinleştir`
- Kontrol aralığı (saat) — varsayılan 4
- Bildirim sohbeti (boşsa `telegram.chatId` → `firsat.kanal`)
- `[🧪 Şimdi Otomatik Taramayı Çalıştır]` — arka planda başlar, ilerleme
  çubuğu gösterir; sohbet tanımlı değilse mesaj göndermez, yalnızca tarar.
- Takip kataloğu: ürün ekle / çıkar / varsayılana dön (13 ürün, `radar_katalog`).

Tüm alanlar **otomatik kaydedilir** (kısmi gövde; diğer ayarlar ezilmez).
Radar varsayılan olarak **kapalıdır** — açmadan hiçbir tarama yapılmaz.

### API

```bash
GET    /api/radar/durum                 # ayar + katalog + ilerleme + son gönderimler
GET    /api/radar/katalog               # takip listesi
POST   /api/radar/katalog               # { ad, sorgu?, url?, kategori? }
DELETE /api/radar/katalog/:id
POST   /api/radar/katalog/sifirla
POST   /api/radar/calistir              # { gonder?, kuru?, zorla?, limit?, bekle? }
```

`bekle:true` senkron çalışır (CLI/test); aksi halde arka planda başlar.
`kuru:true` hiçbir ağ isteği atmadan yalnızca durum üretir.

Test: `npm run test:radar` (177 kontrol, ağ isteği yok).


## 3D baskı modülü

### Maliyet formülü

```
hammadde   = (makara fiyatı / makara gramı) × model gramı
elektrik   = (model gramı / 12,5 g-sa) × 150 W × 2,90 TL/kWh
parça      = hammadde + elektrik
adet       = ⌊makara gramı / model gramı⌋
metre      = gram / (kesit × yoğunluk)
```

Varsayımlar `.env` ile değiştirilebilir; sonuçla birlikte döndürülür.

### Birim fiyat

`birimFiyatHesapla(baslik, fiyat)`:
- 1 kg / 1000 g / 500 g / 2.5 kg / 2500 g / 5 kg
- 1000 ml / 1 L / 500 ml
- Yalnızca filament/reçinede hesap; yazıcı/aksesuarda `null`.

---

## Testler

```bash
npm run test:swr          # SWR / snapshot / URL normalizasyonu
npm run test:typeahead    # arama önerileri + ₺/kg rozeti
npm run test:3d           # 3D baskı maliyet + çap/hammadde
npm run test:kdv          # KDV dahil fiyat düzeltmesi
npm run test:push         # Web Push + sepet paylaşımı
npm run test:bakim        # SQLite WAL/önbellek bakımı
npm run test:ux           # UX + WCAG kontrast + bento
npm run test:ui           # tasarım sistemi sözleşmesi
npm run test:ayar         # ayar kaydı kalıcılığı
npm run test:firsat       # otonom fırsat kanalı
npm run test:radar        # otonom 3D fiyat radarı (stok filtresi + cooldown)
npm run test:telegram     # Telegram asistanı (arama/buton/SWR/takip)
npm run test:telegram-radar  # Telegram radar komutları + kişisel alarm
npm run test:link         # linkte ara
npm run test:gecmis       # son aramalar linkleri
npm run test:stok         # stok sıralama (npm dışı: node scripts/test-stok.mjs)
```

Bazı testler canlı sunucu ve `.env` içindeki `ERISIM_ANAHTARI` değerini
gerektirir. Test dosyaları anahtarı **ortam değişkeninden** okur; depoda
sabit sır tutulmaz.

---

## Güvenlik

- `.env` **asla** commit edilmez (`.gitignore`).
- `data/` (SQLite, 14+ GB önbellek, loglar) hariç tutulur.
- API anahtarları yalnızca sunucuda; `/api/settings` özel anahtarları maskeleyerek döner.
- Paylaşılan sepet linkleri salt okunur; 30 gün sonra silinir.
- Harici bağlantılarda `rel="noopener sponsored"`.

> Anahtar sızması şüphesinde tüm sağlayıcı anahtarlarını döndürün ve
> `ERISIM_ANAHTARI` değerini değiştirin.

---

## Lisans

Bu depo henüz bir lisans dosyası içermiyor. Tüm hakları saklıdır.
