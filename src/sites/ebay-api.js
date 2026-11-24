/**
 * 🛒 Resmî eBay Browse API İstemcisi (OAuth 2.0 client_credentials + v1/buy/browse)
 *
 * Ortam değişkenleri (.env):
 *   EBAY_CLIENT_ID     — eBay Developers Production App ID (Client ID)
 *   EBAY_CLIENT_SECRET — eBay Developers Production Cert ID (Client Secret)
 *   EBAY_CAMPAIGN_ID   — (İsteğe bağlı) eBay Partner Network (EPN) Campaign ID
 *
 * Anahtarlar tanımlı değilse `ebayApiEtkinMi()` false döner ve `retail-global.js`
 * mevcut HTML/fetchPage yoluna güvenli biçimde geri düşer.
 */
import { createHash } from 'node:crypto';
import { dominantColor, paraBirimiNormalize } from '../util.js';

const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_BASE = 'https://api.ebay.com/buy/browse/v1';
const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope';

const MARKETPLACE_BY_SITE = Object.freeze({
  ebay_us: { marketplaceId: 'EBAY_US', origin: 'https://www.ebay.com', market: 'us', currency: 'USD', name: 'eBay (US)' },
  ebay_fr: { marketplaceId: 'EBAY_FR', origin: 'https://www.ebay.fr', market: 'fr', currency: 'EUR', name: 'eBay (FR)' },
});

const URUN_CACHE_TTL_MS = 5 * 60 * 1000;
const URUN_CACHE_MAX = 400;

let _tokenCache = { accessToken: '', expiresAt: 0, clientId: '' };
let _tokenInFlight = null;
const _urunCache = new Map();

/** Ortam değişkenlerinden eBay Production yapılandırmasını okur. */
export function ebayYapilandirmasi() {
  return {
    clientId: String(process.env.EBAY_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.EBAY_CLIENT_SECRET || '').trim(),
    campaignId: String(process.env.EBAY_CAMPAIGN_ID || '').trim(),
    verificationToken: String(process.env.EBAY_VERIFICATION_TOKEN || '').trim(),
  };
}

/** eBay Marketplace Account Deletion GET doğrulaması için SHA-256 `challengeResponse` üretir. */
export function ebayAccountDeletionChallenge({ challengeCode, verificationToken, endpoint }) {
  const code = String(challengeCode || '').trim();
  const token = String(verificationToken || '').trim();
  const ep = String(endpoint || '').trim();
  if (!code || !token || !ep) return null;
  return createHash('sha256').update(code + token + ep, 'utf8').digest('hex');
}

/** eBay Browse API anahtarları tanımlı mı? */
export function ebayApiEtkinMi() {
  const { clientId, clientSecret } = ebayYapilandirmasi();
  return !!(clientId && clientSecret);
}

/** Testlerde token/ürün önbelleğini sıfırlar. */
export function _ebayOnbellekTemizle() {
  _tokenCache = { accessToken: '', expiresAt: 0, clientId: '' };
  _tokenInFlight = null;
  _urunCache.clear();
}

function cacheYaz(anahtar, urun) {
  if (!anahtar || !urun) return;
  if (_urunCache.size >= URUN_CACHE_MAX) {
    const ilk = _urunCache.keys().next().value;
    if (ilk) _urunCache.delete(ilk);
  }
  _urunCache.set(anahtar, { urun, ts: Date.now() });
}

function cacheOku(anahtar) {
  const kayit = _urunCache.get(anahtar);
  if (!kayit) return null;
  if (Date.now() - kayit.ts > URUN_CACHE_TTL_MS) {
    _urunCache.delete(anahtar);
    return null;
  }
  return kayit.urun;
}

