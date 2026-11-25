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
  amazon_us: 'amazon_us',
  amazon_fr: 'amazon_fr',
  amazon_jp: 'amazon_jp',
  creality: 'impact',
  creality_us: 'impact',
  creality_fr: 'impact',
  creality_eu: 'impact',
  creality_jp: 'impact',
  elegoo_us: 'impact',
  elegoo_eu: 'impact',
  elegoo_jp: 'impact',
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
  amazon_us: {
    ad: 'Amazon Associates US (amazon.com)',
    komisyon: '%1 – %4,5',
    varsayilanParametre: 'tag',
    parametreIpucu: 'tag (ör. baskihesap-20)',
  },
  amazon_fr: {
    ad: 'Amazon Partenaires FR / OneLink (amazon.fr)',
    komisyon: '%1 – %5',
    varsayilanParametre: 'tag',
    parametreIpucu: 'tag (FR kimliği ya da OneLink bağlı US tag)',
  },
  amazon_jp: {
    ad: 'Amazon Associates JP / OneLink (amazon.co.jp)',
    komisyon: '%2 – %5',
    varsayilanParametre: 'tag',
    parametreIpucu: 'tag (JP kimliği ya da OneLink bağlı US tag)',
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
  admitad: {
    ad: 'Admitad / Mitgo (MediaMarkt, n11, Koçtaş…)',
    komisyon: '%1,5 – %8',
    varsayilanParametre: '',
    parametreIpucu: 'Ağın verdiği deeplink şablonu ({url})',
    sablonGerekli: true,
  },
  impact: {
    ad: 'Impact.com (Creality, Bambu Lab vb. markalar)',
    komisyon: '%3 – %8',
    varsayilanParametre: '',
    parametreIpucu: 'Ağın verdiği yönlendirme şablonu ({url})',
    sablonGerekli: true,
  },
  shopify_collabs: {
    ad: 'Shopify Collabs (Doğrudan Shopify Mağazaları)',
    komisyon: '%3 – %10 (mağaza bazlı)',
    varsayilanParametre: '',
    parametreIpucu: 'Ör. dt_id veya ref — mağaza bazlı şablon da eklenebilir',
  },
};

const VARSAYILAN_AYARLAR = {
  etkin: true,
  aglar: {
    trendyol: { etkin: false, parametre: '', token: '', sablon: '' },
    hepsiburada: { etkin: false, parametre: '', token: '', sablon: '' },
    amazon: { etkin: false, parametre: 'tag', token: '', sablon: '' },
    amazon_us: { etkin: false, parametre: 'tag', token: '', sablon: '' },
    amazon_fr: { etkin: false, parametre: 'tag', token: '', sablon: '' },
    amazon_jp: { etkin: false, parametre: 'tag', token: '', sablon: '' },
    gelirortaklari: { etkin: false, parametre: '', token: '', sablon: '' },
    reklamaction: { etkin: false, parametre: '', token: '', sablon: '' },
    admitad: { etkin: false, parametre: '', token: '', sablon: '' },
    impact: {
      etkin: true,
      parametre: '',
      token: '',
      sablon: 'https://crealityofficialstore.sjv.io/c/8295867/2050362/25652?u={url}',
    },
    shopify_collabs: { etkin: false, parametre: '', token: '', sablon: '' },
  },
  /** siteId → ağ kimliği (varsayılan eşlemenin üzerine yazar; niş siteler için). */
  siteAg: {},
  /** siteId → yönlendirme şablonu (ağ şablonundan daha özel). */
  siteSablon: {},
};

