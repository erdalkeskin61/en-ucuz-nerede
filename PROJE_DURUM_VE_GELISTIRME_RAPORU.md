# 📋 En Ucuz Nerede? — Kıdemli Mimari & Ürün Analiz Raporu

> **Hazırlayan:** DeepSeek-V4.1-Flash (Kıdemli Yazılım Mimarı & YZ Uzmanı)
> **Kapsam:** Mimari olgunluk değerlendirmesi, darboğaz analizi ve 3 aşamalı yol haritası
> **Versiyon:** v1.0 — Proje Son Durum Raporu

---

## 1. 📊 Projenin Genel Durumu & Mimari Özeti

### 1.1 Olgunluk Seviyesi: **"Üretime Yakın Prototip" (MVP+ / v0.9)**

Proje, Türkiye e-ticaret ekosisteminde **55 site** gibi ciddi bir kapsama ulaşmış, modüler ayrıştırma (`pipeline.js`, `netFiyat.js`, `scraper.js`, `ai.js`, `alarms.js`) doğru yapılmış, platform fabrikaları (`plt-tsoft`, `plt-ticimax`, `plt-ideasoft`, `plt-ikas`) ile adaptör tekrarını azaltmış **oldukça iddialı bir MVP**. Açık kaynak ekosisteminde bu kapsamda bir Türkçe fiyat karşılaştırma motoru nadirdir — bu projenin **en büyük stratejik avantajıdır**.

### 1.2 Mimari Katmanlar (Özet Diyagram)