/** URL'den eBay sayısal öğe kimliğini (/itm/.../1234567890) ayıklar. */
export function ebayLegacyIdCoz(url) {
  const m = /\/itm\/(?:[^/?#]+\/)?(\d{8,16})(?:[/?#]|$)/.exec(String(url || ''));
  return m ? m[1] : null;
}

function kanonikItmUrl(item, origin, fallbackUrl = null) {
  const idFromItem = /^v1\|(\d{8,16})\|/.exec(String(item?.itemId || ''))?.[1];
  const idFromGrp = /[?&]item_group_id=(\d{8,16})/.exec(String(item?.itemGroupHref || ''))?.[1];
  const legacyId = item?.legacyItemId
    || ebayLegacyIdCoz(item?.itemWebUrl)
    || ebayLegacyIdCoz(fallbackUrl)
    || idFromItem
    || idFromGrp;
  if (legacyId) return `${origin}/itm/${legacyId}`;
  const ham = String(item?.itemWebUrl || fallbackUrl || '').split('?')[0].split('#')[0];
  return ham || null;
}

/** OAuth 2.0 Client Credentials token alır ve önbellekte tutar. */
export async function ebayAccessTokenAl({ forceRefresh = false, signal = null, fetchImpl = fetch } = {}) {
  const { clientId, clientSecret } = ebayYapilandirmasi();
  if (!clientId || !clientSecret) {
    throw new Error('EBAY_CLIENT_ID ve EBAY_CLIENT_SECRET tanımlı değil.');
  }
  const simdi = Date.now();
  if (!forceRefresh && _tokenCache.accessToken && _tokenCache.clientId === clientId && simdi < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.accessToken;
  }
  if (!forceRefresh && _tokenInFlight) return _tokenInFlight;

  const authBasic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`;

  _tokenInFlight = (async () => {
    const resp = await fetchImpl(EBAY_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authBasic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: signal || AbortSignal.timeout(8000),
    });
    const veri = await resp.json().catch(() => ({}));
    if (!resp.ok || !veri.access_token) {
      const mesaj = veri.error_description || veri.error || `HTTP ${resp.status}`;
      throw new Error(`eBay OAuth hatası: ${mesaj}`);
    }
    const ttlMs = Math.max(120, Number(veri.expires_in) || 7200) * 1000;
    _tokenCache = {
      accessToken: String(veri.access_token),
      expiresAt: Date.now() + ttlMs,
      clientId,
    };
    return _tokenCache.accessToken;
  })();

  try {
    return await _tokenInFlight;
  } finally {
    _tokenInFlight = null;
  }
}

function ebayKargoCoz(item, defaultCurrency) {
  const opts = Array.isArray(item?.shippingOptions) ? item.shippingOptions : [];
  if (!opts.length) return { fee: null, freeOver: null, applies: null, note: null };
  const s = opts[0];
  const tip = String(s?.shippingCostType || '').toUpperCase();
  const tutar = s?.shippingCost?.value != null ? Number(s.shippingCost.value) : null;
  if (tip === 'FIXED' && tutar === 0) {
    return { fee: 0, freeOver: null, applies: false, note: 'Free shipping' };
  }
  if (Number.isFinite(tutar) && tutar > 0) {
    const para = paraBirimiNormalize(s?.shippingCost?.currency || defaultCurrency);
    return { fee: Math.round(tutar * 100) / 100, freeOver: null, applies: true, note: `+${tutar} ${para} shipping` };
  }
  return { fee: null, freeOver: null, applies: null, note: null };
}

function ebayAspectDegeri(item, anahtarlar) {
  const liste = Array.isArray(item?.localizedAspects) ? item.localizedAspects : [];
  for (const a of liste) {
    const k = String(a?.name || '').trim().toLowerCase();
    if (anahtarlar.includes(k) && a?.value) {
      return Array.isArray(a.value) ? String(a.value[0] || '').trim() : String(a.value).trim();
    }
  }
  return null;
}

function ebayStokDurumu(item) {
  const av = Array.isArray(item?.estimatedAvailabilities) ? item.estimatedAvailabilities[0] : null;
  if (!av) return true;
  const st = String(av.estimatedAvailabilityStatus || '').toUpperCase();
  if (st === 'OUT_OF_STOCK') return false;
  if (Number.isFinite(Number(av.estimatedAvailableQuantity)) && Number(av.estimatedAvailableQuantity) <= 0) {
    return false;
  }
  return true;
}

/** eBay Browse `item` veya `itemSummary` nesnesini standart Ürün şemasına dönüştürür. */
export function ebayOgeyiUrunYap(item, cfg, { fallbackUrl = null } = {}) {
  const title = String(item?.title || '').trim();
  if (!title) return null;
  const currency = paraBirimiNormalize(item?.price?.currency || cfg.currency);
  const rawPrice = item?.price?.value != null ? Number(item.price.value) : null;
  const sellingPrice = Number.isFinite(rawPrice) && rawPrice > 0
    ? (currency === 'JPY' ? Math.round(rawPrice) : Math.round(rawPrice * 100) / 100)
    : null;
  const url = kanonikItmUrl(item, cfg.origin, fallbackUrl);
  if (!url) return null;

  const brand = String(item?.brand || '').trim()
    || ebayAspectDegeri(item, ['brand', 'marque', 'hersteller', 'ブランド'])
    || null;
  const modelCode = String(item?.mpn || '').trim()
    || ebayAspectDegeri(item, ['mpn', 'model', 'modèle', 'part number'])
    || null;
  const barcode = String(item?.gtin?.[0] || item?.ean?.[0] || item?.upc?.[0] || '').trim() || null;
  const image = item?.image?.imageUrl || item?.thumbnailImages?.[0]?.imageUrl || null;
  const seller = item?.seller?.username ? `${cfg.name} (${item.seller.username})` : cfg.name;

  return {
    site: cfg.id,
    siteName: cfg.name,
    market: cfg.market,
    url,
    afiliyeUrl: item?.itemAffiliateWebUrl || null,
    title,
    brand,
    modelCode,
    barcode,
    color: dominantColor(title) || ebayAspectDegeri(item, ['color', 'colour', 'couleur']) || null,
    listPrice: null,
    sellingPrice,
    currency,
    inStock: ebayStokDurumu(item),
    seller,
    image,
    campaigns: [],
    shipping: ebayKargoCoz(item, currency),
  };
}

async function ebayBrowseGet(pathAndQuery, cfg, { signal = null, fetchImpl = fetch } = {}) {
  const { campaignId } = ebayYapilandirmasi();
  const istekAt = async (forceRefresh) => {
    const token = await ebayAccessTokenAl({ forceRefresh, signal, fetchImpl });
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': cfg.marketplaceId,
      Accept: 'application/json',
    };
    if (campaignId) {
      headers['X-EBAY-C-ENDUSERCTX'] = `affiliateCampaignId=${campaignId}`;
    }
    return fetchImpl(`${EBAY_BROWSE_BASE}${pathAndQuery}`, {
      headers,
      signal: signal || AbortSignal.timeout(8000),
    });
  };

  let resp = await istekAt(false);
  if (resp.status === 401) {
    resp = await istekAt(true);
  }
  const veri = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, veri };
}

/** eBay Browse API ile ürün arar ve adayları önbelleğe alır. */
export async function ebayBrowseAra(siteId, query, ctx = {}, opts = {}) {
  const meta = MARKETPLACE_BY_SITE[siteId];
  if (!meta) throw new Error(`Desteklenmeyen eBay sitesi: ${siteId}`);
  const cfg = { id: siteId, ...meta };
  const q = String(query || '').trim();
  if (!q) return [];

  const params = new URLSearchParams({
    q,
    limit: String(Math.min(20, Math.max(1, Number(opts.limit) || 10))),
    filter: 'buyingOptions:{FIXED_PRICE},conditions:{NEW}',
  });
  const { ok, status, veri } = await ebayBrowseGet(
    `/item_summary/search?${params.toString()}`,
    cfg,
    { signal: ctx?.signal || opts.signal, fetchImpl: opts.fetchImpl },
  );
  if (ctx && typeof ctx === 'object') ctx.spend = (ctx.spend || 0) + 1;
  if (!ok) {
    const errMsg = veri?.errors?.[0]?.message || `HTTP ${status}`;
    throw new Error(`${cfg.name} API arama hatası: ${errMsg}`);
  }

  const ozetler = Array.isArray(veri?.itemSummaries) ? veri.itemSummaries : [];
  const out = [];
  const seen = new Set();
  for (const item of ozetler) {
    const urun = ebayOgeyiUrunYap(item, cfg);
    if (!urun || seen.has(urun.url)) continue;
    seen.add(urun.url);
    // Çoklu varyant aramalarında fiyat null dönebilir — yalnızca gerçek fiyatlıysa önbellekle.
    if (urun.sellingPrice > 0) cacheYaz(urun.url, urun);
    out.push({
      title: urun.title,
      url: urun.url,
      price: urun.sellingPrice,
      currency: urun.currency,
      brand: urun.brand,
      modelCode: urun.modelCode,
      barcode: urun.barcode,
      image: urun.image,
    });
  }
  return out;
}

/** Tek bir eBay `/itm/<id>` sayfasını Browse API ile okur (çoklu varyant dahil). */
export async function ebayBrowseUrunGetir(siteId, url, ctx = {}, opts = {}) {
  const meta = MARKETPLACE_BY_SITE[siteId];
  if (!meta) throw new Error(`Desteklenmeyen eBay sitesi: ${siteId}`);
  const cfg = { id: siteId, ...meta };
  const cleanUrl = String(url || '').split('?')[0].split('#')[0];
  const legacyId = ebayLegacyIdCoz(cleanUrl);
  if (!legacyId) throw new Error(`${cfg.name}: Geçersiz eBay ürün adresi`);

  const kanonikUrl = `${cfg.origin}/itm/${legacyId}`;
  if (!opts.fresh) {
    const onbellek = cacheOku(kanonikUrl) || cacheOku(cleanUrl);
    if (onbellek) return onbellek;
  }

  let { ok, status, veri } = await ebayBrowseGet(
    `/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(legacyId)}`,
    cfg,
    { signal: ctx?.signal || opts.signal, fetchImpl: opts.fetchImpl },
  );
  if (ctx && typeof ctx === 'object') ctx.spend = (ctx.spend || 0) + 1;

  // Çoklu varyant (renk/ağırlık) ilanı: eBay 11006 döner → item_group uç noktasından al.
  const cokluVaryant = !ok && (veri?.errors?.some(e => Number(e?.errorId) === 11006) || /item group/i.test(JSON.stringify(veri?.errors || [])));
  if (cokluVaryant) {
    const grp = await ebayBrowseGet(
      `/item/get_items_by_item_group?item_group_id=${encodeURIComponent(legacyId)}`,
      cfg,
      { signal: ctx?.signal || opts.signal, fetchImpl: opts.fetchImpl },
    );
    if (ctx && typeof ctx === 'object') ctx.spend = (ctx.spend || 0) + 1;
    ok = grp.ok;
    status = grp.status;
    const altItems = Array.isArray(grp.veri?.items) ? grp.veri.items : [];
    const hedefRenk = String(opts?.kaynak?.color || '').trim().toLowerCase();
    const renkli = hedefRenk
      ? altItems.find(i => ebayStokDurumu(i) && Number(i?.price?.value) > 0
        && String(dominantColor(i?.title || '') || ebayAspectDegeri(i, ['color', 'colour', 'couleur']) || '').toLowerCase() === hedefRenk)
      : null;
    veri = renkli || altItems.find(i => ebayStokDurumu(i) && Number(i?.price?.value) > 0) || altItems.find(i => ebayStokDurumu(i)) || altItems[0] || grp.veri;
  }

  if (!ok) {
    const errMsg = veri?.errors?.[0]?.message || `HTTP ${status}`;
    throw new Error(`${cfg.name} API ürün hatası: ${errMsg}`);
  }

  const urun = ebayOgeyiUrunYap(veri, cfg, { fallbackUrl: kanonikUrl });
  if (!urun) throw new Error(`${cfg.name}: Ürün verisi çözülemedi.`);
  cacheYaz(kanonikUrl, urun);
  return urun;
}
