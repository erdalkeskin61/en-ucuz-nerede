/**
 * Satış ortaklığı (affiliate) referansı — 2026-10-28
 *
 * İLKE 1 — TARAFSIZLIK: Bu modül fiyat, sıralama veya "en ucuz" kararına HİÇ dokunmaz.
 *   Yalnızca kullanıcı "Ürüne git" bağlantısına tıkladığında hedef adrese referans
 *   parametresi eklenir. Aynı ürünün fiyatı ve sıralaması önce/sonra aynıdır.
 *
 * İLKE 2 — DÜRÜSTLÜK (proje kuralı): hiçbir ağın parametre biçimi UYDURULMAZ.
 *   Trendyol/Hepsiburada/Amazon ve aracı ağlar (GelirOrtaklari, ReklamAction) kendi
 *   panelinde size bir parametre adı + değer (token) ya da hazır yönlendirme şablonu
 *   verir. Bunlar Ayarlar'dan girilir. Girilmemişse link OLDUĞU GİBİ bırakılır ve
 *   arayüzde "referans eklenmedi" olarak görünür. Böylece "kazandım" sanılan ama
 *   aslında hiçbir komisyon işlemeyen sessiz bir durum oluşmaz.
 *
 * İLKE 3 — KULLANICIYA EK MALİYET YOK: Referans parametresi yalnızca kimin
 *   yönlendirdiğini bildirir; sepette/fiyatta değişiklik yaratmaz.
 *
 * İki mod:
 *  1) "param"     → hedef URL'ye ?<parametre>=<token> eklenir (mevcut sorgu korunur).
 *  2) "sablon"    → ağın verdiği yönlendirme adresi. {url} ve {token} yer tutucuları
 *                   doldurulur; ör. https://ag.example.com/git?u={url}&ref={token}
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getSettings, saveSettings } from './store.js';

/** Hangi site hangi ağa bağlı (kullanıcı Ayarlar'dan değiştirebilir). */
export const SITE_AGLARI = {
  trendyol: 'trendyol',
  hepsiburada: 'hepsiburada',
  amazon: 'amazon',
};

/**
 * Ağ bilgileri. `komisyon` yalnızca bilgilendirme amaçlıdır — hesaplamaya girmez.
 * `varsayilanParametre`: yalnızca biçimi KESİN olan ağlarda dolu bırakılır.
 *   Amazon Associates: `tag` (örn. siteadi-21) — resmî ve sabittir.
 *   Trendyol / Hepsiburada: panelin verdiği parametre adı değişebildiği için boş;
 *   kullanıcı kendi panelinden kopyalar (uydurulmuş ad yazılmaz).
 */
export const AG_BILGILERI = {
  trendyol: {
    ad: 'Trendyol Link Gelir Programı',
    komisyon: '%1,5 – %8',
    varsayilanParametre: '',
    parametreIpucu: 'Panelin verdiği parametre adı (ör. utm_source)',
  },
  hepsiburada: {
    ad: 'Hepsiburada İş Ortaklığı',
    komisyon: '%2 – %7',
    varsayilanParametre: '',
    parametreIpucu: 'Panelin verdiği parametre adı',
  },
  amazon: {
    ad: 'Amazon Associates TR',
    komisyon: '%3 – %11',
    varsayilanParametre: 'tag',
    parametreIpucu: 'tag (ör. siteadi-21)',
  },
  gelirortaklari: {
    ad: 'GelirOrtaklari.com (niş e-ticaret ağı)',
    komisyon: 'mağaza bazlı',
    varsayilanParametre: '',
    parametreIpucu: 'Ağın verdiği yönlendirme şablonu',
    sablonGerekli: true,
  },
  reklamaction: {
    ad: 'ReklamAction (niş e-ticaret ağı)',
    komisyon: 'mağaza bazlı',
    varsayilanParametre: '',
    parametreIpucu: 'Ağın verdiği yönlendirme şablonu',
    sablonGerekli: true,
  },
};

const VARSAYILAN_AYARLAR = {
  etkin: true,
  aglar: {
    trendyol: { etkin: false, parametre: '', token: '', sablon: '' },
    hepsiburada: { etkin: false, parametre: '', token: '', sablon: '' },
    amazon: { etkin: false, parametre: 'tag', token: '', sablon: '' },
    gelirortaklari: { etkin: false, parametre: '', token: '', sablon: '' },
    reklamaction: { etkin: false, parametre: '', token: '', sablon: '' },
  },
  /** siteId → ağ kimliği (varsayılan eşlemenin üzerine yazar; niş siteler için). */
  siteAg: {},
  /** siteId → yönlendirme şablonu (ağ şablonundan daha özel). */
  siteSablon: {},
};