```
┌─────────────────────────────────────────────────────────────────┐
│  KULLANICI KATMANI                                              │
│  SPA (Vanilla JS)  │  Canlı İlerleme  │  Fiyat Grafikleri       │
└─────────────────────────────────────────────────────────────────┘
                              │ REST / SSE
┌─────────────────────────────────────────────────────────────────┐
│  ORKESTRASYON KATMANI                                           │
│  pipeline.js (ürün kimliği → arama → aday → skor → net fiyat)   │
│  oneri.js (NL ürün danışmanı)  │  alarms.js (scheduler + mail)  │
└─────────────────────────────────────────────────────────────────┘
        │                     │                        │
┌───────────────┐   ┌─────────────────┐   ┌─────────────────────┐
│  NET FİYAT    │   │  KAZIMA KATMANI │   │  AI KATMANI         │
│  netFiyat.js  │   │  scraper.js     │   │  ai.js (EVREN LLM)  │
│  (kupon,      │   │  kredi.js       │   │  kampanya sınıfl.   │
│   kargo,      │   │  Playwright +   │   │  (herkes/koşullu/   │
│   taksit,     │   │  ScraperAPI /   │   │   taksit/bilgi)     │
│   banka kamp.)│   │  ZenRows /      │   │                     │
│               │   │  Crawlbase /    │   │                     │
│               │   │  ScrapingBee    │   │                     │
└───────────────┘   └─────────────────┘   └─────────────────────┘
        │                     │
┌─────────────────────────────────────────────────────────────────┐
│  ADAPTÖR KATMANI (src/sites/)                                   │
│  55 site adaptörü + 4 platform fabrikası (T-Soft, Ticimax,     │
│  IdeaSoft, İkas) + Shopify / WooCommerce                        │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│  VERİ KATMANI                                                   │
│  SQLite / JSON dosya tabanlı store  │  Fiyat geçmişi  │  Kredi  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Güçlü Yönler 💪

| Alan | Değerlendirme | Not |
|------|---------------|-----|
| **Kapsam** | ⭐⭐⭐⭐⭐ | 55 site + 4 platform fabrikası — Türkiye'de nadir |
| **Net Fiyat Motoru** | ⭐⭐⭐⭐⭐ | Kupon/kargo/taksit/banka kampanyası ayrıştırması rakiplerde yok |
| **AI Entegrasyonu** | ⭐⭐⭐⭐ | Kampanya sınıflandırma + NL danışman — doğru yönde |
| **Modülerlik** | ⭐⭐⭐⭐ | ESM, katmanlı ayrıştırma, fabrika pattern |
| **Frontend** | ⭐⭐⭐⭐ | Vanilla JS + SSE ilerleme çubuğu = hafif ve hızlı |
| **Alarm Sistemi** | ⭐⭐⭐ | Scheduler + nodemailer var, kanal çeşitliliği eksik |
| **Kazıma Esnekliği** | ⭐⭐⭐⭐ | 4 ticari API + yerel Playwright fallback = akıllı |

### 1.4 Kritik Gözlem

Proje **"çalışan bir motor"** seviyesinde; ancak **"dayanıklı, ölçeklenebilir ve sürdürülebilir bir platform"** seviyesine geçiş için **3 temel eşik** var:

1. **Veri katmanı** (JSON → SQLite/Postgres)
2. **Test altyapısı** (55 adaptör = 55 regresyon riski)
3. **Eşleştirme doğruluğu** (string similarity → semantik + barkod/model kodu)

---

## 2. 🔍 Tespit Edilen Darboğazlar ve İyileştirme Alanları

### 2.1 🛡️ Kazıma Dayanıklılığı ve Bot Korumaları

**Sorun:** Trendyol, Hepsiburada, Amazon TR, MediaMarkt gibi büyük siteler **Cloudflare Enterprise, DataDome, Akamai Bot Manager, PerimeterX** kullanıyor. Playwright tek başına yeterli değil; fingerprint, TLS parmak izi, davranış analizi katmanları var.

| Risk | Etki | Öneri |
|------|------|-------|
| **Playwright fingerprint tespiti** | Yüksek | `playwright-extra` + `stealth` plugin; `puppeteer-extra-plugin-stealth` benzeri |
| **TLS/JA3 parmak izi** | Yüksek | `curl-impersonate` veya `undici` + custom TLS; Node için `node-fetch-h2` alternatifleri |
| **Residential proxy yok** | Kritik | ScraperAPI/ZenRows residential endpoint'leri; ya da BrightData/Oxylabs entegrasyonu |
| **Session/cookie yönetimi** | Orta | Domain başına cookie jar + `tough-cookie`; oturum ısıtma (warm-up) stratejisi |
| **Rate limit / IP ban** | Yüksek | Domain başına token bucket + exponential backoff + circuit breaker |
| **CAPTCHA** | Yüksek | 2Captcha/CapMonster fallback; ya da ticari API'ye delege etme |
| **Dinamik render tespiti** | Orta | Önce `fetch + cheerio`, başarısızsa Playwright (maliyet optimizasyonu) |

**Somut Öneri:** `scraper.js` içine **strateji zinciri** ekle:
```
fetch+cheerio → Playwright(headless) → Playwright(stealth) → ScraperAPI → ZenRows → Crawlbase → ScrapingBee
```
Her adım **başarısızlık sayacı** ile izlenmeli; 3 ardışık başarısızlıkta o domain için **soğuma süresi** (cooldown) uygulanmalı.

> **2026-10-28 — uygulandı:** Rate limit satırı artık karşılanıyor. Site başına token
> kovası (küçük mağazalarda 1 istek/sn) + site başına **eşzamanlı istek sınırı** (varsayılan 3,
> yumuşak engelde 1) + 90 sn nazik mod + hata sayfası (404) tanıma ve önbelleğe yazmama.
> Ayrıntı: README → "Site nezaketi ve hata sayfası koruması". Durum: `/api/durum` →
> `kazimaSaglayicilari.nazikMod`. Ölçüm: sepet 5/5 ürün, ~27 sn (önceden 3/5).

### 2.2 🎯 Ürün Eşleştirme Algoritması (En Kritik Alan)

**Sorun:** 55 sitede aynı ürünü bulmak, **string similarity** (Levenshtein, Jaro-Winkler, token-set) ile yapılıyorsa:
- "Apple iPhone 15 128GB Siyah" vs "iPhone 15 128 GB Siyah (Apple TR Garantili)" → **eşleşmeli**
- "Samsung Galaxy S24 256GB" vs "Samsung Galaxy S24 Ultra 256GB" → **eşleşmemeli** ama string benzerliği yüksek (~%85)

| Sorun | Çözüm |
|-------|-------|
| Model kodu çıkarımı (örn: `SM-S921B`, `MQ0D3TU/A`) | Regex + LLM fallback; marka bazlı pattern kütüphanesi |
| Barkod/EAN/GTIN | Ürün sayfasından çek; barkod varsa **eşleştirmede birincil anahtar** |
| Renk/kapasite/beden ayrımı | Variant parser; attribute extraction |
| Marka yazım farkları (Samsung/SAMSUNG/Samsung TR) | Normalize + marka sözlüğü |
| Yeniden satıcı / 2. el karışması | `condition` meta'sı; "yenilenmiş" filtresi |

**Somut Öneri:** İki katmanlı skorlama:
1. **Kural tabanlı skor** (barkod eşleşmesi = 1.0, model kodu = 0.9, marka+model+kapasite = 0.85, fuzzy = 0.5–0.8)
2. **Embedding tabanlı semantik skor** (bkz. Bölüm 4) — son karar için ağırlıklı ortalama

### 2.3 💾 Veri Katmanı ve Bellek

**Sorun:** JSON dosya tabanlı store:
- **Eşzamanlı yazma** → dosya bozulması (race condition)
- **Büyüyen fiyat geçmişi** → RAM'e tamamı yüklenir, OOM riski
- **Sorgu yok** → "son 30 günde %20 düşen ürünler" gibi sorgular imkânsız
- **Yedekleme/atomiklik yok**

| Katman | Şu An | Hedef (Kısa Vade) | Hedef (Uzun Vade) |
|--------|-------|-------------------|-------------------|
| OLTP (ürün, kullanıcı, alarm) | JSON | **SQLite (better-sqlite3, WAL)** | PostgreSQL |
| Time-series (fiyat geçmişi) | JSON | SQLite tablo + index | **TimescaleDB / ClickHouse** |
| Cache (kampanya, eşleştirme) | Yok | **Redis** (veya SQLite cache tablosu) | Redis Cluster |
| Vektör (semantik eşleştirme) | Yok | — | **pgvector / Qdrant** |

### 2.4 🧪 Test Kapsamı (En Büyük Sürdürülebilirlik Riski)

**Sorun:** 55 adaptör = 55 potansiyel kırılma noktası. Site HTML'i değiştiğinde **hangi adaptörün kırıldığını bilmek** dakikalar değil **saniyeler** almalı.

**Öneri:**
- **VCR pattern (fixture-based testing):** Her adaptör için kayıtlı HTML fixture'ları; `nock` veya `msw` ile network mock
- **Contract test:** Her adaptörün `extractProduct(html) → {title, price, barcode, modelCode, ...}` sözleşmesini doğrula
- **Golden set:** 20–30 gerçek ürün için "beklenen sonuç" (ground truth) — eşleştirme doğruluğunu ölç
- **Smoke test (canlı):** CI'da günlük 5–10 siteye gerçek istek (rate-limit'e saygılı)
- **Coverage hedefi:** Adaptör katmanı %80+, pipeline %70+

### 2.5 ⚡ Performans ve Maliyet

| Sorun | Etki | Çözüm |
|-------|------|-------|
| Her karşılaştırmada 55 site canlı taranıyor | Yüksek maliyet + yavaş | **Kademeli tarama:** önce hızlı API'ler (Trendyol, Hepsiburada), sonra Playwright; cache TTL |
| LLM her kampanya metni için çağrılıyor | Yüksek token maliyeti | **Prompt caching** (DeepSeek-V4.1-Flash destekliyorsa), aynı metin hash'i → cache |
| Playwright her istek için yeni browser | Yüksek RAM/CPU | **Browser pool** (browserless / playwright pool) |
| SPA ilerleme çubuğu SSE ama pipeline bloklayıcı | UX | Pipeline'ı **queue-based** yap (BullMQ), SSE ile event yayını |

### 2.6 🔐 Güvenlik ve Gözlemlenebilirlik

- **Girdi doğrulama:** URL parametreleri (özellikle `productUrl`) SSRF'e açık olabilir → allowlist + URL parse
- **Rate limiting:** Public endpoint'lerde IP başına limit
- **Log yapısı:** `pino` + structured logging; her istek için `requestId`
- **Metrikler:** Prometheus `/metrics` — adaptör başarı oranı, ortalama süre, kredi tüketimi
- **Hata izleme:** Sentry entegrasyonu
- **Sır yönetimi:** `.env` + `dotenv-safe`; API anahtarları için Vault/Doppler önerisi

### 2.7 🤖 AI Katmanı (EVREN LLM)

- **Model güncellemesi:** EVREN endpoint'i OpenAI uyumlu → model adı `deepseek-v4.1-flash` olarak güncellenmeli (maliyet/hız dengesi)
- **Structured output:** Kampanya sınıflandırmasında **JSON schema** + `response_format: json_schema` (destekleniyorsa) → parse hatalarını sıfıra indir
- **Few-shot + cache:** Aynı kampanya metni tekrar gelirse LLM'e gitmeden cache'den dön
- **Fallback:** LLM başarısızsa **regex tabanlı kural motoru** (kupon, kargo bedava, taksit kelimeleri) devreye girsin
- **Prompt versiyonlama:** `prompts/campaign-classify.v2.md` gibi versiyonlu dosyalar

---

## 3. 🚀 Geliştirme İçin Somut Tavsiyeler ve Yol Haritası

### 3.1 🎯 Kısa Vadeli — "Stabilizasyon Sprinti" (1–3 Hafta)

> **Hedef:** Projeyi "çalışıyor"dan "güvenilir"e taşımak.

| # | Görev | Kazanım | Efor |
|---|-------|---------|------|
| 1 | **EVREN LLM modelini `deepseek-v4.1-flash`'e güncelle** | %40–60 maliyet düşüşü, daha hızlı yanıt | S |
| 2 | **JSON store → SQLite (better-sqlite3, WAL mode)** | Atomiklik, sorgu, eşzamanlılık | M |
| 3 | **Fiyat geçmişi için ayrı tablo + index** | Grafik performansı, retention policy | S |
| 4 | **Adaptör fixture testleri (VCR pattern)** | Kırılma tespiti saniyeler içinde | M |
| 5 | **Structured logging (`pino`) + `requestId`** | Debug süresi %70 düşer | S |
| 6 | **Domain başına rate limiter + circuit breaker** | Ban riski düşer | S |
| 7 | **Kampanya sınıflandırma cache (hash → sonuç)** | LLM maliyeti %60 düşer | S |
| 8 | **`fetch+cheerio → Playwright` fallback zinciri** | Kaynak tüketimi %50 düşer | M |
| 9 | **SSRF koruması (URL allowlist + parse)** | Güvenlik açığı kapanır | S |
| 10 | **`/health` + `/metrics` endpoint'leri** | Operasyonel görünürlük | S |
| 11 | **Playwright browser pool** | RAM/CPU optimizasyonu | M |
| 12 | **`dotenv-safe` + sır yönetimi** | Prod güvenliği | S |

**Örnek SQLite şeması (özet):**
```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  brand TEXT, model_code TEXT, barcode TEXT UNIQUE,
  attributes_json TEXT, created_at INTEGER
);
CREATE TABLE offers (
  id INTEGER PRIMARY KEY, product_id INTEGER REFERENCES products(id),
  site TEXT, url TEXT, price REAL, net_price REAL,
  campaign_json TEXT, scraped_at INTEGER
);
CREATE TABLE price_history (
  product_id INTEGER, site TEXT, price REAL, net_price REAL,
  ts INTEGER, PRIMARY KEY (product_id, site, ts)
) WITHOUT ROWID;
CREATE INDEX idx_history_product_ts ON price_history(product_id, ts DESC);
```

### 3.2 🌱 Orta Vadeli — "Ürün Genişletme" (1–3 Ay)

> **Hedef:** Kullanıcı bağlılığı ve platform etkileşimi.

| # | Özellik | Değer |
|---|---------|-------|
| 1 | **Kullanıcı hesapları + favoriler + takip listesi** | Retention |
| 2 | **Çoklu bildirim kanalı:** Telegram Bot, WhatsApp Cloud API, Web Push (PWA), Discord webhook | Alarmların gerçek değeri |
| 3 | **Browser Extension (Chrome/Firefox)** | Ürün sayfasında "en ucuz nerede?" butonu → viral büyüme |
| 4 | **PWA dönüşümü** (offline cache, installable) | Mobil deneyim |
| 5 | **Gelişmiş filtreler:** "sadece kuponlu", "kargo bedava", "vade farksız taksit", "resmi satıcı" | Net fiyat motorunun UX'e yansıması |
| 6 | **Fiyat tahmini (basit):** Son 90 günün min/ort/max + "şimdi al / bekle" göstergesi | Karar desteği |
| 7 | **Ürün karşılaştırma tablosu** (yan yana 3 ürün) | Elektronik alışverişinde kritik |
| 8 | **Public API** (rate-limited, API key) | Ekosistem |
| 9 | **Admin paneli:** adaptör sağlık durumu, kredi tüketimi, LLM maliyeti | Operasyon |
| 10 | **i18n altyapısı** (TR/EN) | Gelecek için hazırlık |
| 11 | **E-posta şablonları** (MJML) + unsubscribe | Deliverability |
| 12 | **Sentry + Uptime monitoring** | Prod güvenilirliği |

### 3.3 🏔️ Uzun Vadeli — "Platform Dönüşümü" (3–12 Ay)

> **Hedef:** Türkiye'nin en iyi fiyat takip platformu.

| # | Yetenek | Açıklama |
|---|---------|----------|
| 1 | **Vektör tabanlı semantik ürün eşleştirme** | Ürün başlığı + attribute → embedding (DeepSeek embedding veya `bge-m3`); pgvector/Qdrant'ta ANN; string similarity'yi tamamen değiştir |
| 2 | **Dağıtık kazıma mimarisi** | BullMQ (Redis) veya Kafka kuyruğu; worker pool (Node veya Python); her worker farklı proxy havuzu |
| 3 | **Time-series DB (TimescaleDB/ClickHouse)** | Milyonlarca fiyat noktası; materialized view ile "son 24s trend" |
| 4 | **ML fiyat tahmini** | Prophet/LightGBM ile "fiyat düşecek mi?" olasılığı |
| 5 | **Anomali tespiti** | Yanlış fiyat (₺0,99), sahte indirim, stok manipülasyonu |
| 6 | **Çoklu dil + çoklu ülke** | TR → MENA/Avrupa genişleme |
| 7 | **B2B API** (affiliate ✅ tamamlandı 2026-10-28) | Gelir modeli |
| 8 | **Kullanıcı yorumu + ürün özeti (LLM)** | "Bu ürün hakkında 200 yorumu 3 cümleye indir" |
| 9 | **Görsel ürün arama** | Fotoğraftan ürün tanıma (multimodal) |
| 10 | **Fiyat alarmı + akıllı öneri** | "Bu ürün 2 hafta içinde ₺X'in altına düşerse haber ver" |
| 11 | **Adaptör otomatik üretimi (LLM)** | Yeni site eklendiğinde LLM'e HTML ver → adaptör iskeleti üret → insan onayı |
| 12 | **A/B test altyapısı** | UX ve algoritma iyileştirmeleri için |

---

## 4. 💡 DeepSeek-V4.1-Flash Özel Fikirleri

> Projeyi **"Türkiye'nin en iyi fiyat takip platformu"** yapacak, LLM'in benzersiz yeteneklerini kullanan yenilikçi özellikler.

### 4.1 🧠 Semantik Eşleştirme Motoru ("MatchGPT")

Klasik string similarity yerine **hibrit skorlama**:

```javascript
// ai.js içine eklenecek
async function semanticMatchScore(productA, productB) {
  const prompt = `
    Aşağıdaki iki ürünün AYNI ürün olup olmadığını değerlendir.
    Sadece JSON döndür: { "same": boolean, "confidence": 0-1, "reason": string }
    
    Ürün A: ${JSON.stringify(productA)}
    Ürün B: ${JSON.stringify(productB)}
  `;
  // deepseek-v4.1-flash + response_format: json_object
}
```

**Kazanım:** "iPhone 15 128GB" vs "iPhone 15 128 GB" vs "Apple iPhone 15 128GB Siyah" → aynı ürün. "S24" vs "S24 Ultra" → farklı. **Eşleştirme doğruluğu %70 → %95+**.

**Maliyet kontrolü:** Sadece **skor 0.5–0.85 arasındaki belirsiz vakalar** için LLM çağır (borderline). Kesin eşleşmeler ve kesin farklılar kural motorunda kalsın.

### 4.2 🏷️ "Neden Daha Ucuz?" Açıklayıcı Motor

Kullanıcı bir ürünün diğerinden neden ucuz olduğunu **doğal dilde** görsün:

> 💬 *"Bu ürün Hepsiburada'da ₺2.400 daha ucuz çünkü: (1) Satıcı 'Trendyol' değil, 'XYZ Elektronik' (puanı 4.2/5), (2) Kargo ₺49 ekleniyor, (3) 9 taksit vade farkı %3.2. Net fiyat farkı ₺2.180."*

**Teknik:** `netFiyat.js` çıktısını LLM'e ver → açıklama üret. Cache'lenebilir.

### 4.3 🤖 Adaptör Otomatik Üretimi ("AdapterGPT")

Yeni bir T-Soft/Ticimax sitesi eklenecekse:

```javascript
// Yeni site URL'i ver
const html = await fetchSampleProductPage(url);
const adapterCode = await llm.generate(`
  Bu HTML'den ürün başlığı, fiyat, barkod, model kodu, stok durumu
  çıkaran bir adaptör yaz. Şablon: src/sites/_template.js
  HTML: ${html.slice(0, 8000)}
`);
// İnsan onayı → otomatik test fixture üretimi
```

**Kazanım:** Yeni site ekleme süresi **2 saat → 10 dakika**. 55 site → 100+ site'ye ölçeklenebilirlik.

### 4.4 🗣️ "Ne Almalıyım?" Doğal Dil Danışmanı (Mevcut `oneri.js`'i Derinleştir)

Mevcut özelliği **çok turlu diyalog** haline getir:

> 👤 *"₺30.000 bütçeyle oyun için laptop arıyorum"*
> 🤖 *"Oyun için ekran kartı ve RAM önemli. RTX 4060'lı modellere bakalım. Sizin için 3 aday buldum: [ürünler]. Hangisi size daha uygun?"*
> 👤 *"Taşınabilir olsun"*
> 🤖 *"O zaman 2.3 kg altı modellere odaklanalım..."*

**Teknik:** Session-based conversation state (Redis), tool-calling ile `searchProducts()`, `comparePrices()` fonksiyonları.

### 4.5 📊 "Akıllı Fiyat Tahmini" (Prophet + LLM Yorumu)

- **Sayısal:** Son 90 günün fiyat serisi → basit zaman serisi modeli (Prophet/LightGBM) → "önümüzdeki 14 günde düşme olasılığı %68"
- **Yorum:** LLM'e ver → *"Bu ürün geçen yıl aynı dönemde %15 düşmüştü; kampanya dönemine giriyoruz. Beklemeniz avantajlı olabilir."*

### 4.6 🔍 Multimodal Ürün Arama

Kullanıcı **fotoğraf yüklesin** → LLM (vision) ürünü tanısın → fiyat karşılaştırması:

> 📷 *(kullanıcı bir kulaklık fotoğrafı yükler)*
> 🤖 *"Bu Sony WH-1000XM5 gibi görünüyor. En ucuz: ₺8.999 (Vatan) — 3 site daha karşılaştırıldı."*

### 4.7 🚨 "Fırsat Radarı" (Anomali + Fırsat Tespiti)

LLM + kural motoru ile:
- **Gerçek indirim** vs **sahte indirim** (şişirilmiş fiyat) ayrımı
- **Yanlış fiyat** tespiti (₺0,99 gibi) → "muhtemelen hata, hızlı ol!"
- **Stok tükenmeden uyarı** (son 3 adet)
- **Kupon + banka kampanyası + taksit** kombine edilmiş **gerçek net fiyat** sıralaması

### 4.8 📝 "Ürün Özeti + Yorum Analizi"

Her ürün için 100+ yorumu LLM ile özetle:

> 📝 *"Kullanıcıların %78'i memnun. En çok şikayet: pil ömrü (12 yorum). En çok övgü: ses kalitesi (45 yorum). Son 30 günde iade oranı: %4.2."*

**Kaynak:** Trendyol/Hepsiburada yorumlarını da scrape et (adaptör genişletmesi).

### 4.9 🎯 Kişiselleştirilmiş Fiyat Alarmları

> *"Bu ürünü takip ediyorum, ama sadece kargo bedava + vade farksız taksit varsa haber ver."*

Kural tabanlı + LLM ile **doğal dil → alarm kuralı** dönüşümü:
- "₺500'ün altına düşerse" → `{ price: { lt: 500 } }`
- "Kuponlu fiyatı görmek istiyorum" → `{ campaign: { type: 'coupon' } }`
- "Hepsiburada'da değilse" → `{ excludeSites: ['hepsiburada'] }`

### 4.10 🧬 Adaptör Sağlık Skoru + Oto-Onarım

Her adaptör için:
- **Sağlık skoru:** son 24 saatteki başarı oranı
- **Kırılma tespiti:** HTML yapısı değiştiğinde LLM'e "bu HTML'den fiyatı çıkar" → yeni selector öner
- **Oto-onarım:** İnsan onayıyla selector güncellemesi

### 4.11 🌐 "Fiyat Haritası" (Görselleştirme)

Türkiye haritasında **mağaza bazlı fiyat dağılımı** + **kargo süresi tahmini** (il bazlı). LLM'e "İstanbul'a en hızlı hangi satıcı gönderir?" sorulabilir.

### 4.12 💰 Gelir Modeli Fikirleri (Sürdürülebilirlik)

| Model | Açıklama |
|-------|----------|
| **Affiliate** | ✅ **Uygulandı (2026-10-28)** — Trendyol/Hepsiburada/Amazon + GelirOrtaklari/ReklamAction; yalnızca dışa giden linke referans, fiyat/sıralama tarafsız (`src/afiliye.js`, Ayarlar paneli) |
| **Premium** | Sınırsız alarm, fiyat tahmini, öncelikli bildirim (₺29/ay) |
| **B2B API** | E-ticaret siteleri için rekabet analizi API'si |
| **Reklam** | "Sponsorlu" ama **net fiyat sıralamasını bozmayan** etiketli öneriler |

---

## 📌 Sonuç ve Önceliklendirme Matrisi

| Öncelik | Alan | Efor | Etki |
|---------|------|------|------|
| 🔴 P0 | SQLite geçişi + test altyapısı | M | ⭐⭐⭐⭐⭐ |
| 🔴 P0 | LLM modelini `deepseek-v4.1-flash`'e güncelle | S | ⭐⭐⭐⭐ |
| 🔴 P0 | Semantik eşleştirme (hibrit skorlama) | M | ⭐⭐⭐⭐⭐ |
| 🟠 P1 | Rate limit + circuit breaker + stealth | M | ⭐⭐⭐⭐ |
| 🟠 P1 | Kampanya cache + structured output | S | ⭐⭐⭐⭐ |
| 🟠 P1 | Çoklu bildirim kanalı (Telegram/WhatsApp) | M | ⭐⭐⭐⭐ |
| 🟡 P2 | Browser extension + PWA | L | ⭐⭐⭐⭐ |
| 🟡 P2 | "Neden daha ucuz?" açıklayıcı motor | M | ⭐⭐⭐ |
| 🟢 P3 | Adaptör oto-üretim (AdapterGPT) | L | ⭐⭐⭐⭐ |
| 🟢 P3 | Fiyat tahmini + anomali tespiti | L | ⭐⭐⭐ |
| 🟢 P3 | Multimodal arama | L | ⭐⭐⭐ |

---

> **Son Söz:** Proje, doğru mimari kararlarla (modüler pipeline, net fiyat motoru, platform fabrikaları, AI entegrasyonu) **Türkiye'de eşi olmayan bir temele** sahip. Kritik eşik **veri dayanıklılığı + eşleştirme doğruluğu + test altyapısı**. Bu üç alanı 4–6 haftada çözdüğünüzde, proje **"prototip"ten "ürün"e** geçer. Ardından DeepSeek-V4.1-Flash'in semantik ve üretken yeteneklerini (Bölüm 4) devreye alarak **"Türkiye'nin en akıllı fiyat platformu"** konumuna ulaşabilirsiniz.

**Kolay gelsin! 🚀**