/** Desteklenen sitelerin kayıt defteri. */
import trendyol from './trendyol.js';
import hepsiburada from './hepsiburada.js';
import amazon from './amazon.js';
import vatan from './vatan.js';
import mediamarkt from './mediamarkt.js';
import itopya from './itopya.js';
import pazarama from './pazarama.js';
import incehesap from './incehesap.js';
import { ucdSiteler } from './ucd.js';
import { yeniSiteler } from './yeni.js';
import { yeniSiteler2 } from './yeni2.js';
import { crealityGlobalSiteler } from './creality-global.js';
import { globalSiteler } from './global.js';
import { prusaGlobalSiteler } from './prusa3d.js';

export const adapters = [
  trendyol, hepsiburada, amazon, vatan, mediamarkt, itopya, pazarama, incehesap,
  ...ucdSiteler, ...yeniSiteler, ...yeniSiteler2, ...crealityGlobalSiteler, ...globalSiteler, ...prusaGlobalSiteler,
];

/** Desteklenen bölgesel pazarlar (market) ve varsayılan para birimi/yerel ayarları. */
export const PAZARLAR = Object.freeze({
  tr: { id: 'tr', ad: 'Türkiye', dil: 'tr', currency: 'TRY', yerel: 'tr-TR' },
  us: { id: 'us', ad: 'Global / US', dil: 'en', currency: 'USD', yerel: 'en-US' },
  fr: { id: 'fr', ad: 'France', dil: 'fr', currency: 'EUR', yerel: 'fr-FR' },
  eu: { id: 'eu', ad: 'Europe', dil: 'en', currency: 'EUR', yerel: 'de-DE' },
  jp: { id: 'jp', ad: 'Japan', dil: 'ja', currency: 'JPY', yerel: 'ja-JP' },
});

/** Pazar/dil kodunu bilinen pazar anahtarına indirger (varsayılan 'tr'). */
export function normalizeMarket(market = 'tr') {
  const m = String(market || 'tr').trim().toLowerCase();
  if (m === 'en' || m === 'global') return 'us';
  if (m === 'ja') return 'jp';
  return PAZARLAR[m] ? m : 'tr';
}

// Mevcut adaptörlere tek tek dokunmadan varsayılan market='tr' ve currency='TRY' ata.
for (const a of adapters) {
  if (!a.market) a.market = 'tr';
  if (!a.currency) a.currency = PAZARLAR[normalizeMarket(a.market)]?.currency || 'TRY';
}

export function adapterMarket(adapter) {
  return normalizeMarket(adapter?.market || 'tr');
}

export function adapterCurrency(adapter) {
  const m = adapterMarket(adapter);
  return String(adapter?.currency || PAZARLAR[m]?.currency || 'TRY').toUpperCase();
}

export function adaptersByMarket(market = 'tr', havuz = adapters) {
  const m = normalizeMarket(market);
  return havuz.filter(a => adapterMarket(a) === m);
}

export function marketSiteIds(market = 'tr') {
  return new Set(adaptersByMarket(market).map(a => a.id));
}

/** URL'nin hangi siteye ait olduğunu bulur. */
export function detectSite(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const adaylar = adapters.filter(a => a.hosts.some(h => h.toLowerCase().replace(/^www\./, '') === host));
  if (!adaylar.length) return null;
  return adaylar.find(a => typeof a.matchesUrl === 'function' && a.matchesUrl(u))
    || adaylar.find(a => typeof a.matchesUrl !== 'function')
    || adaylar[0];
}

export function adapterById(id) {
  return adapters.find(a => a.id === id) || null;
}

export const siteNames = Object.fromEntries(adapters.map(a => [a.id, a.name]));