/** Kayıtlı ayarları varsayılanlarla birleştirir (eksik alanlar bozulmasın). */
export function afiliyeAyarlari() {
  const kayitli = getSettings().afiliye || {};
  const aglar = {};
  for (const [id, varsayilan] of Object.entries(VARSAYILAN_AYARLAR.aglar)) {
    aglar[id] = { ...varsayilan, ...(kayitli.aglar?.[id] || {}) };
  }

  // Eski biçim uyumluluğu: siteSablon değeri düz metin (şablon) olabilir.
  // Yeni biçim: { sablon, hedefParametre, token }.
  const siteSablon = {};
  for (const [site, v] of Object.entries(kayitli.siteSablon || {})) {
    const anahtar = String(site).toLowerCase();
    if (typeof v === 'string') {
      if (v.trim()) siteSablon[anahtar] = { sablon: v.trim(), hedefParametre: '', token: '' };
    } else if (v && typeof v === 'object') {
      const sablon = String(v.sablon || '').trim();
      if (sablon) {
        siteSablon[anahtar] = {
          sablon: sablon.slice(0, 500),
          hedefParametre: String(v.hedefParametre || '').trim().slice(0, 40),
          token: String(v.token || '').trim().slice(0, 200),
        };
      }
    }
  }

  const siteAg = {};
  for (const [site, ag] of Object.entries(kayitli.siteAg || {})) {
    siteAg[String(site).toLowerCase()] = ag;
  }

  return {
    etkin: kayitli.etkin !== false,
    aglar,
    siteAg,
    siteSablon,
  };
}

/** Ayarları kaydeder (doğrulayarak; bilinmeyen ağ anahtarları atılır). */
export function afiliyeKaydet(patch = {}) {
  const mevcut = afiliyeAyarlari();
  const aglar = { ...mevcut.aglar };
  for (const [id, gelen] of Object.entries(patch.aglar || {})) {
    if (!AG_BILGILERI[id]) continue; // tanımsız ağ yazılmaz
    aglar[id] = {
      etkin: gelen?.etkin === true,
      parametre: String(gelen?.parametre ?? aglar[id].parametre ?? '').trim().slice(0, 40),
      token: String(gelen?.token ?? aglar[id].token ?? '').trim().slice(0, 200),
      sablon: String(gelen?.sablon ?? aglar[id].sablon ?? '').trim().slice(0, 500),
      hedefParametre: String(gelen?.hedefParametre ?? aglar[id].hedefParametre ?? '').trim().slice(0, 40),
    };
  }

  const temizSiteAg = {};
  for (const [site, ag] of Object.entries(patch.siteAg || {})) {
    if (!AG_BILGILERI[ag]) continue;
    // Site kimliği küçük harfe çevrilir: adaptör kimlikleri küçüktür, kullanıcı
    // "FLO" yazsa da eşleşme bozulmasın (2026-10-29).
    if (!/^[a-z0-9_-]{2,40}$/i.test(String(site))) continue;
    temizSiteAg[String(site).toLowerCase()] = String(ag);
  }
  const temizSablon = {};
  for (const [site, ham] of Object.entries(patch.siteSablon || {})) {
    if (!/^[a-z0-9_-]{2,40}$/i.test(String(site))) continue;
    // Değer düz metin (şablon) ya da { sablon, hedefParametre, token } olabilir.
    const sablon = String(typeof ham === 'object' && ham !== null ? (ham.sablon || '') : (ham || '')).trim().slice(0, 500);
    if (!sablon) continue;
    temizSablon[String(site).toLowerCase()] = {
      sablon,
      hedefParametre: String(typeof ham === 'object' && ham !== null ? (ham.hedefParametre || '') : '').trim().slice(0, 40),
      token: String(typeof ham === 'object' && ham !== null ? (ham.token || '') : '').trim().slice(0, 200),
    };
  }

  const yeni = {
    etkin: patch.etkin !== false,
    aglar,
    siteAg: patch.siteAg !== undefined ? temizSiteAg : mevcut.siteAg,
    siteSablon: patch.siteSablon !== undefined ? temizSablon : mevcut.siteSablon,
  };
  saveSettings({ afiliye: yeni });
  return yeni;
}

