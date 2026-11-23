/**
 * 🌍 Global 3D Baskı Üreticileri & Bölgesel Mağaza Ağları (US / FR / EU / JP) — 2026-11-23
 *
 * Her ülke/bölge kendi para birimi ve mağaza listesiyle tamamen izoledir (`market`):
 *   - us (USD): ABD filament/yazıcı üreticileri & yedek parça uzmanları
 *   - fr (EUR): Fransa filament üreticileri & 3D baskı mağazaları
 *   - eu (EUR): Avrupa resmi üreticileri & yedek parça mağazaları
 *   - jp (JPY): Japonya 3D yazıcı/reçine/filament mağazaları
 *
 * Tüm alan adları ve platform uçları canlı doğrulamadan geçirilmiştir:
 *   - Shopify     (`shopifySite`    → /search/suggest.json veya /products.json + .js/.json)
 *   - WooCommerce (`wooSite`        → /wp-json/wc/store/v1/products + JSON-LD)
 *   - PrestaShop  (`prestashopSite` → /recherche?controller=search&s= + JSON-LD)
 */
import { shopifySite } from './plt-shopify.js';
import { wooSite } from './plt-woocommerce.js';
import { prestashopSite } from './plt-prestashop.js';

function hostListesi(base, extra = []) {
  const h = new URL(base).hostname.toLowerCase();
  const ciplak = h.replace(/^www\./, '');
  const set = new Set([ciplak, `www.${ciplak}`, h]);
  for (const e of extra) {
    const eh = String(e || '').toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (eh) { set.add(eh); set.add(eh.replace(/^www\./, '')); }
  }
  return [...set];
}

