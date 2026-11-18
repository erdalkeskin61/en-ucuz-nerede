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
- 30/60/90 günlük fiyat geçmişi, dip fiyat / ortalama / tavan analizi.
- **Sahte indirim radarı V2**: şişirilmiş etiket, gerçek dip fırsat ve piyasa
  normali ayrımı; sonuç web kartlarına ve Telegram'a yansır.
- 30 günlük trend grafiği (Chart.js, gerçek veri yoksa uydurma çizgi yok).
- Muadil ürün önerileri (stok yok / bütçe aşımı).
- 🔁 **EVREN dayanıklılığı**: 503/429 otomatik yeniden deneme (jitter + `resets_at`),
  YZ kesintisinde deterministik eşleştirme kurtarması (ürün elenmez).
- 📢 Fırsatlar Telegram **ve WhatsApp** kanalına otomatik gider (WhatsApp Markdown,
  4 sağlayıcı, hata izolasyonu).

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
| `/radar`, `/radar_durum` | Herkes | 🟢/⚪ durum, katalog sayısı, son tur, stoktaki dip fiyatlar + `[🧪 Şimdi Taramayı Başlat]` ve `[📋 Kataloğu Listele]` |
| `/radar_liste` | **Yönetici** | Takip kataloğu (ID + kategori + ad + güncel dip fiyat) — herkesin kişisel listesi için `/liste` |
| `/radar_tara` | **Yönetici** | `radarBaslat({ zorla:true, gonder:true })` — arka planda 61 mağaza |
| `/radar_ekle <ürün adı>` | **Yönetici** | `katalogEkle({ ad, sorgu })` — ör. `/radar_ekle Polymaker PolyTerra PLA Beyaz 1kg` |
| `/radar_sil <ID \| ürün adı>` | **Yönetici** | `katalogSil(id)` — ürün, durum ve grafik geçmişi silinir |

Yönetici = `settings.telegram.chatId` (radar bildirim sohbeti de kabul edilir).
Yabancı kullanıcı yönetim komutunu denerse
`⚠️ Bu komut yalnızca sistem yöneticisine açıktır.` yanıtı alır; arama, `/liste`
ve kişisel alarmlar herkese açıktır. Radar kartlarındaki
**🔔 Fiyatı Takibe Al** butonu `alarm:takip:radar:<katalogId>` callback'i ile
kullanıcıya özel alarm kurar.

### 🔎 Inline mode (viral paylaşım)

Herhangi bir sohbette `@erdal_fiyat_takip_bot Creality Ender PLA` yazıldığında
klavyenin üstünde **en ucuz 3 canlı teklif** açılır; tek dokunuşla gruba
gönderilir (mağaza butonları + karşılaştırma linki ile).

- Kaynak: SQLite `snapshot` (son 7 günün gerçek taramaları) + radar kataloğu.
  **Ağ isteği yapılmaz** → Telegram'ın kısa süre sınırında (≈1 sn) yanıtlanır.
- Türkçe-duyarlı katlama: `İSTANBUL`/`istanbul`, `Şişli`/`sisli` eşleşir.
- **Alaka koruması:** tek ortak kelime (ör. yalnızca "pla" veya "1kg") artık
  sonuç üretmez; ifade eşleşmesi yoksa kelime kapsamı ≥%50 olmalı. Önceden
  "Asistan Inline Test PLA" gibi bir arama alakasız Porima/Sunlu ürünlerini
  döndürüyordu.
- Tükenen mağazalar inline'da önerilmez.
- Önbellekte sonuç yoksa "canlı ara" kartı çıkar: bota giden deep-link
  (`?start=ara_<base64>`, ≤64 karakter) 61 mağaza taramasını başlatır.
- BotFather'da inline mode **açık olmalı**: `/setinline` →
  ör. `Fiyat ara (61 mağaza)`; placeholder zorunlu.
- `cache_time: 120 sn`, `is_personal: false` (herkese aynı, hızlı).

### 📈 Canlı fiyat trend grafiği (fotoğraflı kart)

Radar bildirimi ve kişisel fiyat alarmı artık **`sendPhoto`** ile gider:
üstte 90 günlük yeşil dip fiyat eğrisi (PNG), altta mağaza/kargo/birim fiyat
detayları ve satın alma butonları (caption + `reply_markup`).

- `src/grafik.js`: saf Node PNG kodlayıcı (`node:zlib`) — **ek bağımlılık yok**,
  derleme yok, ~30 KB görsel, ~5 ms çizim. Canvas/sharp gerekmez.
- `src/fiyatGrafik.js`: grafiğin **tek veri girişi** (`fiyatGrafigiUret`) —
  SQLite'tan `radar_gecmis` + `price_history` okur, birleştirir, PNG üretir.
  Veri yoksa `null` döner; hata fırlatmaz.
- Gerçek veri: `radar_gecmis` (saatlik örnekleme, değişimde anında kayıt) +
  aynı ürünün `price_history` kayıtları (`pid` ile birleşir). **2 noktadan az
  veri varsa grafik üretilmez** ve metin kartı gönderilir — uydurma eğri yok.
- `sendPhoto` başarısız olursa (boyut/format/API hatası) otomatik olarak
  `sendMessage` metin kartına düşer; bildirim kaybolmaz.
- `katalogSil()` ürünün `radar_gecmis` kayıtlarını da siler; 180 günden eski
  trend kayıtları açılışta temizlenir.

### Dayanıklılık
- Token yoksa bot çökmez; uyarı basıp bekler. Token geçersizse (401/404) polling durur.
- Tüm metinler `esc()` ile HTML-escape edilir (parse hatası yok).
- Sohbet başına sıralı kuyruk: peş peşe aramalar botu kilitlemez.