/**
 * Şablonu doldurur.
 *
 * Üç biçim desteklenir (2026-10-29 — kullanıcı bildirimi):
 *
 *  1) `{url}` içeren şablon → hedef ürünle değiştirilir.
 *     ör. `https://ag.example.com/git?u={url}&ref={token}`
 *
 *  2) `{url}` İÇERMEYEN ama "hedef parametresi" tanımlı şablon → ürün adresi
 *     o parametreye eklenir. Parametre ADINI kullanıcı yazar (uydurulmaz).
 *     ör. şablon `https://ad.reklm.com/aff_c?offer_id=1&aff_id=2`
 *         + hedefParametre `url` → `...&url=https%3A%2F%2F...`
 *
 *  3) `{url}` İÇERMEYEN ve hedef parametresi de yok → şablon OLDUĞU GİBİ kullanılır.
 *     Bu, ağın "teklif" (offer) linkidir: mağazanın tamamı tek teklifse doğru
 *     davranış budur. Sessizce yok saymak yerine kullanıcıya bilgi verilir.
 *
 * `{token}` her durumda doldurulur.
 */
function sablonUygula(sablon, url, token, hedefParametre) {
  const s = String(sablon || '').trim();
  if (!s) return null;
  let cikti = s.replaceAll('{token}', encodeURIComponent(token || ''));

  if (cikti.includes('{url}')) {
    return cikti.replaceAll('{url}', encodeURIComponent(url));
  }

  // Hedef parametresi verilmişse ürün adresini o parametreye ekle
  const param = String(hedefParametre || '').trim();
  if (param && url) {
    try {
      const u = new URL(cikti);
      u.searchParams.set(param, url);
      return u.toString();
    } catch {
      // Şablon geçerli URL değilse dokunma
      return cikti;
    }
  }

  // Sabit teklif linki: olduğu gibi
  return cikti;
}

/**
 * Bir ürün adresini satış ortaklığı referansıyla döndürür.
 * Yapılandırma eksikse adresi AYNEN döndürür (uydurma parametre yok).
 *
 * @param {string} siteId site kimliği (ör. 'trendyol')
 * @param {string} url ürünün temiz adresi
 * @param {object} [ayarlar] önceden okunmuş ayarlar (toplu işlerde tekrar okumamak için)
 * @returns {string} referanslı (ya da olduğu gibi) adres
 */
export function afiliyeLink(siteId, url, ayarlar = null) {
  if (!url || typeof url !== 'string') return url;
  const a = ayarlar || afiliyeAyarlari();
  if (!a.etkin) return url;

  // Site kimliği büyük/küçük harf farkıyla kaydedilmiş olabilir (ör. "FLO").
  const site = String(siteId || '').toLowerCase();
  const agId = a.siteAg[site] || SITE_AGLARI[site];
  const ag = agId ? a.aglar[agId] : null;

  // 1) Siteye özel şablon (niş mağaza deeplink'i)
  //    Kayıt nesne ({sablon, hedefParametre, token}) ya da düz metin olabilir —
  //    ikisi de kabul edilir (elle oluşturulan ayar nesneleri/testler için).
  const siteKayit = a.siteSablon[site];
  if (siteKayit) {
    const sablon = typeof siteKayit === 'string' ? siteKayit : siteKayit.sablon;
    const hedef = typeof siteKayit === 'string' ? '' : siteKayit.hedefParametre;
    const siteToken = typeof siteKayit === 'string' ? '' : siteKayit.token;
    const s = sablonUygula(sablon, url, siteToken || ag?.token, hedef);
    if (s) return s;
  }

  if (!ag || !ag.etkin) return url;

  // 2) Ağ şablonu (yönlendirici ağlar)
  if (ag.sablon) {
    const s = sablonUygula(ag.sablon, url, ag.token, ag.hedefParametre);
    if (s) return s;
  }

  // 3) Parametre ekleme — parametre adı ve token ikisi de gerekir
  if (!ag.parametre || !ag.token) return url;

  try {
    const u = new URL(url);
    u.searchParams.set(ag.parametre, ag.token);
    return u.toString();
  } catch {
    return url; // geçersiz adres: dokunma
  }
}

/**
 * Bağlantının gerçekten referans taşıyıp taşımadığını söyler (arayüz etiketi için).
 * Fiyat tarafını etkilemez; yalnızca "bu link komisyon içeriyor" bilgisi.
 */
export function afiliyeMi(siteId, url) {
  const hedef = afiliyeLink(siteId, url);
  return hedef && hedef !== url;
}

/**
 * /api/durum ve Ayarlar paneli için özet — token'lar maskelenir.
 * @param {string[]|null} bilinenSiteler kayıtlı adaptör kimlikleri. Verilirse
 *   site şablonlarının gerçekten eşleştiği işaretlenir (2026-10-29: "flo" gibi
 *   kayıtlı olmayan bir kimlik için şablon sessizce hiç çalışmıyordu).
 */
