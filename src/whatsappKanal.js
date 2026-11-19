/**
 * 📢 WhatsApp Fırsat Kanalı (2026-11-05)
 *
 * Telegram kanalındaki otonom dip fiyat / radar bildirimlerini WhatsApp
 * Kanalları (`…@newsletter`) ve gruplarına (`…@g.us`) taşır.
 *
 * NEDEN AYRI MODÜL: WhatsApp, Telegram gibi HTML kabul etmez; kendi Markdown
 * sözdizimi vardır (`*kalın*`, `_italik_`, `~üstü çizili~`, ```kod```).
 * Ayrıca mesaj 4096 değil **65536** karakter sınırındadır ama pratikte
 * okunabilirlik için 3500'de kırpılır (caption sınırı 1024).
 *
 * DÜRÜSTLÜK:
 *  - Gönderim başarısızsa `ok:false` + `hata` döner; çağıran taraf (Telegram /
 *    radar taraması) ASLA kesintiye uğramaz (izolasyon çağıranda try/catch).
 *  - Token'lar hata mesajlarına/log'a YAZILMAZ (`guvenliHata`).
 *  - Bağlantı yoksa uydurma gönderim yok; ayar eksikliği açıkça söylenir.
 */

/* ------------------------------------------------------------------ */
/* Biçimlendirme                                                       */
/* ------------------------------------------------------------------ */

/**
 * HTML/Markdown'dan bağımsız "saf metin" üretir.
 *
 * WhatsApp kendi Markdown'ını yorumlar; kullanıcı/mağaza verisinde geçen
 * `*`, `_`, `~`, ` ` ` gibi karakterler biçimi bozabilir. Bu yüzden dışarıdan
 * gelen metinlerde bu işaretler TEMİZLENİR, sonra bizim eklediğimiz biçim
 * güvenle uygulanır.
 *
 * @param {string} metin
 * @returns {string}
 */