const VARSAYILAN_SITE_SABLONLARI = Object.freeze({
  overture_us: '?aff=322&utm_source=affiliate&utm_medium=referral&utm_campaign=baskihesap',
  overture_fr: '?aff=322&utm_source=affiliate&utm_medium=referral&utm_campaign=baskihesap',
  sunlu_us: '?sca_ref=12826606.cWbS5xfVJW&utm_source=sunluaffiliate&utm_medium=sunluaffiliate&utm_campaign=sunluaffiliate',
  sunlu_fr: '?sca_ref=12826606.cWbS5xfVJW&utm_source=sunluaffiliate&utm_medium=sunluaffiliate&utm_campaign=sunluaffiliate',
  protopasta: '?aff=321',
  flashforge_us: 'https://flashforge.sjv.io/c/8295867/3092803/38200?u={url}',
  flashforge_fr: 'https://flashforge.sjv.io/c/8295867/3092803/38200?u={url}',
  flashforge_eu: 'https://flashforge.sjv.io/c/8295867/3092803/38200?u={url}',
  sovol_us: 'https://sovol3d.sjv.io/c/8295867/3963679/55332?u={url}',
  elegoo_us: 'https://elegoo.sjv.io/c/8295867/1692726/19663?u={url}',
  elegoo_eu: 'https://elegoo.sjv.io/c/8295867/1692726/19663?u={url}',
  elegoo_jp: 'https://elegoo.sjv.io/c/8295867/1692726/19663?u={url}',
});