export function afiliyeOzet(bilinenSiteler = null) {
  const a = afiliyeAyarlari();
  const bilinen = Array.isArray(bilinenSiteler) ? new Set(bilinenSiteler.map(s => String(s).toLowerCase())) : null;

  /** Şablon "hazır" mı? {url} ya da hedef parametresi varsa ürün bazlı çalışır. */
  const sablonHazir = (sablon, hedefParametre) =>
    !!sablon && (String(sablon).includes('{url}') || !!String(hedefParametre || '').trim());

  const aglar = Object.entries(AG_BILGILERI).map(([id, bilgi]) => {
    const cfg = a.aglar[id] || {};
    const hazir = !!(cfg.etkin && ((cfg.parametre && cfg.token) || sablonHazir(cfg.sablon, cfg.hedefParametre)));
    return {
      id,
      ad: bilgi.ad,
      komisyon: bilgi.komisyon,
      etkin: !!cfg.etkin,
      parametre: cfg.parametre || '',
      parametreIpucu: bilgi.parametreIpucu,
      sablonVar: !!cfg.sablon,
      hedefParametre: cfg.hedefParametre || '',
      tokenVar: !!cfg.token,
      tokenMaskeli: cfg.token ? cfg.token.slice(0, 3) + '…' + cfg.token.slice(-2) : '',
      hazir,
    };
  });

  // Site şablonları: panelde listelemek için (token maskelenir)
  const siteSablonlari = Object.entries(a.siteSablon).map(([site, v]) => ({
    site,
    sablon: v.sablon,
    hedefParametre: v.hedefParametre || '',
    tokenVar: !!v.token,
    // Dürüst bilgi: {url} ya da hedef parametresi yoksa bağlantı sabit teklif linkidir
    sablonTipi: v.sablon.includes('{url}') ? 'urun' : (v.hedefParametre ? 'parametre' : 'teklif'),
    // Adaptör kayıtlı değilse şablon hiç uygulanmaz → kullanıcı bilsin
    siteKayitli: bilinen ? bilinen.has(site) : null,
  }));

  const eksik = aglar.filter(x => x.etkin && !x.hazir).map(x => x.ad);
  return {
    etkin: a.etkin,
    aglar,
    siteAg: a.siteAg,
    siteSablon: a.siteSablon,
    siteSablonlari,
    siteSablonSayisi: siteSablonlari.length,
    // Dürüst durum: hangi ağlar kazanç üretiyor, hangileri yapılandırma bekliyor
    durum: !a.etkin
      ? 'kapalı'
      : ((aglar.some(x => x.hazir) || siteSablonlari.length) ? 'aktif' : 'yapılandırma bekliyor'),
    eksikYapilandirma: eksik,
    bilgi: 'Fiyatlar ve sıralama referanstan bağımsızdır; kullanıcıya ek maliyet yoktur.',
  };
}

/* --------------------------- tıklama sayacı (yerel) --------------------------- */
// Amaç: "link gerçekten tıklanıyor mu" sorusunu ölçmek. Kişisel veri yok;
// yalnızca gün + site + sayı tutulur. Ağ isteği yapılmaz, dosya yerel kalır.

const TIKLAMA_DOSYASI = () => path.join(config.dataDir, 'afiliye-tiklamalar.json');

function tiklamalariOku() {
  try {
    return JSON.parse(fs.readFileSync(TIKLAMA_DOSYASI(), 'utf8'));
  } catch {
    return {};
  }
}

export function tiklaKaydet(siteId) {
  const site = String(siteId || '').slice(0, 40);
  if (!site) return false;
  const gun = new Date().toISOString().slice(0, 10);
  const veri = tiklamalariOku();
  veri[gun] = veri[gun] || {};
  veri[gun][site] = (veri[gun][site] || 0) + 1;
  // 400 günden eskisini at (dosya şişmesin)
  const esik = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
  for (const g of Object.keys(veri)) if (g < esik) delete veri[g];
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(TIKLAMA_DOSYASI(), JSON.stringify(veri));
    return true;
  } catch {
    return false;
  }
}

export function tiklaOzet(gunSayisi = 30) {
  const veri = tiklamalariOku();
  const gunler = Object.keys(veri).sort().slice(-gunSayisi);
  const toplam = {};
  let tumu = 0;
  for (const g of gunler) {
    for (const [site, adet] of Object.entries(veri[g])) {
      toplam[site] = (toplam[site] || 0) + adet;
      tumu += adet;
    }
  }
  return { gunSayisi: gunler.length, toplamTiklama: tumu, siteler: toplam };
}