export function whatsappKac(metin) {
  return String(metin == null ? '' : metin)
    // HTML varlıkları düz metne çevrilir (Telegram HTML'inden gelen veriler)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // WhatsApp biçim işaretleri: dış veri biçimi bozmasın
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/~~?/g, '')
    .replace(/```/g, '')
    // Kontrol karakterleri
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    // Ardışık boşluk/boş satır sadeleştirme
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Kalın: *metin* */
export const kalin = (s) => `*${whatsappKac(s)}*`;
/** İtalik: _metin_ */
export const italik = (s) => `_${whatsappKac(s)}_`;
/** Üstü çizili: ~metin~ */
export const ustuCizili = (s) => `~${whatsappKac(s)}~`;
/** Tek aralıklı: ```metin``` */
export const kod = (s) => '```' + whatsappKac(s) + '```';

/** Türk Lirası: 758.65 → "₺758,65" */
export function para(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

const CIZGI = '━━━━━━━━━━━━━━━━━━━━';

/** WhatsApp tek mesaj sınırı (güvenli aralık). */
export const MESAJ_LIMIT = 3500;
/** Resim açıklaması (caption) sınırı — Meta 1024, pratikte 900 kullanılır. */
export const CAPTION_LIMIT = 900;

/** Satır sınırında kırpar (etiket ortada kesilmesin). */
function kirp(metin, limit) {
  const s = String(metin || '');
  if (s.length <= limit) return s;
  const kes = s.slice(0, limit - 1);
  const satir = kes.lastIndexOf('\n');
  const govde = satir > limit * 0.6 ? kes.slice(0, satir) : kes;
  return govde.trimEnd() + '…';
}

/* ------------------------------------------------------------------ */
/* Radar kartı                                                         */
/* ------------------------------------------------------------------ */

/**
 * Otonom radar durumundan WhatsApp kartı üretir.
 *
 * Spec şablonu birebir uygulanır; `*kalın*` ve `_italik_` kullanılır.
 * Ek: gerçek dip fırsat / şişirilmiş etiket satırları (V2) varsa eklenir.
 *
 * @param {object} d radarDurumuHesapla çıktısı
 * @returns {string}
 */
export function whatsappKartOlustur(d) {
  if (!d || typeof d !== 'object') return '';

  const ad = whatsappKac(d.ad || d.urun || 'Ürün');
  const baslik = `🎯 *OTONOM FİYAT RADARI: GÜNCEL EN UCUZ*`;
  const satirlar = [baslik, CIZGI];

  if (!d.stokta) {
    satirlar.push(`📦 *${ad}*`, CIZGI);
    satirlar.push('⚠️ *Stokta satın alınabilir teklif yok.*');
    if (Number(d.tukenenSayisi) > 0) {
      satirlar.push(italik(`${Number(d.tukenenSayisi)} mağaza tükendi/stokta yok olarak elendi.`));
    }
    satirlar.push('Bir sonraki turda yeniden denenecek.');
    satirlar.push(CIZGI, '⚡ *Baskı Hesap* | 3D Baskı Fırsat Kanalı');
    return satirlar.join('\n');
  }

  satirlar.push(`📦 *${ad}*`, CIZGI);
  satirlar.push(`🏆 *Stoktaki En Ucuz:* *${para(d.fiyat)}*`);
  satirlar.push(`🏪 *Mağaza:* ${whatsappKac(d.site || '—')}`);
  satirlar.push(`🚚 *Kargo:* ${whatsappKac(d.kargo || 'Bilinmiyor')}`);
  if (d.birimMetni) {
    satirlar.push(`⚖️ *Birim Fiyat:* ${whatsappKac(d.birimMetni)}`);
  }
  satirlar.push('✅ *Stok Durumu:* 🟢 Doğrulandı (Satın Alınabilir)');

  const tukenen = Number(d.tukenenSayisi) || 0;
  satirlar.push(tukenen > 0
    ? italik(`(⚠️ ${tukenen} tükenen/stokta olmayan mağaza elendi)`)
    : italik('(✅ Tüm mağazalar stokta)'));

  // 🚨 V2 piyasa analizi — yalnızca gerçek geçmişten doğrulanmışsa
  if (d.sahteIndirim?.sahteIndirim) {
    satirlar.push(CIZGI);
    satirlar.push('⚠️ *Etiket Analizi:* Mağazanın iddia ettiği indirim yapaydır. '
      + `Son ${Number(d.sahteIndirim.pencereAdi) || 30} günün gerçek ortalaması `
      + `*${para(d.sahteIndirim.ortFiyat30)}*.`);
  }
  if (d.sahteIndirim?.gercekFirsat) {
    satirlar.push('🔥 *Piyasa Analizi:* 🟢 Tarihi dip seviye! '
      + 'Son 90 günün en düşük fiyatı yakalandı.');
  }

  const digerleri = Array.isArray(d.digerleri) ? d.digerleri.slice(0, 5) : [];
  if (digerleri.length) {
    satirlar.push(CIZGI, '📊 *Diğer Stoklu Seçenekler:*');
    for (const x of digerleri) {
      satirlar.push(`• ${whatsappKac(x.site || 'Mağaza')}: ${para(x.fiyat)}`);
    }
  }

  if (Number(d.tasarruf) > 0.5) {
    satirlar.push(CIZGI, `💡 Diğer mağazalara göre *${para(d.tasarruf)}* tasarruf!`);
  }

  const link = d.afiliyeUrl || d.hamUrl || null;
  if (link) {
    satirlar.push(CIZGI, '🛒 *Satın Alma Linki:*', String(link));
  }

  if (d.kismi) {
    satirlar.push(italik(`Kısmi tarama: ${Number(d.taranmayan) || 0} site yanıt vermedi.`));
  }

  satirlar.push(CIZGI, '⚡ *Baskı Hesap* | 3D Baskı Fırsat Kanalı');
  return kirp(satirlar.join('\n'), MESAJ_LIMIT);
}

/* ------------------------------------------------------------------ */
/* Fırsat kartı                                                        */
/* ------------------------------------------------------------------ */

/**
 * Otonom fırsat kanalı öğesinden WhatsApp kartı.
 * @param {object} f firsatAdayiBul çıktısı
 * @returns {string}
 */
export function whatsappFirsatKartOlustur(f) {
  if (!f || typeof f !== 'object') return '';
  const satirlar = [
    `🔥 *GÜNÜN FIRSATI: ${whatsappKac(f.urun)}*`,
    CIZGI,
    `🏪 *Mağaza:* ${whatsappKac(f.site)}`,
    `💰 *Fiyat:* ${ustuCizili(para(f.referans))} ➔ *${para(f.fiyat)}*`,
    `📉 *İndirim:* %${String(f.indirim ?? '—').replace('.', ',')} `
      + `(tasarruf ${para(f.fark)})`,
    `📦 *Kargo:* ${whatsappKac(f.kargo || 'Bilinmiyor')}`,
    `🏷️ *Durum:* ${whatsappKac(f.durum || 'Stokta')}`,
  ];
  if (f.url) {
    satirlar.push(CIZGI, '🛒 *Fırsatı İncele ve Satın Al:*', String(f.url));
  }
  satirlar.push(CIZGI, '⚡ *Baskı Hesap* | Gerçek Fiyat Takipçisi');
  return kirp(satirlar.join('\n'), MESAJ_LIMIT);
}

/* ------------------------------------------------------------------ */
/* Sağlayıcı adaptörleri                                               */
/* ------------------------------------------------------------------ */

/**
 * Sağlayıcı türleri.
 *
 *  - `webhook`  : Genel amaçlı gateway. `{chatId, message, imageUrl}` POST edilir.
 *                 Green-API / UltraMsg / Evolution API / Baileys köprüleri bu
 *                 şemayı kolayca kabul eder.
 *  - `green-api`: Resmî Green-API yolu (`/waInstance{id}/sendMessage/{token}`).
 *  - `ultramsg` : UltraMsg (`/messages/chat` veya `/messages/image`).
 *  - `meta`     : Meta WhatsApp Cloud API (Graph).
 */
export const SAGLAYICILAR = Object.freeze([
  { id: 'webhook', ad: 'Webhook Gateway (Green-API / Evolution / Baileys)' },
  { id: 'green-api', ad: 'Green-API (waInstance)' },
  { id: 'ultramsg', ad: 'UltraMsg' },
  { id: 'meta', ad: 'Meta Cloud API (Graph)' },
]);

/** Chat ID biçimi geçerli mi? Kanal (`@newsletter`) veya grup (`@g.us`). */
export function kanalIdGecerliMi(id) {
  const s = String(id || '').trim();
  if (!s) return false;
  // Kanal / grup / kişi (uluslararası telefon)
  return /@newsletter$/i.test(s) || /@g\.us$/i.test(s) || /@c\.us$/i.test(s)
    || /^\+?\d{10,16}$/.test(s.replace(/[\s-]/g, ''));
}

/** Hata mesajından token/anahtar sızdırmaz. */
function guvenliHata(e, token) {
  let m = String(e?.message || e || 'bilinmeyen hata');
  if (token && String(token).length >= 4) {
    m = m.split(String(token)).join('***');
  }
  // URL içindeki token benzeri parçaları maskele
  m = m.replace(/([?&](?:token|access_token|apikey|api_key|key)=)[^&\s]+/gi, '$1***');
  return m.slice(0, 240);
}

/**
 * Sağlayıcıya göre istek gövdesini ve adresini hazırlar.
 * @returns {{url:string, headers:object, body:object}}
 */
export function istekHazirla(saglayici, cfg, kart, opts = {}) {
  const chatId = String(cfg.channelId || '').trim();
  const apiUrl = String(cfg.apiUrl || '').trim().replace(/\/+$/, '');
  const token = String(cfg.token || '').trim();
  const imageUrl = opts.imageUrl ? String(opts.imageUrl) : null;

  if (saglayici === 'meta') {
    // Meta Cloud API: Phone Number ID + kalıcı token
    const phoneId = String(cfg.phoneNumberId || cfg.apiUrl || '').trim();
    const surum = String(cfg.apiVersion || 'v21.0').trim();
    const govde = imageUrl
      ? {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: chatId,
        type: 'image',
        image: { link: imageUrl, caption: kirp(kart, CAPTION_LIMIT) },
      }
      : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: chatId,
        type: 'text',
        text: { preview_url: true, body: kart },
      };
    return {
      url: `https://graph.facebook.com/${surum}/${phoneId}/messages`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: govde,
    };
  }

  if (saglayici === 'green-api' && apiUrl) {
    // https://7103.api.green-api.com  +  /waInstance{id}/sendMessage/{token}
    const yontem = imageUrl ? 'sendFileByUrl' : 'sendMessage';
    const body = imageUrl
      ? {
        chatId,
        urlFile: imageUrl,
        fileName: 'fiyat-trendi.png',
        caption: kirp(kart, CAPTION_LIMIT),
      }
      : { chatId, message: kart };
    return {
      url: `${apiUrl}/${yontem}/${token}`,
      headers: { 'Content-Type': 'application/json' },
      body,
    };
  }

  if (saglayici === 'ultramsg' && apiUrl) {
    const yontem = imageUrl ? 'messages/image' : 'messages/chat';
    const body = imageUrl
      ? {
        token, to: chatId.replace(/@.*$/, ''), image: imageUrl,
        caption: kirp(kart, CAPTION_LIMIT),
      }
      : { token, to: chatId.replace(/@.*$/, ''), body: kart };
    return {
      url: `${apiUrl}/${yontem}`,
      headers: { 'Content-Type': 'application/json' },
      body,
    };
  }

  // Varsayılan: genel webhook gateway
  return {
    url: apiUrl,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: {
      chatId,
      ...(imageUrl ? { imageUrl, caption: kirp(kart, CAPTION_LIMIT) } : {}),
      message: kart,
      // Bazı gateway'ler bu adları bekler; zararsız fazlalık.
      text: kart,
      ...(token ? { token } : {}),
    },
  };
}