/** Kayıtlı ayarları varsayılanlarla birleştirir (eksik alanlar bozulmasın). */
export function afiliyeAyarlari() {
  const kayitli = getSettings().afiliye || {};
  const aglar = {};
  const envTagHarita = {
    amazon_us: String(process.env.AMAZON_TAG_US || '').trim(),
    amazon_fr: String(process.env.AMAZON_TAG_FR || '').trim(),
    amazon_jp: String(process.env.AMAZON_TAG_JP || '').trim(),
  };
  for (const [id, varsayilan] of Object.entries(VARSAYILAN_AYARLAR.aglar)) {
    const birlesik = { ...varsayilan, ...(kayitli.aglar?.[id] || {}) };
    if (!birlesik.token && envTagHarita[id]) {
      birlesik.token = envTagHarita[id];
      if (!birlesik.parametre) birlesik.parametre = 'tag';
      birlesik.etkin = true;
    }
    if (id === 'impact' && !birlesik.sablon && varsayilan.sablon) {
      birlesik.sablon = varsayilan.sablon;
      birlesik.etkin = true;
    }
    aglar[id] = birlesik;
  }

  // Eski biçim uyumluluğu: siteSablon değeri düz metin (şablon) olabilir.
  // Yeni biçim: { sablon, hedefParametre, token }.
  const siteSablon = {};
  for (const [site, sablon] of Object.entries(VARSAYILAN_SITE_SABLONLARI)) {
    siteSablon[site] = { sablon, hedefParametre: '', token: '' };
  }
  const ebayCampId = /^\d{6,14}$/.test(String(process.env.EBAY_CAMPAIGN_ID || '').trim())
    ? String(process.env.EBAY_CAMPAIGN_ID).trim()
    : '';
  if (ebayCampId) {
    siteSablon.ebay_us = {
      sablon: `?mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=${ebayCampId}&toolid=10001`,
      hedefParametre: '',
      token: '',
    };
    siteSablon.ebay_fr = {
      sablon: `?mkevt=1&mkcid=1&mkrid=709-53476-19255-0&campid=${ebayCampId}&toolid=10001`,
      hedefParametre: '',
      token: '',
    };
  }
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

  // 0) Sorgu parametresi şablonu (?dt_id=... veya &ref=... — Shopify Collabs / UTM için):
  //    Ürünün kendi adresini ve mevcut ?variant=... parametrelerini bozmadan eklenir.
  if (/^[?&][^=]+=/.test(cikti)) {
    try {
      const u = new URL(url);
      const ek = new URLSearchParams(cikti.replace(/^[?&]+/, ''));
      for (const [k, v] of ek.entries()) {
        if (k) u.searchParams.set(k, v);
      }
      return u.toString();
    } catch {
      return url;
    }
  }

  if (cikti.includes('{url}')) {
    return cikti.replaceAll('{url}', encodeURIComponent(url));
  }
  if (cikti.includes('{raw_url}')) {
    return cikti.replaceAll('{raw_url}', url);
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

  /** Şablon "hazır" mı? {url}, {raw_url}, ?param=val ya da hedef parametresi varsa ürün bazlı çalışır. */
  const sablonHazir = (sablon, hedefParametre) =>
    !!sablon && (
      String(sablon).includes('{url}')
      || String(sablon).includes('{raw_url}')
      || /^[?&][^=]+=/.test(String(sablon).trim())
      || !!String(hedefParametre || '').trim()
    );

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
    sablonTipi: (v.sablon.includes('{url}') || v.sablon.includes('{raw_url}'))
      ? 'urun'
      : ((v.hedefParametre || /^[?&][^=]+=/.test(v.sablon)) ? 'parametre' : 'teklif'),
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

/**
 * Yalnızca yönetici paneli (`GET /api/afiliye`) için kayıtlı ağ ve mağaza şablonlarını
 * açıkça okunabilir tablo satırları olarak döner.
 */
export function afiliyeKayitTablosu(bilinenSiteler = []) {
  const a = afiliyeAyarlari();
  const bilinen = Array.isArray(bilinenSiteler) ? new Set(bilinenSiteler.map(s => String(s).toLowerCase())) : null;
  const ozet = afiliyeOzet(bilinenSiteler);
  const ozetHarita = Object.fromEntries(ozet.aglar.map(x => [x.id, x]));

  const agSiteleri = {};
  for (const [site, agId] of Object.entries(SITE_AGLARI)) {
    const k = String(site).toLowerCase();
    const guncelAg = a.siteAg[k] || agId;
    if (!agSiteleri[guncelAg]) agSiteleri[guncelAg] = [];
    agSiteleri[guncelAg].push(k);
  }
  for (const [site, agId] of Object.entries(a.siteAg || {})) {
    const k = String(site).toLowerCase();
    if (!agSiteleri[agId]) agSiteleri[agId] = [];
    if (!agSiteleri[agId].includes(k)) agSiteleri[agId].push(k);
  }

  const satirlar = [];
  for (const [id, bilgi] of Object.entries(AG_BILGILERI)) {
    const cfg = a.aglar[id] || {};
    const hazir = !!ozetHarita[id]?.hazir;
    const dolduruldu = !!(cfg.etkin || cfg.token || cfg.sablon || cfg.hedefParametre);
    satirlar.push({
      tur: 'ag',
      kimlik: id,
      ad: bilgi.ad,
      etkin: !!cfg.etkin,
      hazir,
      dolduruldu,
      parametre: cfg.parametre || '',
      token: cfg.token || '',
      sablon: cfg.sablon || '',
      hedefParametre: cfg.hedefParametre || '',
      siteler: agSiteleri[id] || [],
    });
  }

  for (const [site, v] of Object.entries(a.siteSablon || {})) {
    const k = String(site).toLowerCase();
    satirlar.push({
      tur: 'site',
      kimlik: k,
      ad: k,
      etkin: true,
      hazir: true,
      dolduruldu: true,
      parametre: v?.hedefParametre || '',
      token: v?.token || '',
      sablon: v?.sablon || '',
      hedefParametre: v?.hedefParametre || '',
      siteler: [k],
      siteKayitli: bilinen ? bilinen.has(k) : null,
    });
  }

  return satirlar;
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

/**
 * Meshy & Hi3D 3D model üretim araçları için ortak link çözümleyici.
 * `IMPACT_MESHY_URL` / `IMPACT_HI3D_URL` tanımlanırsa takip linkine döner;
 * tanımlı değilse temiz doğrudan ürün URL'lerini verir.
 */
export function aiModelPartnerLinkleri() {
  const guvenliUrl = (ham, varsayilan) => {
    const s = String(ham || '').trim();
    if (/^https?:\/\//i.test(s)) return { url: s, afiliye: true };
    return { url: varsayilan, afiliye: false };
  };
  const temizPromo = (ham) => {
    const s = String(ham || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    return s || null;
  };
  const meshy = guvenliUrl(process.env.IMPACT_MESHY_URL, 'https://www.meshy.ai');
  const hi3d = guvenliUrl(process.env.IMPACT_HI3D_URL, 'https://www.hi3d.ai');
  return {
    meshyUrl: meshy.url,
    hi3dUrl: hi3d.url,
    meshyAfiliye: meshy.afiliye,
    hi3dAfiliye: hi3d.afiliye,
    meshyPromo: temizPromo(process.env.IMPACT_MESHY_PROMO),
    hi3dPromo: temizPromo(process.env.IMPACT_HI3D_PROMO),
  };
}