Test: `node scripts/test-telegram-bot.mjs` (88 kontrol) ·
`node scripts/test-telegram-radar.mjs` (103 kontrol; admin koruması, komutlar,
callback'ler ve kişisel alarm `chatId` izolasyonu) ·
`node scripts/test-telegram-inline-grafik.mjs` (96 kontrol; inline mode,
deep-link, PNG grafik, caption sınırı, `radar_gecmis` birleşmesi — ağ isteği yok) ·
`node scripts/test-telegram-assistant.mjs` (43 kontrol; admin CRUD gerçek SQLite,
`fiyatGrafigiUret` PNG imzası, `InlineQueryResultArticle` sözleşmesi).
Bot token'ı Ayarlar sayfasından girilir (`telegram.botToken`).


## 📊 Canlı "Filament & 3D Yazıcı Borsası" vitrini

Ana sayfa artık boş bir arama kutusuyla açılmıyor: otonom radarın
`radar_durum` tablosundaki **stoktaki en güncel dip fiyatlar** finans ekranı
gibi bento kartlarda listelenir.

```
🟢 🧵 Creality Ender PLA Gri 1kg    ₺758,65    Ventatek   ₺758,65 / kg · Ücretsiz Kargo
🟢 🧵 Porima PLA Siyah 1.75mm 1kg   ₺823,42    Teknik Filament 3D   %19 İndirim
🟢 🖨️ Bambu Lab P1S 3D Yazıcı      ₺24.340,41 3Dcim      Ücretsiz Kargo   [sparkline]
⚪ 🖨️ Elegoo Neptune 4 Pro          ₺55.028,00 Hepsiburada · Kargo bilinmiyor
```

- **Kart:** stok durumu noktası, kategori ikonu, ürün adı, tabular fiyat,
  mağaza, ₺/kg (veya ₺/L) birim fiyat, kargo, önceki fiyata göre fark (↑/↓),
  gerçek geçmişten mini sparkline ve afiliye "Mağazaya git" bağlantısı.
- **Rozet dürüstlüğü:** `🔥 En Dip Fiyat` yalnızca ürünün **gerçek** birleşik
  geçmişindeki (radar_gecmis + price_history) minimuma eşitse, **en az 3 gözlem**
  varsa ve seride **en az 2 farklı fiyat** bulunuyorsa gösterilir. Düz seri
  ("612, 612") dip sayılmaz — fırsat iddiası kurulamaz (2026-11-03). Aksi hâlde `Mağazalar arası %N fark` rozeti
  gösterilir — bu oran mağazanın **etiket indirimi değil**, stokta olan en pahalı
  mağaza ile en ucuz arasındaki gerçek farktır (2026-11-03'te "İndirim" yazımı
  yanıltıcı olduğu için düzeltildi). %60 üzeri oran büyük olasılıkla farklı paket
  boyutudur → rozet **gösterilmez** (ör. ölçülen "%88 indirim" vakası).
- **Sıralama:** stokta olanlar önce, fiyat artan; tükenenler listenin sonunda
  ⚪ olarak (gizlenmez, dürüstçe işaretlenir).
- **Tazeleme:** 60 sn'de bir sessiz yenileme (sekme görünürken) + ↻ düğmesi +
  `visibilitychange`. Skeleton shimmer ile yüklenir; veri yoksa "Borsa henüz
  açılmadı" durumu gösterilir.
- **Gizlilik:** `/api/vitrin` herkese açık, salt okunur ve yalnızca fiyat
  alanlarını döner (token/chatId/PID yok). Erişim anahtarı tanımlı olsa bile
  bu **tek GET** ucu muaftır; ziyaretçi anahtar girmeden piyasayı görür.
- **Erişilebilirlik:** `aria-live="polite"`, odak halkası, 38px dokunma hedefi,
  `prefers-reduced-motion` desteği, koyu tema ve mobil 2/1 kolon düzeni.

### ⚡ Arama çubuğu: yazım hatası toleransı + kategori ikonu

150 ms debounce'lu typeahead artık harf hatasını da affeder ve satır ikonu
ürün türünü gösterir:

```
ban…   → 🖨️ Bambu Lab P1S 3D Yazıcı
         🖨️ Bambu Lab A1 Mini 3D Yazıcı
esu…   → 🧵 eSun ePLA-HS High Speed Siyah 1kg
         🧵 eSun PLA+ Beyaz 1kg
por…   → 🧵 Porima PLA Filament Beyaz 1kg
         🧵 Porima Hyper PLA+ Filament 1kg
```

Katalog adları **ürün türüyle** yazılır ("… 3D Yazıcı", "… 1kg") — satır tek
başına anlaşılsın ve kategori ikonu doğru çıksın diye (2026-11-03).

`GET /api/search-suggestions?q=&limit=` (2+ karakter, `no-store`): ölçülen yanıt
**1–3 ms** (ısınmış ortalama ~2,5 ms). Kaynaklar: kişisel geçmiş, takip edilenler,
son taramalar ve popüler katalog. **Tekilleştirme:** aynı ürün hem geçmişte hem
katalogda varsa (`Creality K1 Max 3d Yazıcı` ↔ `… 3D Yazıcı`) yalnızca en yüksek
puanlı kayıt gösterilir.

- `puanla()`: Levenshtein mesafesi 1 (≥3 harf) → 54/55 puan, mesafe 2 (≥6 harf)
  → 50. Bu puan düz alt-dize eşleşmesinden (45) yüksektir, böylece doğru ürün
  öne çıkar; geçmiş/takip bonusu yalnızca gerçek eşleşmede (60+) uygulanır.
- `kategoriBul()`: "3D Yazıcı/printer" → 🖨️; filament/reçine anahtar kelimesi →
  🧵 ("Creality Ender PLA+ 1 kg" marka yazıcı olsa da filamente ait);
  diğerleri 📦.

### 📱 Mobil alt gezinme (4 buton)

| Buton | Davranış |
|---|---|
| 🔍 **Ara & Kıyasla** | Arama kutusuna kaydırır ve odaklar |
| 🔥 **Dip Fırsatlar** | Borsa vitrinini gösterir, üst barın altına hizalar, tazeler |
| 🔔 **Alarmlarım** | `/api/tracked` → kişisel fiyat alarmları modalı |
| ⚙️ **Ayarlar** | `/ayarlar.html` |

"📢 Fırsatlar" alt bardan çıkarıldı; vitrin başlığındaki **Fırsatlar** çipi ve
masaüstü menüsü aynı modalı açar. Sepet sayfa içinde erişilebilir durumda.
Alt bar `env(safe-area-inset-bottom)` ile çentikli ekranlarda güvenli,
`grid-template-columns: repeat(4, 1fr)` ile eşit genişlikte.

Test: `npm run test:vitrin` (72 kontrol: sıralama, rozet dürüstlüğü, gizlilik,
API/erişim muafiyeti, HTML/JS/CSS sözleşmeleri).

## 🔴 Ürün kimliği hatası — "Kobra 2 Neo" kartı "Kobra 4"e gidiyordu (2026-11-04)

Kullanıcı bildirimi: Telegram'da borsa kartı **🖨️ Anycubic Kobra 2 Neo — ₺17.000**
diyordu; "Stoktaki en ucuz mağazaya git" ise Hepsiburada'daki **Anycubic Kobra 4**
ilanına götürüyordu.

Kök neden **iki katmanlıydı** ve denetim aynı sınıftan **3 ürün** buldu:

| Katalog ürünü | Eşleşen (yanlış) ilan | Neden |
|---|---|---|
| Anycubic Kobra 2 Neo | Anycubic **Kobra 4** (₺17.000) | Kaynak arama "Kobra 2 Neo" yerine Trendyol'daki **"Kobra X"** ilanını seçti; kaynak "Kobra X" olunca "Kobra 4" adayı eşleşti |
| eSun PLA+ Beyaz 1kg | eSun **PLA+HS** (High Speed) | Kaynak aramada ürün hattı kontrolü yoktu |
| Sunlu PLA+ Filament 1kg | Sunlu **Silk PLA+** | Aynı — "silk" hattı düz PLA+ ile karıştı |

**Düzeltmeler (6 katman):**

1. `modelSerisi()` artık **tek harfli model sonekini** tanır: "Kobra X",
   "iPhone X", "Ender Z". Önceden yalnızca "Kobra 2 / Kobra 4" gibi sayılı
   modeller yakalanıyordu; "Kobra X" hiçbir model göstergesi üretmiyordu.
   RAL/PANTONE **renk kodları** model serisi sayılmaz.
2. `sorguPuanla()` (kaynak arama) **model serisi + ürün hattı/malzeme +
   kapasite** çakışmalarını zorunlu uygular.
3. Kaynak aramada **marka ve renk** doğrulaması (`kaynakEslesirMi`): kelime
   örtüşmesi yetmez. Ölçülen hata: "Sunlu PLA+ Filament 1kg" sorgusunda
   **"Solid Hyper PLA+ Nane Yeşili"** (farklı marka + renk) kaynak seçilmişti.
   Türkçe iyelik ekli renkler de tanınır ("Nane **Yeşili**" → yeşil).
4. `hatCakismasi()` malzeme tabanlı alt hatları tanır: **PLA-CF** (karbon fiber),
   **PLA+HS** (high speed), `LW`, `ESD` — bitişik (`plaplushs`) ve ayrı
   (`pla hs`) yazımların ikisi de. **PLA+ ile PLA ayrı boyuttur**: `PLA+` işareti
   normalizasyonda kaybolduğu için "Sunlu PLA+" ile "Sunlu Silk PLA+" ve düz PLA
   eşleşiyordu.
5. `matchProducts`: marka alanı **boşsa başlıktan marka çıkarılır**
   (`muhtemelMarka`). Trendyol kaynağında `brand` boş geldiği için
   "eSun … Kemik Beyazı" ile **"Filamix … Kemik Beyazı"** eşleşiyordu.
   Marka farklıyken "neredeyse birebir" eşiği **ham** benzerlikle ölçülür —
   marka kelimeleri çıkarılınca iki başlık yapay olarak 1.00 görünüyordu.
6. `teklifKategoriyeUygunMu()` son güvenlik ağı: kaynak bir şekilde yanlış
   çözülse bile katalog adıyla model serisi çakışan teklif **elenir** — fiyat en
   ucuz olsa bile yanlış ürün satın aldırılmaz.
7. **Aksesuar/aykırı fiyat koruması:** 3D yazıcı kategorisinde aksesuar yazıcı
   fiyatı gibi görünebiliyor. "Bambu Lab A1/A1 Mini **Enclosed Kit**" ₺2.846
   gösteriliyordu (yazıcı ₺14.020). `enclosed/enclosure/aksesuar/upgrade`
   sözcükleri elenir; ayrıca medyanın %50'sinin altındaki teklif (en az 3 teklif
   ve eleme sonrası ≥2 kalıyorsa) düşürülür.

Ek olarak: kaynak URL çözülemediğinde eski `radar_durum` kaydı **artık
temizleniyor** (`kaynakYokDurumu()`). Önceden kaynak bulunamazsa eski hatalı kart
borsada kalmaya devam ediyordu. Artık ürün dürüstçe "stokta teklif yok" olur ve
borsadan düşer.

**Doğrulama:** `npm run denetim:kimlik` → 19/19 kart uyumlu, 0 çakışma
(marka + model serisi + ürün hattı + kapasite). Denetim 3 gerçek hatayı buldu,
tümü düzeltildi; aynı sınıf hata kalıcı olarak test edilir.
Kobra 2 Neo Türkiye'de yalnızca yedek parça olarak satılıyor (11 mağaza tarandı:
Trendyol, Hepsiburada, n11, Amazon, MediaMarkt, Vatan, Teknosa); yazıcının kendisi
hiçbirinde yok → kart doğru şekilde borsadan çıktı.

Test: `SORGU-ESLESME 42/42` (23 yeni kimlik kontrolü).


## 🛡️ Tarama dayanıklılığı — "borsa en ucuzu göstermiyor" düzeltmesi (2026-11-03)
Kullanıcı bildirimi: borsada **Creality K1 Max** için Vatan Bilgisayar ₺37.799
gösteriliyordu, oysa fixx3d'de ₺36.228,98 idi. Kökte **dört ayrı hata** vardı:

