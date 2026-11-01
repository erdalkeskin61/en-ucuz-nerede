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

export const adapters = [trendyol, hepsiburada, amazon, vatan, mediamarkt, itopya, pazarama, incehesap, ...ucdSiteler, ...yeniSiteler, ...yeniSiteler2];

/** URL'nin hangi siteye ait olduğunu bulur. */
export function detectSite(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  return adapters.find(a => a.hosts.some(h => h.toLowerCase().replace(/^www\./, '') === host)) || null;
}

export function adapterById(id) {
  return adapters.find(a => a.id === id) || null;
}

export const siteNames = Object.fromEntries(adapters.map(a => [a.id, a.name]));