export const GLOBAL_MAGAZA_TANIMLARI = Object.freeze([
  // =========================================================================
  // 🇺🇸 ABD / Global English (USD) — 32 üretici ve uzman mağaza (+ creality_us + prusa_us = 34)
  // =========================================================================
  { id: 'polymaker_us', name: 'Polymaker (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://us.polymaker.com', extraHosts: ['shop.polymaker.com'] },
  { id: 'overture_us', name: 'Overture 3D', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://overture3d.com' },
  { id: 'elegoo_us', name: 'Elegoo (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://us.elegoo.com' },
  { id: 'anycubic_us', name: 'Anycubic (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://store.anycubic.com' },
  { id: 'flashforge_us', name: 'Flashforge (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://flashforge.com' },
  { id: 'qidi_us', name: 'QIDI Tech (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://qidi3d.com', extraHosts: ['us.qidi3d.com'] },
  { id: 'sunlu_us', name: 'SUNLU Store (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://store.sunlu.com' },
  { id: 'snapmaker_us', name: 'Snapmaker (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://us.snapmaker.com', extraHosts: ['shop.snapmaker.com'] },
  { id: 'siraya_us', name: 'Siraya Tech', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://siraya.tech' },
  { id: 'jayo_us', name: 'JAYO 3D', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://jayo3d.com' },
  { id: 'eryone_us', name: 'ERYONE (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://eryone3d.com' },
  { id: 'iiidmax', name: 'IIID Max', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://iiidmax.com' },
  { id: 'inslogic_us', name: 'Inslogic (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://store.inslogic3d.com' },
  { id: 'landu_us', name: 'LANDU 3D (US)', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://store.landu3d.com' },
  { id: '3dprintersdepot_us', name: '3DPrintersDepot', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://3dprintersdepot.com' },
  { id: '3dprintingusa', name: '3DPrintingUSA', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://3dprintingusa.com' },
  { id: 'filabot_us', name: 'Filabot', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.filabot.com' },
  { id: 'sovol_us', name: 'Sovol 3D', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.sovol3d.com' },
  { id: 'biqu_us', name: 'BIQU / BigTreeTech', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://biqu.equipment' },
  { id: 'protopasta', name: 'Proto-pasta', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.proto-pasta.com' },
  { id: 'coex3d', name: 'COEX 3D', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://coex3d.com' },
  { id: 'atomicfilament', name: 'Atomic Filament', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://atomicfilament.com' },
  { id: '3dfuel', name: '3D-Fuel', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.3dfuel.com' },
  { id: 'voxelpla', name: 'VOXELPLA', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://voxelpla.com' },
  { id: 'printedsolid', name: 'Printed Solid', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.printedsolid.com' },
  { id: 'fabreeko', name: 'Fabreeko', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.fabreeko.com' },
  { id: 'west3d', name: 'West3D', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://west3d.com' },
  { id: 'microswiss', name: 'Micro Swiss', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://store.micro-swiss.com' },
  { id: 'sliceeng', name: 'Slice Engineering', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.sliceengineering.com' },
  { id: 'tinymachines3d', name: 'Tiny Machines 3D', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.tinymachines3d.com' },
  { id: 'filastruder', name: 'Filastruder', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.filastruder.com' },
  { id: 'sainsmart_us', name: 'SainSmart', market: 'us', currency: 'USD', tur: 'shopify', base: 'https://www.sainsmart.com' },

  // =========================================================================
  // 🇫🇷 Fransa (EUR) — 16 Fransız & lokalize mağaza (+ creality_fr + prusa_fr = 18)
  // =========================================================================
  { id: 'flashforge_fr', name: 'Flashforge (FR)', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://eu.flashforge.com/fr', pathPrefix: '/fr' },
  { id: 'overture_fr', name: 'Overture 3D (EU/FR)', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://overture3d.com/en-eu', pathPrefix: '/en-eu' },
  { id: 'sunlu_fr', name: 'SUNLU Store (FR)', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://store.sunlu.com/fr', pathPrefix: '/fr' },
  { id: 'snapmaker_fr', name: 'Snapmaker (FR)', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://eu.snapmaker.com/fr', pathPrefix: '/fr' },
  { id: 'landu_fr', name: 'LANDU 3D (FR)', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://store.landu3d.com/fr', pathPrefix: '/fr' },
  { id: 'eryone_fr', name: 'ERYONE (FR)', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://eryone3d.com/fr', pathPrefix: '/fr', currencyQuery: true },
  { id: 'qidi_fr', name: 'QIDI Tech (FR)', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://eu.qidi3d.com/fr', pathPrefix: '/fr' },
  { id: 'makershop_fr', name: 'Makershop', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://www.makershop.fr' },
  { id: 'atome3d', name: 'Atome3D', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://www.atome3d.com' },
  { id: 'filimprimante3d', name: 'Filimprimante3D', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://www.filimprimante3d.fr' },
  { id: 'wanhao_fr', name: 'Wanhao France', market: 'fr', currency: 'EUR', tur: 'shopify', base: 'https://www.wanhao-europe.com' },
  { id: 'francofil', name: 'Francofil', market: 'fr', currency: 'EUR', tur: 'woo', base: 'https://francofil.fr' },
  { id: 'filamentabs_fr', name: 'Filament-ABS.fr', market: 'fr', currency: 'EUR', tur: 'woo', base: 'https://www.filament-abs.fr' },
  { id: 'arianeplast', name: 'Arianeplast', market: 'fr', currency: 'EUR', tur: 'presta', base: 'https://www.arianeplast.com', aramaYolu: '/recherche?controller=search&s=' },
  { id: 'polyfab3d', name: 'Polyfab3D', market: 'fr', currency: 'EUR', tur: 'presta', base: 'https://www.polyfab3d.fr', aramaYolu: '/recherche?controller=search&s=' },
  { id: 'sovb3d', name: 'SOVB 3D', market: 'fr', currency: 'EUR', tur: 'presta', base: 'https://www.sovb3d.fr', aramaYolu: '/recherche?controller=search&s=' },

  // =========================================================================
  // 🇪🇺 Avrupa (EUR) — 11 üretici ve parça mağazası (+ creality_eu = 12)
  // =========================================================================
  { id: 'elegoo_eu', name: 'Elegoo (EU)', market: 'eu', currency: 'EUR', tur: 'shopify', base: 'https://eu.elegoo.com' },
  { id: 'anycubic_eu', name: 'Anycubic (EU)', market: 'eu', currency: 'EUR', tur: 'shopify', base: 'https://eu.anycubic.com' },
  { id: 'qidi_eu', name: 'QIDI Tech (EU)', market: 'eu', currency: 'EUR', tur: 'shopify', base: 'https://eu.qidi3d.com' },
  { id: 'flashforge_eu', name: 'Flashforge (EU)', market: 'eu', currency: 'EUR', tur: 'shopify', base: 'https://eu.flashforge.com' },
  { id: 'e3d_eu', name: 'E3D Online', market: 'eu', currency: 'EUR', tur: 'shopify', base: 'https://e3d-online.com' },
  { id: 'recyclingfabrik_eu', name: 'Recycling Fabrik', market: 'eu', currency: 'EUR', tur: 'shopify', base: 'https://www.recyclingfabrik.com' },
  { id: 'redline_eu', name: 'Redline Filament', market: 'eu', currency: 'EUR', tur: 'shopify', base: 'https://www.redline-filament.com' },
  { id: 'dasfilament_eu', name: 'DAS FILAMENT', market: 'eu', currency: 'EUR', tur: 'woo', base: 'https://www.dasfilament.de' },
  { id: 'filamentworld_eu', name: 'Filamentworld', market: 'eu', currency: 'EUR', tur: 'woo', base: 'https://www.filamentworld.de' },
  { id: 'meltbro_eu', name: 'Meltbro', market: 'eu', currency: 'EUR', tur: 'woo', base: 'https://meltbro.de' },
  { id: 'azurefilm_eu', name: 'AzureFilm', market: 'eu', currency: 'EUR', tur: 'woo', base: 'https://azurefilm.com' },

  // =========================================================================
  // 🇯🇵 Japonya (JPY) — 7 mağaza (+ creality_jp + prusa_ja = 9)
  // =========================================================================
  { id: '3dprintersdepot_jp', name: '3DPrintersDepot (JP)', market: 'jp', currency: 'JPY', tur: 'shopify', base: 'https://3dprintersdepot.com/en-jp', pathPrefix: '/en-jp' },
  { id: 'inslogic_jp', name: 'Inslogic (JP)', market: 'jp', currency: 'JPY', tur: 'shopify', base: 'https://store.inslogic3d.com/ja', pathPrefix: '/ja', currencyQuery: true },
  { id: 'skhonpo_jp', name: 'SK本舗 (SK Honpo)', market: 'jp', currency: 'JPY', tur: 'shopify', base: 'https://skhonpo.com' },
  { id: 'sunstella_jp', name: 'サンステラ (Sunstella)', market: 'jp', currency: 'JPY', tur: 'shopify', base: 'https://sunstella.co.jp' },
  { id: 'elegoo_jp', name: 'ELEGOO (JP)', market: 'jp', currency: 'JPY', tur: 'shopify', base: 'https://jp.elegoo.com' },
  { id: 'qidi_jp', name: 'QIDI Tech (JP)', market: 'jp', currency: 'JPY', tur: 'shopify', base: 'https://jp.qidi3d.com' },
  { id: 'switchscience_jp', name: 'スイッチサイエンス (Switch Science)', market: 'jp', currency: 'JPY', tur: 'shopify', base: 'https://www.switch-science.com' },
]);

export const globalSiteler = GLOBAL_MAGAZA_TANIMLARI.map((m) => {
  const ortak = {
    id: m.id,
    name: m.name,
    market: m.market,
    currency: m.currency,
    hosts: hostListesi(m.base, m.extraHosts),
    base: m.base,
    ...(m.pathPrefix ? { pathPrefix: m.pathPrefix } : {}),
    ...(m.currencyQuery ? { currencyQuery: true } : {}),
  };
  if (m.tur === 'woo') return wooSite(ortak);
  if (m.tur === 'presta') return prestashopSite({ ...ortak, aramaYolu: m.aramaYolu });
  return shopifySite(ortak);
});

export const globalKatalogHedefleri = GLOBAL_MAGAZA_TANIMLARI
  .filter(m => m.tur === 'shopify' || m.tur === 'woo')
  .map(m => ({ siteId: m.id, tur: m.tur, base: m.base, paraBirimi: m.currency }));