| # | Hata | Etki | Düzeltme |
|---|------|------|----------|
| 1 | **Kazıma havuzu yuva sızıntısı**: `acquire()` yuvayı alıyor, `releaseSlot()` hiç çağrılmıyordu | 8 istekten sonra havuz kalıcı doluyor, **tüm kazıma kilitleniyor** (tarama 27 sn'de dondu) | Üç sağlayıcının (ScraperAPI / Crawlbase / ZenRows) `finally` bloğunda yuva geri veriliyor |
| 2 | **Duvar saati zaman aşımı**: 10 sn sabit, istekler 8'li kuyrukta beklerken de sayılıyordu | 61 sitenin **38'i** hiç çalışmadan "timeout" | **İlerleme temelli** zaman aşımı: kuyrukta bekleme sayılmaz, gerçek ilerleme sayacı sıfırlar, 90 sn sert üst sınır |
| 3 | **İkas adaptörü**: mağaza para birimi (USD) TL sanılıyordu + JWT her aramada yeniden çekiliyordu | Yük altında JWT bulunamayınca sorguyu yok sayan render yedeğine düşüyor, ürün yerine aksesuar inceliyordu | `currencyCode` kontrolü (TRY değilse fiyat **null**, uydurma yok), 30 dk kimlik önbelleği, 401/403'te yenileme, render yedeği sorgu kelimeleriyle süzülüyor |
| 4 | **YZ yıl ekini reddediyordu**: "K1 Max" ↔ "K1 Max **2025**" farklı ürün sayıldı; ardından zayıf aday ("Ender 5 Max") eşleşti | Doğru/en ucuz teklif kayboldu | Yıl/sürüm eki (`2024–2036`, `v2`, `2. nesil`, "yeni sürüm") **deterministik** olarak aynı ürün sayılır; YZ'ye sorulmaz |

Ek olarak eşleştirmeye iki koruma eklendi:

- **Model serisi çakışması:** iki başlıkta da model göstergesi varsa ve ortak
  değilse (`K1` ↔ `Ender 5`) ürün **reddedilir**. Ölçü birimi izleyen sayılar
  (`Filament 1.75mm`, `Max 3d`) model sayılmaz; barkod/model kodu birebir
  eşleşmesi bu korumayı devre dışı bırakır (kesin kimlik üstündür).
- **Kapasite çakışması:** `8GB` ↔ `16GB`, `500GB` ↔ `1TB`, `60Hz` ↔ `144Hz`
  farklı üründür (birimler ortak tabana çevrilerek kıyaslanır).
- **YZ koruması:** YZ daha yüksek benzerlikli bir adayı reddettiyse, ondan daha
  zayıf bir aday yalnızca başlık benzerliğiyle kabul **edilmez** — dürüst cevap
  "bulunamadı"dır.

Ayrıca borsa limiti 12 → **24** (pahalı yazıcılar listeden kesilmiyordu) ve
`SITE_TIMEOUT_MS` ortam değişkeni eklendi (varsayılan 30 sn).

**Ölçüm (düzeltme sonrası, 61 site):** 26–28 site bulundu · **0 timeout** ·
14–21 sn · en ucuz **FIXX3D ₺36.245,36** (site fiyatıyla birebir).
Öncesi: 38 timeout, 18–23 site, fixx3d rastgele kayboluyordu.

Test: `node scripts/test-tarama-dayaniklilik.mjs` (37 kontrol; `--canli` ile
gerçek 61 site taraması + borsa doğrulaması → 46 kontrol).

## 🧮 3D Baskı Maliyet & Kârlılık Hesaplayıcı

Atölyeler ve maker'lar için interaktif hesaplayıcı: dilimleyiciden alınan **gramaj**
ve **baskı süresi** ile parça başı gerçek maliyeti ve önerilen satış fiyatını
hesaplar, sonra o parçayı en ucuza basabileceğiniz **filamenti canlı piyasadan**
bulur. Sayfa: **`/maliyet.html`** (ana menüde 🧮 Maliyet).

### 🧩 STL / 3MF Model Radarı (dosyadan doğrudan gramaj)

Maliyet hesaplayıcıya **model dosyası** bırakılabilir: gramaj ve süre elle
girilmez, dosyadan çıkarılır.

```
public/stlParser.js   ← saf JS ayrıştırıcı (harici kütüphane YOK)
public/maliyet.html   ← dropzone + sonuç kartı + doluluk/malzeme seçici
public/maliyet.js     ← bağlama, canlı filament eşleştirme, gramaj aktarma
```

**%100 istemci taraflı.** Dosya sunucuya **hiç gönderilmez** (tarayıcıda
doğrulandı: STL işlenirken **0 ağ isteği**). Yalnızca filament *fiyatı* mevcut
`/api/baski` uçlarından gelir.

#### Hacim matematiği

Her üçgen için işaretli dörtyüzlü hacmi köşe noktasına göre toplanır:

```
V_i = 1/6 · det([v1, v2, v3])
V_toplam = |Σ V_i|          → mm³
V_cm³ = V_toplam / 1000
```

Kapalı (manifold) yüzeyde iç yüzler birbirini götürür → sonuç **orijin
seçiminden bağımsızdır**. Test bunu doğrular: orijine oturan küp de,
merkezlenmiş küp de **8000 mm³** verir.

#### Format desteği

| Format | Yöntem |
|---|---|
| **Binary STL** | `84 + N×50 === boyut` kontrolü → `DataView.getFloat32` ile toplu okuma |
| **ASCII STL** | `vertex x y z` regex taraması |
| **3MF** | ZIP yerel başlık taraması → `3D/3dmodel.model` → deflate-raw (`DecompressionStream` / `zlib`) → XML |

3MF birim ölçeklemesi desteklenir (`millimeter`, `centimeter`, `inch`, `meter`, `micron`).
ZIP imzası (`50 4B`) magic byte ile algılanır — uzantı yanlış olsa da doğru
ayrıştırıcı seçilir.

#### Doluluk ve gramaj

```
etkinDoluluk = 0.18 + (1 − 0.18) × (infill / 100)     ← %18 kabuk her zaman katı
gram         = V_cm³ × etkinDoluluk × yoğunluk
```

| Malzeme | Yoğunluk (g/cm³) |
|---|---|
| PLA / PLA+ | 1,24 |
| PETG | 1,27 |
| ABS | 1,04 |
| TPU | 1,21 |
| ASA | 1,07 |

Örnek: 8 cm³ model, PLA, %20 doluluk → `8 × 0.344 × 1.24 = 3,41 g`

#### Arayüz

- **Dropzone** — sürükle-bırak, tıklama, klavye (Enter/Space); sürükleme vurgusu
- **Boyutlar** (G×D×Y mm) · **Hacim** (cm³ + mm³) · **Ağırlık** (vurgulu kart)
- **Doluluk** seçici (%10 / %20 / %40 / %100) ve **Malzeme** seçici — değişince
  anında yeniden hesaplanır
- **Akıllı satın alma kartı** — seçilen malzemeye en yakın **canlı en ucuz stoklu**
  filament: mağaza, ürün, ₺/kg, parça başı hammadde ve *1 makara ile N adet*
- **`⬇️ Bu gramajı hesaplayıcıya aktar`** — gramajı maliyet motoruna yazar;
  aşağıdaki döküm (hammadde / elektrik / amortisman / net / satış) güncellenir

Sınırlar: **100 MB**, `.stl` / `.3mf`. Bozuk veya açık (kapalı olmayan) mesh'te
uydurma hacim üretilmez — açık hata mesajı verilir. Şeffaf/boş dosya, eksik
üçgen, desteklenmeyen sıkıştırma ayrı ayrı raporlanır.

#### Performans (ölçüldü)

| Dosya | Süre |
|---|---|
| 47,7 MB binary STL · 1.000.000 üçgen | **158 ms** |
| 20 mm küp (12 üçgen) | < 1 ms |

Hedef 250 ms idi; ölçüm bunun altında.

Test: `npm run test:stl` — **75 kontrol**: binary/ASCII/3MF ayrıştırma, hacim
doğruluğu (±%0,1), orijin bağımsızlığı, bounding box, gramaj formülü, malzeme
yoğunlukları, hata yönetimi, performans ve istemci-taraflılık sözleşmesi.


### Girdiler

| Girdi | Aralık | Varsayılan |
|---|---|---|
| ⚖️ Model gramajı | 1 – 1000 g (slider) / 100 000 g (elle) | 160 g |
| ⏱️ Baskı süresi | 0,5 – 72 sa (+ "✨ Tahmin et") | 4 sa |
| ⚡ Yazıcı modeli | 6 şablon + manuel W | P1S/X1C · 150 W |
| 🧵 Filament | canlı radar listesi **veya** manuel ₺/kg | en ucuz stoklu |
| 💡 Elektrik | ₺/kWh | ₺2,90 |
| 🛠️ Yıpranma | ₺/saat | ₺3,00 |
| 💰 Kâr marjı | %50 – %300 (slider) / 1.5x · 2x · 2.5x · 3x | %150 (2.5x) |

Hazır yazıcı güç şablonları: **Bambu Lab P1S/X1C (150 W)**, **A1 Mini (100 W)**,
**Creality K1C/K1 Max (350 W)**, **Ender 3 V3 KE (150 W)**, **Anycubic Kobra 2 Neo
(120 W)**, **Özel/Manuel**. Seçim yapılınca Watt alanı otomatik dolar.

### Formüller (istemci ve sunucu BİREBİR aynı)

```
Hammadde   = (gramaj / 1000) × ₺/kg
Elektrik   = (W × saat / 1000) × ₺/kWh
Amortisman = saat × ₺/saat
Net        = Hammadde + Elektrik + Amortisman
Satış      = Net × kâr çarpanı
```

Spec örneği (160 g · ₺532,21/kg · 150 W · 4 sa · ₺2,90 · ₺3/sa):
`₺85,15 + ₺1,74 + ₺12,00 = ₺98,89` → başabaş **₺99**, hobi **₺198**,
atölye **₺247**, ticari **₺297**. Test bu değerleri birebir doğrular.

**Hesap tamamen tarayıcıda** yapılır (slider oynarken 0 ms gecikme); sunucuya
yalnızca şablonlar, canlı filament listesi ve teklif doğrulaması için gidilir.

### API

| Uç | Döndürür |
|---|---|
| `GET /api/baski/yazicilar` | 6 güç şablonu + kâr şablonları + varsayılanlar |
| `GET /api/baski/en-ucuz-filamentler?limit=20` | `radar_durum`dan **stoklu** filamentler, ₺/kg artan |
| `POST /api/baski/hesapla` | Maliyet dökümü + 4 fiyat seviyesi + teklif metni |

`POST` gövdesi: `{ gramaj, sureSaat, gucW, kwhTl, yipranmaSaatTl, karCarpani,
filamentId }` **veya** `filamentTlKg`. `filamentId` verilirse fiyat **sunucuda
tazelenir** (bayat fiyatla teklif üretilmez); kayıt stoktan düşmüşse `404` döner.

### Afiliye dönüşümü (CTA)

Hesap sonucunun altında gerçek en ucuz filament bir kartla sunulur:

> 💡 Bu modeli en ekonomik maliyetle basabileceğiniz filament şu anda
> **₺532,21/kg** ile **Trendyol** mağazasında stokta!
> `[ 🛒 En Ucuz Filamenti Satın Al (₺532,21) ]`

Buton mağazanın afiliye linkine gider (`target="_blank"` + `rel="noopener
sponsored"`). CTA **yalnızca canlı modda ve gerçek stoklu kayıt varsa** görünür;
manuel fiyat girildiğinde gizlenir (uydurma mağaza önerisi yok).

### Teklif kopyalama

`[ 📋 Müşteri Fiyat Teklifini Kopyala ]` panoya şu biçimi yazar:

```text
🖨️ 3D BASKI FİYAT TEKLİFİ
• Model Ağırlığı: 160 gram
• Malzeme: Microzey PLA Filament Gri · gri
• Baskı Süresi: ~4 saat
• Birim Fiyat: 247,23 TL (KDV Hariç)

Hazırlayan: En Ucuz Nerede? Baskı Asistanı
```

`navigator.clipboard` yoksa/izin vermezse gizli `textarea` + `execCommand('copy')`
yedeğine düşer; o da başarısız olursa metin sayfada seçilebilir olarak gösterilir.

### Mobil

320 / 375 / 414 / 768 / 1200 px'de **yatay taşma yok** (ölçüldü). Bento ızgara
≤560 px'de tek sütun; dokunma hedefleri ≥40 px, giriş yazı boyutu 16 px (iOS
otomatik zoom yapmaz). Dar ekranda üst menü ikonlara iner.