/**
 * WhatsApp kanalına kart gönderir.
 *
 * Hata fırlatmaz (izolasyon): `{ok:false, hata}` döner. Radar/fırsat akışı
 * WhatsApp yüzünden ASLA durmaz.
 *
 * @param {string} kart WhatsApp Markdown metni
 * @param {{ayar?:object, saglayici?:string, channelId?:string, apiUrl?:string,
 *          token?:string, phoneNumberId?:string, imageUrl?:string,
 *          kuru?:boolean, timeoutMs?:number}} [opts]
 * @returns {Promise<{ok:boolean, hata?:string, saglayici?:string, yontem?:string,
 *                    mesajId?:string|null, kuru?:boolean}>}
 */
export async function whatsappKanalGonder(kart, opts = {}) {
  const ayar = opts.ayar || {};
  const saglayici = String(opts.saglayici || ayar.provider || 'webhook').toLowerCase();

  const cfg = {
    channelId: opts.channelId ?? ayar.channelId ?? '',
    apiUrl: opts.apiUrl ?? ayar.apiUrl ?? '',
    token: opts.token ?? ayar.token ?? '',
    phoneNumberId: opts.phoneNumberId ?? ayar.phoneNumberId ?? '',
    apiVersion: opts.apiVersion ?? ayar.apiVersion ?? 'v21.0',
  };

  const metin = String(kart || '').trim();
  if (!metin) return { ok: false, hata: 'Gönderilecek mesaj boş.' };
  if (!kanalIdGecerliMi(cfg.channelId)) {
    return {
      ok: false,
      hata: 'Kanal/Sohbet ID geçersiz. Örnek: 1203630…@newsletter veya …@g.us',
    };
  }
  if (saglayici === 'meta') {
    if (!cfg.token) return { ok: false, hata: 'Meta Cloud API erişim anahtarı (Access Token) yok.' };
    if (!(cfg.phoneNumberId || cfg.apiUrl)) {
      return { ok: false, hata: 'Meta Cloud API Phone Number ID yok.' };
    }
  } else if (!cfg.apiUrl) {
    return { ok: false, hata: 'API / Webhook URL tanımlı değil.' };
  }

  const istek = istekHazirla(saglayici, cfg, metin, { imageUrl: opts.imageUrl });

  if (opts.kuru === true) {
    return {
      ok: true, kuru: true, saglayici,
      yontem: istek.body?.type || (opts.imageUrl ? 'image' : 'text'),
      mesajId: null,
      onizleme: { url: istek.url, body: istek.body },
    };
  }

  try {
    const res = await fetch(istek.url, {
      method: 'POST',
      headers: istek.headers,
      body: JSON.stringify(istek.body),
      signal: AbortSignal.timeout(Number(opts.timeoutMs) || 20000),
    });
    const metinCevap = await res.text().catch(() => '');
    let veri = null;
    try { veri = JSON.parse(metinCevap); } catch { /* düz metin cevap */ }

    if (!res.ok) {
      const desc = (veri?.error?.message || veri?.description || metinCevap || `HTTP ${res.status}`);
      return {
        ok: false,
        saglayici,
        hata: guvenliHata(new Error(String(desc).slice(0, 180)), cfg.token),
      };
    }

    // Sağlayıcıya göre mesaj kimliği alanı değişir.
    const mesajId = veri?.messages?.[0]?.id
      || veri?.idMessage
      || veri?.message?.id
      || veri?.id
      || null;

    return {
      ok: true,
      saglayici,
      yontem: opts.imageUrl ? 'image' : 'text',
      mesajId: mesajId != null ? String(mesajId) : null,
    };
  } catch (e) {
    const zaman = /abort|timeout/i.test(String(e?.name || e?.message || ''));
    return {
      ok: false,
      saglayici,
      hata: guvenliHata(e, cfg.token) + (zaman ? ' (zaman aşımı)' : ''),
    };
  }
}

