/**
 * 🧬 impit ölçüm / teşhis betiği — 2026-11-17
 *
 * NE YAPAR
 * --------
 * Her mağazanın AYNI arama sayfasını **tarayıcı (Chromium) olmadan** yalnızca
 * `impit` (Chrome TLS parmak izi) ile çeker ve şunu raporlar:
 *
 *   • HTTP durumu, süre, gövde boyutu
 *   • Bot challenge / WAF hata sayfası var mı
 *   • Gövde anlamlı ürün/arama içeriği taşıyor mu (`anlamliIcerikMi`)
 *   • Sonuç: "tarayıcısız ✅" veya "Chromium gerekli 🖥️"
 *
 * NEDEN
 * -----
 * Trendyol/Amazon/n11 gibi siteler için her istekte ağır Chromium başlatmak
 * yerine impit'in yeterli olup olmadığını ÖLÇMEDEN bilemeyiz. Bu betik canlı
 * kanıt üretir; scraper'daki `impitHafifDene` kararının dayanağı budur.
 *
 * KULLANIM
 * ---------
 *   node scripts/check-impit.mjs                 # varsayılan 14 mağaza
 *   node scripts/check-impit.mjs --hepsi         # 68 adaptörün tamamı
 *   node scripts/check-impit.mjs --site=trendyol,amazon,n11
 *   node scripts/check-impit.mjs --q="eSun PLA+" --json
 *   IMPIT_KAPALI=1 node scripts/check-impit.mjs  # yerleşik fetch ile karşılaştırma
 *
 * NOT: Betik satır arası 900 ms bekler (nazik mod) — hedef siteleri yormaz.
 */
import { adapters, adapterById } from '../src/sites/index.js';
import { anlamliIcerikMi } from '../src/scraper.js';
import { httpIste, impitDurumu } from '../src/impitIstemci.js';

const argv = process.argv.slice(2);
const arg = (ad, vars = null) => {
  const bulunan = argv.find(a => a.startsWith('--' + ad + '='));
  if (bulunan) return bulunan.slice(ad.length + 3);
  return argv.includes('--' + ad) ? true : vars;
};

const JSON_CIKTI = !!arg('json', false);
const HEPSI = !!arg('hepsi', false);
const SORGU = String(arg('q', 'filament'));
const SITE_ARG = arg('site', null);
const BEKLEME_MS = Number(arg('bekle', 900)) || 900;

// Varsayılan: Chromium'a en çok düşen siteler + temsilî birkaç mağaza.
const VARSAYILAN = [
  'trendyol', 'amazon', 'n11', 'incehesap', 'teknosa', 'pttavm',
  'hepsiburada', 'ciceksepeti', 'vatan', 'itopya',
  'porima3d', 'filamenthane', '3dteknomarket', 'robotistan',
];

function hedefListe() {
  if (typeof SITE_ARG === 'string' && SITE_ARG.trim()) {
    return SITE_ARG.split(',').map(s => s.trim()).filter(Boolean)
      .map(id => adapterById(id))
      .filter(Boolean);
  }
  if (HEPSI) return adapters;
  return VARSAYILAN.map(id => adapterById(id)).filter(Boolean);
}

const uyu = (ms) => new Promise(r => setTimeout(r, ms));

function kirp(s, n = 70) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