> **Bulunan iki gerçek mobil hata** (2026-11-04): (1) grid çocuklarında
> `min-width:auto` yüzünden 320 px'de içerik 401 px'e taşıyordu, (2) CSS'te
> `.mz-satır` (noktalı ı) yazıldığı için HTML'deki `.mz-satir` hiç eşleşmiyordu.
> İkisi de düzeltildi ve teste bağlandı.

### Dürüstlük

- Eksik/geçersiz girdide hesap **yapılmaz**; `neden` döner (uydurma sıfır yok).
- Süre girilmezse gramajdan **tahmin edilir** ve `sureTahmini:true` ile işaretlenir.
- Filament listesi yalnızca gerçek kayıtlardan; ₺/kg okunamayan kayıt **girmez**.
- Elektrik tarifesi ve amortisman **varsayımdır**, sonuçla birlikte gösterilir.
- Tüm fiyatlar **KDV hariçtir**.

Test: `npm run test:maliyet` — **127 kontrol** (matematik, dürüstlük, canlı
filament, teklif, HTML/JS/CSS sözleşmesi, mobil regresyonları, sunucu rotaları).


## 🧩 Slicer Eklentisi (Cura · Bambu Studio · OrcaSlicer · PrusaSlicer)

Kullanıcı web sitesine gitmeden, **dilimleme bittiği anda** harcanacak filamenti
ve en ucuz stoklu makarayı öğrenir:

> Bu baskı **340 g Siyah PLA** gerektiriyor. En ucuz alternatif **₺463,68** ile
> **Porima 3D**'de! (Parça maliyeti: ₺157,65)

### API — `GET /api/embed/oner`

```
GET /api/embed/oner?malzeme=PLA&gramaj=340&renk=Siyah&kaynak=cura
```

| Parametre | Zorunlu | Açıklama |
|---|---|---|
| `malzeme` | — | PLA, PETG, ABS, TPU, ASA… (varsayılan PLA) |
| `gramaj` | ✅ | Baskıda harcanacak gram |
| `renk` | — | Türkçe renk adı (Siyah, Beyaz…) |
| `kaynak` | — | `cura` / `bambu` / `orca` / `prusa` (atıf) |

```json
{
  "status": "success",
  "talep": { "malzeme": "PLA", "gramaj": 340, "renk": "Siyah" },
  "enUcuz": {
    "urunAdi": "Porima xPLA Filament Siyah 1kg",
    "magaza": "Porima 3D",
    "fiyat": 463.68,
    "parcaBasiMaliyet": 157.65,
    "makaradanCikanAdet": 2,
    "kalanGramaj": 660,
    "stok": true,
    "yonlendirmeLinki": "https://enucuznerede.com/yonlendir?urunId=4&kaynak=cura"
  },
  "bildirimMetni": "Bu baskı 340 g Siyah PLA gerektiriyor. …"
}
```

**Hesaplama:** `parcaBasiMaliyet = gramaj/1000 × fiyat` ·
`makaradanCikanAdet = floor(1000/gramaj)` · `kalanGramaj = 1000 − (gramaj mod 1000)`

**Özellikler:** CORS `*` · `Cache-Control: public, max-age=60` ·
60 sn bellek içi önbellek · **< 50 ms** (ölçüm: soğuk 0,6 ms, önbellekli ~0,01 ms).