/**
 * Ayarlardan WhatsApp kanalı yapılandırmasını okur ve gönderir.
 * `settings.whatsapp.firsatKanalEnabled` kapalıysa hiçbir şey yapmaz.
 *
 * @param {string} kart
 * @param {{ayar?:object, imageUrl?:string, kuru?:boolean}} [opts]
 */
export async function whatsappAyarlaGonder(kart, opts = {}) {
  const ayar = opts.ayar || {};
  if (ayar.firsatKanalEnabled !== true) {
    return { ok: false, atlandi: true, hata: 'WhatsApp fırsat kanalı kapalı.' };
  }
  return whatsappKanalGonder(kart, {
    ayar,
    imageUrl: opts.imageUrl,
    kuru: opts.kuru,
  });
}

/**
 * Ayarları kaydetmeden ÖNCE doğrulama (Ayarlar paneli/test ucu kullanır).
 * @returns {{ok:boolean, hatalar:string[]}}
 */
export function whatsappAyarDogrula(ayar = {}) {
  const hatalar = [];
  const saglayici = String(ayar.provider || 'webhook').toLowerCase();
  if (!SAGLAYICILAR.some(s => s.id === saglayici)) {
    hatalar.push('Bilinmeyen sağlayıcı türü.');
  }
  if (!kanalIdGecerliMi(ayar.channelId)) {
    hatalar.push('Kanal/Sohbet ID geçersiz (…@newsletter veya …@g.us).');
  }
  if (saglayici === 'meta') {
    if (!String(ayar.token || '').trim()) hatalar.push('Access Token gerekli.');
    if (!String(ayar.phoneNumberId || ayar.apiUrl || '').trim()) {
      hatalar.push('Phone Number ID gerekli.');
    }
  } else if (!String(ayar.apiUrl || '').trim()) {
    hatalar.push('API / Webhook URL gerekli.');
  }
  return { ok: hatalar.length === 0, hatalar };
}