async function olc(adapter) {
  const url = adapter.searchUrl(SORGU);
  const t0 = Date.now();
  let kayit = {
    siteId: adapter.id, siteName: adapter.name, url, sorgu: SORGU,
    durum: null, ms: null, boyut: 0, katman: null,
    challenge: false, hataSayfasi: false, anlamli: false,
    karar: null, not: '',
  };
  try {
    const { response, katman, ms } = await httpIste(url, {
      redirect: 'follow',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      },
    });
    const body = await response.text();
    kayit.durum = response.status;
    kayit.ms = ms;
    kayit.katman = katman;
    kayit.boyut = body.length;
    kayit.challenge = /just a moment|attention required|verify you are human|are you a robot|cf-chl/i.test(body.slice(0, 3000));
    kayit.hataSayfasi = /(404|bulunamadı|not found|sayfa bulunamad|aradığınız sayfa)/i.test(body.slice(0, 1200))
      && body.length < 8000;
    const yanit = { status: response.status, body, saglayici: katman };
    kayit.anlamli = anlamliIcerikMi(yanit);
    if (response.status !== 200) kayit.not = `HTTP ${response.status}`;
    else if (kayit.challenge) kayit.not = 'bot challenge';
    else if (!kayit.anlamli) kayit.not = 'içerik yetersiz/boş (JS render gerekli)';
  } catch (e) {
    kayit.durum = 'ERR';
    kayit.ms = Date.now() - t0;
    kayit.not = kirp(e?.message || e, 60);
  }
  kayit.karar = (kayit.durum === 200 && kayit.anlamli && !kayit.challenge)
    ? 'tarayicisiz'
    : 'tarayici-gerekli';
  return kayit;
}

const hedefler = hedefListe();
console.log(`\n🧬 impit ölçümü — ${hedefler.length} mağaza · sorgu: "${SORGU}" · bekleme: ${BEKLEME_MS} ms`);
console.log(`   impit durumu: ${JSON.stringify(impitDurumu().sayac)}\n`);

const sonuclar = [];
for (const a of hedefler) {
  const r = await olc(a);
  sonuclar.push(r);
  if (!JSON_CIKTI) {
    const ikon = r.karar === 'tarayicisiz' ? '✅' : '🖥️';
    const kat = r.katman === 'impit' ? 'impit' : 'fetch';
    console.log(
      `${ikon} ${a.id.padEnd(18)} ${String(r.durum).padStart(4)} `
      + `${String(r.ms ?? '—').padStart(5)}ms ${String(r.boyut).padStart(7)}B `
      + `${kat.padEnd(5)} ${r.not ? '· ' + r.not : ''}`
    );
  }
  await uyu(BEKLEME_MS);
}

const tarayicisiz = sonuclar.filter(r => r.karar === 'tarayicisiz');
const gerekli = sonuclar.filter(r => r.karar !== 'tarayicisiz');

if (JSON_CIKTI) {
  console.log(JSON.stringify({
    sorgu: SORGU,
    impit: impitDurumu(),
    ozet: {
      toplam: sonuclar.length,
      tarayicisiz: tarayicisiz.length,
      tarayiciGerekli: gerekli.length,
      ortalamaMs: Math.round(
        sonuclar.filter(r => typeof r.ms === 'number').reduce((s, r) => s + r.ms, 0)
        / Math.max(1, sonuclar.filter(r => typeof r.ms === 'number').length)
      ),
    },
    sonuclar,
  }, null, 2));
} else {
  console.log('\n' + '─'.repeat(64));
  console.log(`Tarayıcısız (impit yeterli): ${tarayicisiz.length}/${sonuclar.length}`
    + (tarayicisiz.length ? ' → ' + tarayicisiz.map(r => r.siteId).join(', ') : ''));
  console.log(`Chromium gerekli           : ${gerekli.length}/${sonuclar.length}`
    + (gerekli.length ? ' → ' + gerekli.map(r => r.siteId).join(', ') : ''));
  const ort = Math.round(
    sonuclar.filter(r => typeof r.ms === 'number').reduce((s, r) => s + r.ms, 0)
    / Math.max(1, sonuclar.filter(r => typeof r.ms === 'number').length)
  );
  console.log(`Ortalama yanıt süresi      : ${ort} ms`);
  console.log('─'.repeat(64) + '\n');
  if (tarayicisiz.length) {
    console.log('💡 Bu mağazalar için Chromium AÇILMAZ; scraper doğrudan impit yanıtını kullanır.');
  }
}

process.exitCode = 0;