**Dürüstlük:** istenen malzeme/renk stokta yoksa fiyat **uydurulmaz** —
`status:"bulunamadi"` + açıklama döner. PLA sorgusu PETG/ABS/**PLA-CF** önermez
(karbon fiber katkılı makara düz PLA fiyatıyla kıyaslanamaz).

### Slicer eklentileri

| Dosya | Ne yapar |
|---|---|
| `plugins/cura/EnUcuzNerede/` | Cura eklentisi (`plugin.json`, `__init__.py`, `EnUcuzNeredeExtension.py`) |
| `tools/slicer-hook/en_ucuz_slicer.py` | Bambu/Orca/Prusa post-processor |
| `public/slicer.html` | İndirme + 3 adım kurulum rehberi |
| `public/indir/EnUcuzNerede.curapackage` | Cura'ya sürükle-bırak paket (geçerli ZIP) |

**Cura:** `.curapackage` dosyasını Cura penceresine sürükleyin → yeniden başlatın.
Eklenti `sliceProcessFinished` (yoksa `materialAmountsChanged`) sinyaline bağlanır,
gramajı `materialWeights` → yoksa `materialAmounts × 2,98 g/m` ile okur.

**Bambu / Orca / Prusa:** *Print Settings → Output options → Post-processing
scripts* kutusuna dosya yolunu yazın. Betik G-Code'un **son 200 satırındaki**
meta etiketleri okur:

```
; filament used [g] = 340.5
; filament_type = PLA
; filament_colour = #000000
```

`filament used [mm]` varsa grama çevrilir (1,75 mm PLA ≈ 2,98 g/m). Renk kodu
Türkçe ada eşlenir (`#000000` → Siyah).

### Performans ve güvenlik garantileri

| Kural | Uygulama |
|---|---|
| **Dilimleme yavaşlamaz** | Post-processor meta veriyi okur, bildirimi **DETACHED_PROCESS** ile ayrı süreçte başlatır, hemen `exit 0` (ölçüm: 74–179 ms) |
| **G-Code değişmez** | Yalnızca okuma; test hash karşılaştırmasıyla doğrular |
| **Ağ yoksa sessiz** | 1,5 sn timeout; hata yutulur, slicer çökmez |
| **Cura donmaz** | Ağ isteği `threading.Thread(daemon=True)` içinde |
| **Gönderilen veri** | yalnızca malzeme + gramaj (+ isteğe bağlı renk/kaynak) |

Bildirim kanalları: Windows toast (PowerShell) → başarısızsa Tkinter penceresi
(10 sn, "Satın Al / İncele" butonlu); macOS `osascript`; Linux `notify-send`.

Test: `npm run test:slicer` — **119 kontrol** (+ `--canli` ile HTTP):
API matematiği, malzeme ailesi/renk filtresi, dürüstlük, performans, G-Code
ayrıştırma (Bambu/Orca/mm→g/boş), FAIL-SAFE (erişilemeyen API, bozuk JSON,
olmayan dosya), paket doğrulama (`.curapackage` ZIP), CORS/cache/302.

## 🗂️ Katalog Kanonik URL & Kademeli Arama

**Ölçülen sorun:** radar kataloğunda **ID:2 — eSun ePLA-HS (High Speed) PLA
Siyah 1kg** kaydının `url` alanı boştu. Radar her turda
`hizliKaynakUrunBul()` aramasına düşüyor, mağaza arama motorları
"ePLA-HS" + "1kg" birleşiminde **0 sonuç** döndürüyordu. Sonuç:
`kaynakYok: true` → ürün **61 mağazada hiç taranmıyordu**.

Ürün mağazalarda farklı yazımlarla duruyor: *"Esun Pla-hs Yüksek Hızlı Pla
Filament Siyah"*, *"eSun ePLA HS Siyah"*, *"eSun High Speed PLA"*.

### Kademeli sorgu esnetme (`sorguKademeleriUret`)

En özelden en gene doğru kademeler üretilir; **ilk başarılı kademede durulur**
(fazladan ağ isteği yok).

| # | Kademe | Örnek |
|---|---|---|
| 0 | Orijinal | `eSun ePLA-HS (High Speed) PLA Siyah 1kg` |
| 1 | Parantez içi atılır | `eSun ePLA-HS PLA Siyah 1kg` |
| 2 | Tire→boşluk + ölçü atılır | `eSun ePLA HS PLA Siyah` |
| 3 | Gereksiz malzeme atılır (`ePLA` ⊃ `PLA`) | **`eSun ePLA HS Siyah`** ✅ |
| 4 | Tire korunmuş çekirdek | `eSun ePLA-HS Siyah` |

**Varyant koruması:** renk (Siyah ↔ Beyaz) ve malzeme (PLA ↔ PETG/ABS) **asla**
esnetilmez. Her kademede `kaynakEslesirMi()` (model serisi, ürün hattı, marka,
renk) aynı katı kurallarla çalışır.

### Hedef siteler

3D kategorisinde **n11** de taranır:

```js
['trendyol', 'hepsiburada', 'n11', 'robotistan', '3dmarketim', 'samm']
```

### Katalog tohum v4 (otomatik göç)

`KATALOG_SEED_SURUMU = 4`. Mevcut veritabanı sıfırlanmadan yalnız eSun kaydı
güncellenir:

```sql
UPDATE radar_katalog
   SET sorgu = 'eSun ePLA HS Siyah',
       url   = 'http://www.n11.com/urun/esun-pla-hs-yuksek-hizli-pla-filament-siyah-52100650'
 WHERE id = 2;
```

Diğer kayıtlar ve kullanıcının kendi eklediği ürünler **korunur**.

> **Göç hatası (düzeltildi):** tohum sorgusu yalnız `SELECT ad, sira` çekiyordu;
> `id` olmadığı için `esunKaydi.id` `undefined` kalıyor ve UPDATE **sessizce
> çalışmıyordu**. `SELECT id, ad, sira` yapıldı.

### Doğrulanmış sonuç

| | Önce | Sonra |
|---|---|---|
| Katalog `url` | *(boş)* | `n11.com/urun/esun-pla-hs-…` |
| `radar_durum` | `kaynakYok: true` | **FilamentSan ₺929 · stokta** |
| Kaynak çözümleme | 0 sonuç → `null` | kademe 4/5 → **0,8 sn** |
| Radar taraması | hiç yapılmıyordu | 61 mağaza ✅ |

Kanonik URL canlı doğrulandı: N11 "Esun Pla-hs Yüksek Hızlı Pla Filament Siyah",
₺1.046,34, HTTP 200.

Test: `npm run test:katalog` — **53 kontrol** (+ `--canli` ile 57):
kademe üretimi, varyant koruması, puanlama, katalog v4 göçü, radar
entegrasyonu ve kaynak sözleşmesi.


## 🔁 EVREN 503/429 Dayanıklılığı

**Ölçülen gerçek sorun:** PM2 loglarında `[ai:semanticMatch] YZ hatası: YZ API
HTTP 503 model_capacity_exhausted` tekrar ediyordu. Eski kod 503'ü **yeniden
denemiyor**, doğrudan hata atıyordu; `semanticMatch` da `ayniUrun:false` dönüp
**ürünü eliyordu**. Sonuç: doğru eşleşmeler kayboluyor, borsada "en ucuz"
bulunamıyordu.

### Yeniden deneme (`src/ai.js → chatOnce`)

| Kural | Değer |
|---|---|
| Yeniden denenecek kodlar | `429`, `502`, `503`, `504` |
| Deneme sayısı | **3** (ilk çağrı dahil) |
| `resets_at` varsa bekleme | kalan süre, **en fazla 4 000 ms** |
| Yoksa jitter | `(1500 × (deneme+1)) + rastgele(0–500)` ms |
| Tek bekleme tavanı | 4 000 ms |
| **Toplam bekleme tavanı** | **10 000 ms** (sonsuz döngü koruması) |

`resets_at` dört biçimde aranır: `{evren:{resets_at}}`, `{error:{evren:{…}}}`,
`{resets_at}`, `{error:{resets_at}}`.

Geçici hata **hata değil bilgi** olarak loglanır:

```
[ai:chatOnce] EVREN 503 (model_capacity_exhausted) alındı, 4000ms sonra yeniden deneniyor (deneme: 1/3)
```

Her denemede `AbortController` zamanlayıcısı `clearTimeout` ile temizlenir
(soket/bellek sızıntısı yok). Token hiçbir log satırına yazılmaz.

### Deterministik kurtarma (`deterministikKurtarma`)

3 deneme de başarısız olursa (503 / timeout) ürün **körlemesine elenmez**.
Kural tabanlı kanıt aranır:

| Kanıt | Sonuç |
|---|---|
| Model kodu birebir aynı (normalize) | `ayniUrun: true`, güven **0.90** |
| Marka aynı **ve** başlık benzerliği ≥ 0.75 | `ayniUrun: true`, güven **0.80** |
| Marka aynı **ve** ≥ 3 ortak token (benzerlik ≥ 0.5) | `ayniUrun: true`, güven **0.75** |
| Kanıt yok | `ayniUrun: false` (dürüst eleme) |

**Kimlik koruması:** kurtarma, projenin kanıtlanmış kurallarını **atlamaz**.
`modelSerisiCakismasi` / `kapasiteCakismasi` çakışma bulursa ürün reddedilir —
"K1 Max" ↔ "Ender 5 Max", "P1S" ↔ "P1P", "Kobra 2 Neo" ↔ "Kobra 4" 503
bahanesiyle birleştirilemez.

Kurtarma kararı **10 dakikalık** kısa TTL ile önbelleğe yazılır: 503 fırtınası
sırasında aynı çift için YZ tekrar tekrar denenmez, YZ dönünce normal akış
kaldığı yerden devam eder.

### Görsel analizi (`src/gorselArama.js`)

`gorselAnaliz()` 503/429'da **2 sn bekleyip sessizce** tekrar dener (2 deneme).
Atölyede fotoğraf yükleyen kişi kesinti hissetmez; kalıcı hata varsa dürüst
mesaj gösterilir.

### Yan bulgu: "en ucuz bulunamadı" hatası

Bu turda ayrıca **gerçek bir fiyat hatası** bulundu ve düzeltildi.

Canlı ölçüm (eSun PLA+): kaynak mağaza (Trendyol, ₺1.099, **stokta**) sonuçtan
eleniyordu çünkü `pricing.toplam` alanı boştu (yalnız `sellingPrice` vardı).
Sonuç: `enUcuzSite: null`, `ayniRenkSayisi: 0` — stokta ucuz teklif varken
"en ucuz bulunamadı" deniyordu.

Düzeltme: `pipeline.js` artık fiyat kuralını **tek kaynaktan**
(`karsilastirmaFiyati`: `pricing.toplam` → yoksa `sellingPrice`) kullanıyor.
Düzeltme sonrası aynı ürün: **en ucuz Trendyol ₺1.099** ✅

Test: `npm run test:retry` — **64 kontrol** (503→200, 429→200, kalıcı 503
kurtarma, `resets_at` ayrıştırma, kimlik koruması, sonsuz döngü sınırı,
görsel analizi toleransı). `fetch` mock'lanır; gerçek bekleme yapılmaz.


## 🔬 Görsel ile 3D Parça / Filament Tanıma (EVREN qwen3-vl-30b)

Atölyede çalışan kişi elindeki parçanın (nozzle, hotend, step motor, termistör,
etiketi silinmiş makara) model kodunu bilmez. Fotoğraf yükler — sistem parçayı
tanır ve **61 mağazada** en ucuz stoklu fiyatı bulur.

### Akış

```
Fotoğraf (web: sürükle-bırak / Ctrl+V / kamera · Telegram: msg.photo)
   ↓ istemci: en-boy korunarak 1280 px, JPEG %80  (~20 KB)
   ↓ EVREN qwen3-vl-30b  →  JSON (urun, marka, kategori, teknik, uyumlu, sorgu, guven)
   ↓ hizliKaynakUrunBul  →  kanonik ürün URL'si
   ↓ runComparison       →  61 mağaza, stok filtresi, gerçek ödenecek tutar
   ↓ Web rozet + yeşil CTA · Telegram fotoğraf özeti + satın al butonu
```

### 3D donanım uzmanı istemi

Model şu parçaları ayırt edecek şekilde yönlendirilir:

| Grup | Örnek ayırt ediciler |
|---|---|
| Nozzle | M6/M7 diş, 0.2/0.4/0.6/0.8 mm, pirinç / sertleştirilmiş çelik / Volcano / V6 |
| Hotend | Bambu P1/X1, Creality K1/Sprite, E3D V6, MK8 — ısıtıcı blok + termistör farkı |
| Step motor | NEMA 17/14, 42-34 / 42-40, kablo sayısı |
| Termistör | NTC 100K, kartuş / cam boncuk, kablolu |
| Tabla | PEI manyetik, cam, dokulu / pürüzsüz |
| Kayış | GT2 6/9 mm, kasnak 20T |
| Sensör | BLTouch, CR-Touch, endstop |
| Filament | etiketteki **marka + malzeme + renk + gramaj** |

**Halüsinasyon yasağı:** marka/etiket okunamıyorsa `null` döner ve `guven`
`dusuk` olur. `null`, `bilinmiyor`, `belirsiz` gibi değerler otomatik `null`'a
çevrilir. Yanıt JSON değilse "parça tanınamadı" denir — tahmin üretilmez.

```json
{
  "urun": "Bambu Lab P1S / X1C Komple Hotend Grubu",
  "marka": "Bambu Lab",
  "kategori": "hotend_parca",
  "malzeme": null,
  "teknikDetaylar": "0.4mm Nozzle, Seramik Isıtıcı ve Termistörlü",
  "uyumluYazicilar": ["Bambu Lab P1P", "P1S", "X1C"],
  "aramaSorgusu": "Bambu Lab P1S X1C Hotend 0.4mm",
  "guven": "yuksek"
}
```

Kategoriler: `hotend_parca`, `nozzle`, `extruder`, `step_motor`, `termistor`,
`isitici`, `anakart`, `tabla`, `kayis`, `fan`, `sensör`, `guc_kaynagi`,
`filament`, `recine`, `yazici`, `aksesuar`, `diger`.

Güven → yüzde: `yuksek` **%95**, `orta` **%70**, `dusuk` **%45**.

### Fiyat motoru (dürüstlük)

1. **Kanonik yol:** `hizliKaynakUrunBul(aramaSorgusu)` → `runComparison(url)`.
   Sonuçlar `stokSirala` ile sıralanır; **en ucuz yalnızca stokta olanlar arasından**
   seçilir. Tükenen mağaza ucuz olsa bile birinci olamaz.
2. **Yedek yol:** kanonik ürün bulunamazsa hızlı site listesinde doğrudan aranır.
3. **Bulunamazsa:** `bulunamadi: true` + `neden`. Tahmini fiyat **üretilmez**.

Görsel hiçbir mağazaya gönderilmez; yalnızca EVREN'e gider, oradan metin çıkar.

### Web arayüzü

- **Sürükle & bırak** alanı (mavi kesikli çerçeve, nabız animasyonu)
- **Ctrl+V** pano yapıştırma (yalnızca görsel öğe; metin yapıştırmayı bozmaz)
- **Kamera** — `accept="image/*" capture="environment"`
- **İstemci küçültme** — en-boy korunarak ≤1280 px, JPEG %80 (şeffaf PNG'ler
  beyaz zemine oturtulur). Ölçüm: 2400×1800 → 1280×960, **20 KB**
- **✅ Tanınan parça rozeti** (güven rengi: yeşil/amber/kırmızı) + kategori +
  teknik detay + uyumlu modeller
- **🏆 EN UCUZ STOKTA** yeşil CTA → `Mağazaya Git (En Ucuz)` (sponsored)
- Kartlarda 🟢 stokta / 🔴 tükendi rozeti; tükenen kart soluk ve üstü çizili

### Telegram

`msg.photo` (ve fotoğraflı altyazı) yakalanır → `sendChatAction(upload_photo)` →
`getFile` → dosya indirilir → analiz → özet → fiyat kartı.

```
🔬 Tespit Edilen Parça: Bambu Lab P1S / X1C Komple Hotend Grubu
📂 Kategori: 🔥 Hotend / Sıcak Uç Grubu
🏷️ Marka: Bambu Lab
🔧 Teknik: 0.4mm Nozzle, Seramik Isıtıcı
🖨️ Uyumlu Modeller: Bambu Lab P1P, P1S, X1C
📊 Güven Skoru: %95 (yuksek)
⏳ 61 mağazada en ucuz stok aranıyor…
```

Kanonik sonuç varsa **`sonucMesajiOlustur`** ile biçimlendirilir (ikinci tarama
yapılmaz) + `butonlariOlustur` (satın al / takip / detay).

### Güvenlik ve sınırlar

- Görsel boyutu: **4 MB** (base64 çözülmüş) — sunucu tarafı; Telegram indirme 20 MB.
- **Sihirli bayt doğrulaması** (JPEG/PNG/WebP/GIF): görsel olmayan payload EVREN'e
  gönderilmeden reddedilir → API maliyeti ve anlamsız 400 hatası önlenir.
- `config.ai.baseURL` + `AI_VISION_MODEL` (varsayılan `qwen3-vl-30b`).

Test: `npm run test:gorsel` — **99 kontrol** (girdi doğrulama, JSON sözleşmesi,
halüsinasyon yasağı, kategori/güven normalizasyonu, sorgu kademelemesi, fiyat
motoru, Telegram indirme akışı, web sözleşmesi). `--canli` ile gerçek EVREN
(104 kontrol).


## 📢 WhatsApp Fırsat Kanalı

Telegram'daki (`@enucuzneredefirsatlari`) otonom dip fiyat ve radar bildirimlerini
**WhatsApp Kanalları** (`…@newsletter`) ve **gruplarına** (`…@g.us`) taşır.
Türkiye'de WhatsApp kullanımı Telegram'dan çok daha yaygın; fırsatlar gruplarda
hızla yayılır ve afiliye tıklamaları artar.

### Çoklu sağlayıcı

| Sağlayıcı | Yöntem | Alanlar |
|---|---|---|
| `webhook` | Genel gateway (`{chatId, message, imageUrl}` POST) | API URL + (opsiyonel) token |
| `green-api` | `/waInstance{id}/sendMessage/{token}` (görselde `sendFileByUrl`) | Instance URL + token |
| `ultramsg` | `/messages/chat` · `/messages/image` | Instance URL + token |
| `meta` | Meta Cloud API (Graph `/{phoneNumberId}/messages`) | Access Token + Phone Number ID |

Kanal ID doğrulaması: `@newsletter`, `@g.us`, `@c.us` veya uluslararası telefon
(`+90 555…`). Geçersizse gönderim **hiç denenmez**.

### WhatsApp Markdown biçimi

WhatsApp HTML kabul etmez; kendi sözdizimi vardır:

| Biçim | Sözdizimi |
|---|---|
| Kalın | `*metin*` |
| İtalik | `_metin_` |
| Üstü çizili | `~metin~` |
| Tek aralıklı | ```` ```metin``` ```` |

Dışarıdan gelen ürün/mağaza adlarındaki `*`, `_`, `~`, ``` ` ``` karakterleri
**temizlenir** (`whatsappKac`), böylece biçim bozulmaz. HTML varlıkları
(`&amp;`, `&lt;`) düz metne çözülür — `<script>` etiketi metin olarak kalır.

### Üretilen kart

```text
🎯 *OTONOM FİYAT RADARI: GÜNCEL EN UCUZ*
━━━━━━━━━━━━━━━━━━━━
📦 *Creality Ender PLA Filament Gri 1kg*
🏆 *Stoktaki En Ucuz:* *₺758,65*
🏪 *Mağaza:* Ventatek
🚚 *Kargo:* Ücretsiz Kargo
⚖️ *Birim Fiyat:* ₺758,65 / kg
✅ *Stok Durumu:* 🟢 Doğrulandı (Satın Alınabilir)
_(⚠️ 2 tükenen/stokta olmayan mağaza elendi)_
📊 *Diğer Stoklu Seçenekler:*
• Koçtaş: ₺785,00 · • Hepsiburada: ₺789,99 · • Trendyol: ₺879,00
🛒 *Satın Alma Linki:*
https://enucuznerede.com/yonlendir?site=ventatek&sku=…
🏷️ *En Ucuz Nerede?* | 3D Baskı Fırsat Kanalı
```

Görsel varsa (`resimliGonder`) mesaj **tek parça resim açıklaması** olarak gider
(caption ≤ 900 karakter). V2 dedektörü şişirilmiş etiket veya tarihi dip
tespit ettiyse ilgili satırlar karta eklenir.

### Entegrasyon ve spam koruması

- **Radar:** `radarGonder` Telegram gönderiminden sonra `whatsappKopyaGonder()`
  çağırır. 48 saatlik cooldown / fiyat düşüşü / mağaza değişimi kararları
  **Telegram ile aynı** `bildirimKarari`'dan gelir → kanala spam yapılmaz.
- **Fırsat kanalı:** Telegram gönderiminden sonra `whatsappFirsatGonder()`.
  Günlük üst sınır ve cooldown aynı `spamKontrolu` kararından geçer.

### Hata izolasyonu (kritik)

WhatsApp tamamen **izole** çalışır:

- `whatsappKanalGonder` **asla fırlatmaz** → `{ok:false, hata}` döner.
- Radar/fırsat kancaları ayrı `try/catch` içinde; hata `console.warn` ile
  loglanır ve **Telegram gönderimi + radar taraması devam eder**.
- Kanal kapalıysa `{ok:false, atlandi:true}` — ağ isteği hiç atılmaz.
- 500 / ağ hatası / timeout ayrı ayrı raporlanır (`(zaman aşımı)` işareti).
- **Token sızdırmaz:** hata mesajlarında ve URL'lerde `***` ile maskelenir.

### Ayarlar paneli

`Ayarlar → 📢 WhatsApp Fırsat Kanalı` kartı: etkinleştirme, sağlayıcı seçimi,
kanal ID, API URL, şifreli token girişi (Meta alanları koşullu görünür), görsel
tercihi. Değişiklikler **otomatik kaydedilir** (debounce 500 ms).

- 🧪 **Test Fırsatı Gönder** → `POST /api/alarm/test-whatsapp-kanal` (gerçek gönderim)
- 👁️ **Mesajı Önizle** → aynı uç `{kuru:true}` (ağ isteği **yok**, WhatsApp balon
  renginde önizleme)

Token hiçbir zaman geri okunmaz: `GET /api/settings` yalnızca `tokenVar: true/false`
döner; boş/maskeli token gönderilirse kayıtlı anahtar korunur.

### API

| Uç | Açıklama |
|---|---|
| `POST /api/alarm/test-whatsapp-kanal` | `{kuru?, ornek?, imageUrl?}` — test gönderimi/önizleme |
| `GET /api/whatsapp/saglayicilar` | Sağlayıcı listesi (panel açılır menüsü) |

Test: `npm run test:whatsapp` — **120 kontrol** (Markdown, kaçış, afiliye link,
4 sağlayıcı gövdesi, kanal ID, hata izolasyonu, token maskeleme, entegrasyon
kancaları, panel sözleşmesi). `fetch` mock'lanır; ağ isteği yok.


## 🔌 Gömülebilir Canlı Fiyat Widget'ı

Teknoloji blogları, YouTube incelemecileri ve forumlar sabit fiyat yazamaz.
Tek satırlık `<iframe>` ile **canlı en ucuz stoklu fiyat** gösterilir; CTA
komisyonlu linke gider, alt köşedeki marka bağlantısı organik backlink üretir.

### Kullanım

```html
<iframe src="https://enucuznerede.com/widget?urun=bambu-lab-p1s&tema=dark"
        width="320" height="180" frameborder="0" loading="lazy"></iframe>
```

| Parametre | Anlam |
|---|---|
| `?id=1` | Radar katalog kimliği (kesin eşleşme) |
| `?urun=bambu-lab-p1s` | Slug (ürün adından üretilir; kısmi de çalışır) |
| `?q=Creality+Ender+PLA` | Arama sorgusu (kelime kapsamı ≥%60) |
| `?tema=dark` \| `light` | Varsayılan koyu (`#0f172a`) |
| `?ref=maker-blogu` | Kampanya atfı; CTA'da korunur, tıklama sayılır |

`/widget` ve `/widget.html` aynı sayfayı sunar.

### Güvenlik başlıkları

| Yol | `X-Frame-Options` | CSP | Önbellek |
|---|---|---|---|
| `/widget`, `/widget.html`, `/widget/*` | **gönderilmez** | `frame-ancestors *` | `public, max-age=300` (5 dk) |
| Diğer tüm sayfalar | `SAMEORIGIN` | `frame-ancestors 'self'` | — |

Widget CSP'si `default-src 'self'` + `connect-src 'self'` ile sınırlıdır;
harici kütüphane/font yüklemez. `form-action 'none'` ve `base-uri 'none'`
enjeksiyon yüzeyini kapatır.

### Görsel tasarım

320×180 mikro kart (280 px'e kadar taşmasız), harici bağımlılık yok:

1. Ürün adı — tek satır, taşmada üç nokta
2. 🏪 mağaza rozeti (stokta değilse kırmızı nokta)
3. 💰 canlı fiyat (26 px) + ⚖️ birim fiyat (`₺453,12 / kg`)
4. 🟢 Stokta Var · 🚚 Ücretsiz Kargo rozetleri
5. `🛒 En Ucuza Satın Al (Mağaza)` — `target="_blank" rel="noopener sponsored"`
6. `⚡ EnUcuzNerede.com` alt imza — **dofollow** (bilinçli SEO tercihi)
7. `🔥 DİP` rozeti — yalnızca V2 dedektörü gerçek dip fiyatı doğruladıysa

Toplam boyut (**HTML + CSS + JS**) **14,4 KB** — 15 KB hedefinin altında.

### Gelir ve atıf

CTA doğrudan dış linke değil `/widget/git` yönlendiricisine gider:

```
/widget/git?id=50&ref=maker-blogu  →  302  →  afiliyeLink(...) 
```

- Hedef **yalnızca kayıtlı üründen** türetilir → açık yönlendirme (open redirect) yok.
- `ref` + ürün + mağaza `widget_tiklama` tablosuna yazılır.
- `GET /api/widget/istatistik?gun=30` (yönetici) ref kırılımını döndürür.

> **Üretim notu:** `PUBLIC_URL` gerçek alan adına ayarlanmalı; `/widget/git`
> bağlantıları bu adresten üretilir.

### "🔌 Sitene Ekle" oluşturucu

Ana sayfadaki her ürün kartının altında buton vardır; modal şunları sunar:

- **canlı önizleme** (gerçek widget iframe'i),
- 🌙/☀️ tema seçici (kodu ve önizlemeyi anında günceller),
- kopyalanabilir iframe kodu (`📋 Kodu Kopyala`).

Kod `?q=<ürün adı>` kullanır; widget bunu radar kataloğunda çözer.

### Dürüstlük

- Ürün katalogda yoksa/ fiyat kaydı yoksa **sahte fiyat basılmaz**;
  "ürün bulunamadı" + site bağlantısı gösterilir.
- Ürün stokta değilse CTA **"Satın Al" değil "Fiyatı Sitede Gör"** olur.
- Widget yükünde token, PID, sohbet kimliği **yok** — yalnızca herkese açık
  fiyat alanları döner.
- Widget sayfası `noindex` — kendi başına arama sonuçlarında görünmez,
  backlink değeri ana siteye gider.

### Yerelde önizleme

Alan adı kurulmadan da tüm widget'lar görülebilir:

```
http://localhost:3000/widget-demo.html
```

Galeri, radar kataloğundaki her ürün için **gerçek widget'ı** iframe içinde
gösterir; tema değiştirilebilir ve gömme kodu tek tıkla kopyalanır.
Tek bir widget'ı doğrudan görmek için:

```
http://localhost:3000/widget?urun=bambu-lab-p1s&tema=dark
```

Yerelde (`localhost`, `127.0.0.1`, `192.168.x.x`, `10.x`, `172.16–31.x`)
alt imza **🧪 localhost:3000** olarak görünür ve yerel sunucuya bağlanır —
var olmayan `EnUcuzNerede.com` adresine link verilmez. Gerçek alan adına
geçildiğinde etiket ve bağlantı otomatik olarak üretim adresini kullanır.

`?urun=` slug'ı yazım farklarına toleranttır: `pla-plus` ↔ `pla` (PLA+),
fazladan kelimeler ve kısaltmalar çözülür; alakasız bir slug yine
"bulunamadı" döner.

Test: `npm run test:widget` — **96 kontrol** (slug/çözümleme, güvenlik,
referral, başlıklar, dosya boyutu, modal sözleşmesi).


## 🚨 Sahte İndirim & Şişirilmiş Liste Fiyatı Dedektörü V2

Satıcılar 500 TL'lik ürünü **"1.000 TL yerine %50 indirimle 499 TL"** diye
pazarlıyor; kullanıcı gerçekte %0 tasarruf ediyor ama yapay bir aciliyet algısı
oluşuyor. V2 bu iddiayı SQLite'taki **gerçek fiyat geçmişiyle** çürütür.

### Pencere metrikleri (`src/store.js → getFiyatAnalizi`)

| Alan | Anlam |
|---|---|
| `ortFiyat30` | Son 30 günün **gün ağırlıklı** gerçek satış ortalaması |
| `maxFiyat60` | Son 60 günde gerçekten görülen **en yüksek** fiyat |
| `minFiyat90` | Son 90 günün **tarihi dibi** |
| `ortFiyat60`, `ortFiyat90` | Uzun pencere ortalamaları (bilgi amaçlı) |

Eski alanlar (`minFiyat`/`maxFiyat`/`ortFiyat`) **korunur** — mevcut arayüz
bozulmaz. Gün ağırlıklı ortalama, bir günün çok sayıda gözleminin ortalamayı
saptırmasını engeller.

### Karar kuralları (`src/sahteIndirim.js`, `pricing.js`'ten yeniden dışa aktarılır)

| Kural | Koşul | `rozetTuru` |
|---|---|---|
| **A — Şişirilmiş etiket** | `listeFiyati > maxFiyat60 × 1.15` **VEYA** `listeFiyati > ortFiyat30 × 1.25` | `sahte_indirim` |
| **B — Gerçek dip** | `satisFiyati ≤ minFiyat90 × 1.01` | `gercek_firsat` |
| **C — Piyasa normali** | `|satis − ortFiyat30| ≤ ortFiyat30 × 0.05` | `normal` |
| **Cold-start** | geçmiş yok veya `< 3 gün` | `normal` + `neden` |

Öncelik **uyarı > fırsat**: liste fiyatı şişirilmişse bu gizlenmez; ürün aynı
zamanda 90 günün dibindeyse `gercekFirsat: true` ayrıca taşınır ve arayüz ikisini
de gösterebilir.

**Çıktı alanları:** `iddiaEdilenIndirim` (mağazanın iddiası), `gercekTasarruf`
(ortalamaya göre gerçek), `rozetMetni`, `rozetRengi` (`turuncu`/`yesil`/`notr`),
`tooltip`, `etiketOraniOrt30`, `etiketOraniMax60`, `yeterliVeri`, `neden`.

Örnek (30 gün ort. ₺500, etiket ₺1.000, satış ₺499):

> ⚠️ Şişirilmiş Liste Fiyatı: Son 30 günün gerçek piyasa ortalaması ₺500,00
> · iddia %50 · **gerçek tasarruf %0,2**

### Pipeline (`src/pipeline.js`)

`sahteIndirimleriIsaretle()` her `found` teklife `r.sahteIndirim` iliştirir.
Eski `sisirilmisEtiket` bayrağı da bu karardan türetilir (geriye dönük uyum).
`ozet.sahteIndirim` en ucuz **stoklu** teklifin denetimini taşır — radar,
Telegram ve borsa tek kaynaktan okur (üç ayrı eşik kopyası yok).

### Web (`public/app.js`, `style.css`)

- **`⚠️ Şişirilmiş Liste Fiyatı`** — turuncu uyarı rozeti; altında
  `iddia %50 · gerçek %0.2`. Üstü çizili fiyat `supheli` sınıfıyla işaretlenir.
- **`🔥 GERÇEK FIRSAT`** — yeşil **parlayan** rozet (`gf-parla` animasyonu);
  `prefers-reduced-motion` tercihinde parlama durur.
- Tooltip: `data-ipucu` üzerinden fare **ve** klavye (`tabindex="0"`) ile açılır.
- Borsa vitrininde `🔥 GERÇEK FIRSAT` rozeti (`gercekFirsat` alanı API'de
  herkese açık; kişisel veri sızmaz).

### Telegram (`src/telegramBot.js`, `src/otonomRadar.js`)

```
⚠️ Etiket Analizi: Mağazanın iddia ettiği %50 indirim yapaydır.
   Son 30 günün gerçek piyasa ortalaması ₺500,00.
💸 Gerçek tasarruf: %0
```
```
🔥 Piyasa Analizi: 🟢 Tarihi Dip Seviye! Son 90 günün en düşük fiyatı yakalandı.
```

Satırlar yalnızca **gerçek geçmişten doğrulanmış** iddialarda eklenir; cold-start
ürünlerde hiçbir analiz satırı çıkmaz.

### Dürüstlük notları

- **Cold-start ürünlerde rozet basılmaz.** Geçmişi olmayan ürüne "sahte indirim"
  demek, düzeltmeye çalıştığımız yanlış bilginin aynısı olurdu. Mağazanın kendi
  iddiası (`iddiaEdilenIndirim`) yine raporlanır, ama gerçek tasarruf **uydurulmaz**.
- Eşiklerde **lehte karar**: `liste = ort × 1.25` tam sınırda rozet basmaz.
- Yüzdeler gerçek gözlemlerden hesaplanır; tahmin/enterpolasyon yok.

Test: `npm run test:sahte-indirim` — **69 kontrol**: gerçek SQLite pencereleri,
Kural A/B/C, eşik sınırları, cold-start, pipeline işaretleme, web sözleşmesi ve
Telegram kartları (ağ isteği yok, test verisi kendini siler).


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

Test: `npm run test:radar` (179 kontrol, ağ isteği yok).

### Ürün kimliği denetimi

`npm run denetim:kimlik` — `radar_durum` içindeki her kartın, eşleştiği ilan
başlığıyla **aynı ürün** olup olmadığını kontrol eder (model serisi, ürün
hattı/malzeme, kapasite). Veritabanına yazmaz; çakışma varsa çıkış kodu 1.

2026-11-04'te bu denetim 3 gerçek hata buldu:
- `Anycubic Kobra 2 Neo` → kart ₺17.000 gösteriyordu, link **Anycubic Kobra 4**'e gidiyordu
- `eSun PLA+ Beyaz 1kg` → kaynak **eSun PLA+HS** (High Speed) seçilmişti
- `Sunlu PLA+ Filament 1kg` → kaynak **Sunlu Silk PLA+** seçilmişti

Kök neden: `modelSerisi()` tek harfli model sonekini ("Kobra X") tanımıyordu ve
kaynak arama `hatCakismasi`/`kapasiteCakismasi` uygulamıyordu. Ayrıntı:
"Ürün kimliği" bölümü.


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

## 🏭 Porima 3D desteği (2026-11-03)

`porima3d.com` (üreticinin kendi mağazası) 62. site olarak eklendi.
Shopify platformu; **36 varyantlı** filament ürünleri (18 renk × 1kg/3kg).

**Varyant-farkında Shopify adaptörü.** Önceki adaptör yalnızca `variants[0]`
okuyordu; Porima'da bu çoğu zaman "Naturel 1kg" oluyordu. Kaynak ürün "Beyaz"
iken aday "Naturel" sayılıyor, renk uyuşmazlığından doğru fiyat listeye
girmiyordu. Seçim sırası:

1. URL'de `?variant=<id>` varsa o varyant,
2. kaynak ürünle **barkod/SKU → net ağırlık → renk** eşleşmesi (puanlama),
3. Shopify'ın seçili/ilk stoklu varyantı.

Eşleşme kanıtı yoksa stokta olan ilk varyant seçilir ve `varyant.secim` alanı
bunu açıkça bildirir (`kaynak-eşleşmesi` / `stokta-ilk` / `varsayılan` / `url`).

**Kargo:** ücretsiz kargo eşiği sitenin kendi temasından okundu
(`free-shipping-bar data-threshold="150000"` → **1.500 TL**). Eşik altında kargo
ücreti sitede yayımlanmıyor → **uydurulmaz** (`fee:null`), ödeme adımında
hesaplanır ve toplama eklenmez.

Sepet/hızlı site listelerine ve seyahat tarifelerine eklendi.

**Canlı ölçüm:** Porima PLA Filament kaynak alındığında 14 mağaza bulundu;
en ucuz **Porima 3D ₺612** (kendi mağazası), ardından Robotizmo ₺720,36,
FilamentMarketim ₺757, Trendyol ₺801,24.

### Bu ekleme sırasında düzeltilen 2 eşleştirme hatası

- **Sahte marka eşleşmesi:** "Porima PLA Filament Ten 1kg" ile "**FilenTa** Ten
  Rengi PLA Premium Filament" %66 benzerlikle eşleşiyordu (ortak jenerik
  kelimeler: pla/filament/ten) ve yanlış mağaza "en ucuz" görünüyordu. Artık iki
  taraf da bilinen ve farklı markaysa, marka kanıtı başlıkta yoksa **yalnızca
  %90+ benzerlik** kabul edilir. Pazaryeri kuralı korunur (marka alanı satıcı
  adıysa ve gerçek marka başlıkta geçiyorsa eşleşir).
- **Eksik renk sözlüğü:** `ten` ve `naturel` renk listesinde yoktu; bu yüzden
  renk karşılaştırması "bilinmiyor" dönüyor ve rengi yazmayan mağaza
  ("Porima PLA Filament - 1Kg") eleniyordu. İki renk eklendi; kimlik
  kapsamasından renk token'ları tamamen çıkarıldı.

### Borsa (otonom radar) kataloğu

Porima, borsa kataloğuna **7 ürünle** girdi. Girişlerde `url` **tam varyant
kimliğine** sabitlendi (`?variant=<id>`) — arama ile "en yakın ilan" bulmak
yanlış ürün hattına kayabiliyordu.

| Ürün | Fiyat (Porima 3D) |
|------|------------------|
| Porima Hyper PLA+ Filament Siyah 1kg | ₺453,12 |
| Porima xPLA Filament Siyah 1kg | ₺463,68 |
| Porima Eco PLA Filament Gri 1kg | ₺551,04 |
| Porima PLA Filament Beyaz 1kg | ₺612,00 |
| Porima PLA Filament Siyah 1kg | ₺612,00 |
| Porima PLA Filament Ten 1kg | ₺612,00 |
| Porima Silk PLA Filament Altın 1kg | ₺663,36 |

### Katalog göçü (sürümlü tohum)

`KATALOG_SEED_SURUMU` (şu an **3**): tohum bir kez yazılıp kilitlenmiyor; sürüm
artınca **mevcut kurulumlara yalnızca eksik varsayılanlar** eklenir, kullanıcının
kendi eklediği/sildiği kayıtlar korunur. v3 ayrıca eski "Porima PLA Siyah 1.75mm
1kg" kaydını doğru ürün hattına (**xPLA**) çevirdi: adı PLA diyordu ama arama
çözümlemesi Trendyol'daki xPLA ilanını izliyordu, borsada xPLA ürünü düz PLA
fiyatıyla görünüyordu.

### Yeni eşleştirme koruması: ürün hattı / malzeme

`hatCakismasi()`: xPLA ↔ PLA (sim 0.75), Silk ↔ PLA (0.75), Premium ↔ PLA (0.50)
artık **reddedilir**; PLA ↔ PETG de. Kural: iki tarafta malzeme farklıysa ya da
ürün hattı göstergesi (xpla/hyper/silk/premium/matte/wood…) kesişmiyorsa farklı
üründür. `eco` yalnızca **"eco pla" bitişik** yazımında hat sayılır (Porima
xPLA'daki "Eco" bir ambalaj seçeneğidir). `x pla` → `xpla` normalizasyonu
eklendi; RAL/PANTONE renk kodları kimlik kanıtı sayılmıyor.

**Ölçüm (düzeltme öncesi/sonrası):** borsadaki yedi ürün de artık kendi ürün
hattında eşleşiyor; xPLA ₺463,68 (önceden yanlışlıkla düz PLA ₺612 gösteriyordu).

Test: `npm run test:sorgu-eslesme` (19/19), `npm run test:renk` (30/30),
`npm run test:radar` (179/179), `npm run test:vitrin` (72/72).

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
npm run denetim:kimlik    # radar kartı ↔ eşleşen ilan kimlik denetimi (yanlış link avı)
npm run test:telegram     # Telegram asistanı (arama/buton/SWR/takip)
npm run test:telegram-radar  # Telegram radar komutları + kişisel alarm
npm run test:telegram-inline # Inline mode + PNG fiyat trend grafiği
npm run test:telegram-assistant # Admin CRUD + fiyatGrafigiUret + inline sözleşmesi
npm run test:maliyet      # 3D baskı maliyet hesaplayıcı (matematik + canlı filament + mobil)
npm run test:sahte-indirim # Sahte indirim V2 (gerçek geçmiş + web + Telegram)
npm run test:widget       # gömülebilir canlı fiyat widget'ı (güvenlik + modal)
npm run test:whatsapp     # WhatsApp fırsat kanalı (Markdown + sağlayıcı + izolasyon)
npm run test:gorsel       # EVREN qwen3-vl-30b görsel parça tanıma (61 mağaza)
npm run test:retry        # EVREN 503/429 yeniden deneme + deterministik kurtarma
npm run test:vitrin       # canlı borsa vitrini + mobil alt bar
npm run test:link         # linkte ara
npm run test:gecmis       # son aramalar linkleri
npm run test:stok         # stok sıralama (npm dışı: node scripts/test-stok.mjs)
npm run test:zeka         # fiyat zekası (dip fiyat / sahte indirim / SWR)
npm run test:dayaniklilik # kazıma havuzu + zaman aşımı + eşleştirme + borsa
                          # (node scripts/test-tarama-dayaniklilik.mjs)
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
