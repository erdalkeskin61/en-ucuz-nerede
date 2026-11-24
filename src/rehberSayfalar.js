/**
 * 📖 Karşılaştırma & Alım Rehberleri (SSR) — 2026-11-22
 *
 * Yüksek niyetli, düşük rekabetli "vs" ve rehber sorguları için canlı veritabanı
 * fiyatlarıyla (`seoUrunListesi`) otomatik güncellenen SSR sayfaları üretir:
 *   - GET /rehber
 *   - GET /karsilastir/bambu-lab-p1s-vs-creality-k1c
 *   - GET /karsilastir/ender-3-v3-ke-vs-elegoo-neptune-4-pro
 *   - GET /rehber/en-ucuz-pla-filament
 *   - GET /rehber/pla-vs-petg-filament
 *   - GET /rehber/3d-baski-maliyeti-nasil-hesaplanir
 *
 * Dürüstlük ilkesi: hiçbir ürün/mağaza fiyatı uydurulmaz; yalnızca canlı
 * `seoUrunListesi()` sonuçları gösterilir, kayıt yoksa "Canlı Tara" sunulur.
 */
import {
  htmlKacis, sayfaIskeleti, crealityResmiMagazaLink,
  GLOBAL_REHBER_YOLLARI,
} from './seoSayfalar.js';
import { formatPara, formatTL, parcaMi } from './util.js';

function urunBul(tumUrunler, regex) {
  const comboIstendi = /combo/i.test(regex.source);
  const adaylar = tumUrunler.filter((u) => {
    if (!regex.test(`${u.ad} ${u.slug} ${u.sorgu}`)) return false;
    if (parcaMi(u.ad)) return false;
    if (u.kategori !== 'yazici' && u.kategoriSlug !== '3d-yazici') return false;
    if (u.enUcuzFiyat > 0 && u.enUcuzFiyat < 4500) return false;
    if (!comboIstendi && /\bcombo\b/i.test(u.ad)) return false;
    return true;
  });
  return adaylar.find(u => u.stokluSayisi > 0 && u.enUcuzFiyat > 0) || adaylar[0] || null;
}

function heroAlani({ rozet, baslikHtml, altMetin, istatistikler = [] }) {
  const istHtml = istatistikler.length
    ? `<div class="hero-istatistik">${istatistikler.map(s => `<span>${s}</span>`).join('')}</div>`
    : '';
  return `<section class="hero seo-hero">
    <div class="hero-ic">
      <span class="hero-rozet">${rozet}</span>
      <h1>${baslikHtml}</h1>
      <p>${htmlKacis(altMetin)}</p>
      ${istHtml}
    </div>
  </section>`;
}

/** İki canlı ürün kartını VS rozetiyle yan yana ve fiyat farkı vurgusuyla çizer. */
function canliKarsilastirmaKutusu(solUrun, sagUrun, solBaslik, sagBaslik, solSorgu, sagSorgu) {
  const solUcuz = solUrun?.enUcuzFiyat > 0 && sagUrun?.enUcuzFiyat > 0 && solUrun.enUcuzFiyat < sagUrun.enUcuzFiyat;
  const sagUcuz = solUrun?.enUcuzFiyat > 0 && sagUrun?.enUcuzFiyat > 0 && sagUrun.enUcuzFiyat < solUrun.enUcuzFiyat;

  const kart = (u, baslik, sorgu, kazananMi) => {
    const fiyatMetin = u?.enUcuzFiyat > 0 ? formatTL(u.enUcuzFiyat) : 'Canlı Tara';
    const altMetin = u?.enUcuzFiyat > 0
      ? `${htmlKacis(u.enUcuzSite || 'Mağaza')} · ${u.stokluSayisi || 1} stoklu mağaza`
      : 'Anlık fiyatları 60+ mağazada kontrol et';
    const detayHref = u ? u.yol : `/?url=${encodeURIComponent(sorgu)}`;
    return `<div class="seo-mini-kart seo-vs-kart${kazananMi ? ' kazanan' : ''}" style="gap:10px">
      ${kazananMi ? '<span class="seo-vs-etiket">🏷️ BUGÜN EN UCUZ</span>' : ''}
      <div class="seo-vs-baslik">
        ${u?.gorsel ? `<img class="seo-vs-img" src="${htmlKacis(u.gorsel)}" alt="${htmlKacis(u.ad || baslik)}" loading="lazy" />` : ''}
        <div class="seo-mini-ad">${htmlKacis(u?.ad || baslik)}</div>
      </div>
      <div class="seo-mini-fiyat">${fiyatMetin}</div>
      <div class="seo-mini-alt">${altMetin}</div>
      <div class="seo-butonlar" style="margin-top:auto">
        <a class="seo-cta" style="padding:8px 14px;font-size:13px" href="${htmlKacis(detayHref)}">${u ? 'Tüm Teklifleri Gör' : 'Canlı Tara ⚡'}</a>
        ${u?.enUcuzUrl ? `<a class="seo-cta ikincil" style="padding:8px 12px;font-size:13px" href="${htmlKacis(u.enUcuzUrl)}" target="_blank" rel="noopener sponsored nofollow">Mağaza ↗</a>` : ''}
      </div>
    </div>`;
  };

  let farkNotu = '';
  if (solUrun?.enUcuzFiyat > 0 && sagUrun?.enUcuzFiyat > 0) {
    const fark = Math.abs(solUrun.enUcuzFiyat - sagUrun.enUcuzFiyat);
    if (fark < 1) {
      farkNotu = '<div class="seo-fiyat-kutu">Bugün kargo dahil en ucuz tekliflerde iki model aynı fiyatta.</div>';
    } else {
      const ucuzAd = solUrun.enUcuzFiyat < sagUrun.enUcuzFiyat ? solBaslik : sagBaslik;
      farkNotu = `<div class="seo-fiyat-kutu"><div>⚡ <b>Canlı Fiyat Özeti:</b> Bugün kargo dahil en ucuz teklifte <b>${htmlKacis(ucuzAd)}</b> <b>${formatTL(fark)} daha uygun</b>.</div></div>`;
    }
  }

  return `${farkNotu}<div class="seo-vs-izgara">${kart(solUrun, solBaslik, solSorgu, solUcuz)}<div class="seo-vs-orta"><span class="seo-vs-rozet">VS</span></div>${kart(sagUrun, sagBaslik, sagSorgu, sagUcuz)}</div>`;
}

/** Etkileşimli akordeon FAQ + FAQPage JSON-LD çifti üretir. */
function sssBolumu(sssListesi) {
  if (!sssListesi?.length) return { html: '', jsonLd: null };
  const html = `<section class="seo-kart">
    <h2 style="margin-top:0">❓ Sık Sorulan Sorular</h2>
    <div class="seo-sss">
      ${sssListesi.map((s, idx) => `<details${idx === 0 ? ' open' : ''}>
        <summary>${htmlKacis(s.soru)}</summary>
        <p>${htmlKacis(s.cevap)}</p>
      </details>`).join('')}
    </div>
  </section>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: sssListesi.map(s => ({
      '@type': 'Question',
      name: s.soru,
      acceptedAnswer: { '@type': 'Answer', text: s.cevap },
    })),
  };
  return { html, jsonLd };
}

function altAraclarCubugu() {
  return `<section class="seo-rehber-kart" aria-label="Hızlı Geçişler" style="margin-top:6px">
    <div class="seo-rehber-ust">
      <div>
        <h2 class="bolum-baslik" style="margin:0 0 4px">Diğer Canlı Araçlar &amp; Sayfalar</h2>
        <p class="ipucu" style="margin:0">Karşılaştırma sonrası kargo sıfırlamak veya parça maliyeti çıkarmak için:</p>
      </div>
      <a class="seo-tum-link" href="/urunler">Tüm Ürün Kataloğu →</a>
    </div>
    <div class="seo-rehber-baglar">
      <a href="/rehber">📖 Tüm Rehberler</a>
      <a href="/kategori/3d-yazici">🖨️ 3D Yazıcı Fiyatları</a>
      <a href="/kategori/pla-filament">🧵 PLA &amp; PLA+ Filamentler</a>
      <a href="/kategori/petg-tpu-filament">🦾 PETG, TPU &amp; ABS</a>
      <a href="/kategori/3d-yazici-yedek-parca">⚙️ Yedek Parça</a>
      <a href="/maliyet.html">🧮 Baskı Maliyet Hesaplayıcı</a>
      <a href="/sepet.html">🧺 Akıllı Sepet Sihirbazı</a>
    </div>
  </section>`;
}

/** Yazıcı "vs" karşılaştırma sayfaları için veri tabanlı şablon. */
function yaziciKarsilastirmaOlustur(tanim, tumUrunler, tabanUrl) {
  const solUrun = urunBul(tumUrunler, tanim.solRegex);
  const sagUrun = urunBul(tumUrunler, tanim.sagRegex);
  const canonicalUrl = `${tabanUrl}${tanim.yol}`;

  const ozellikSatirlari = tanim.ozellikler.map(([alan, solDeger, sagDeger]) => `
    <tr>
      <td><b>${htmlKacis(alan)}</b></td>
      <td>${htmlKacis(solDeger)}</td>
      <td>${htmlKacis(sagDeger)}</td>
    </tr>`).join('');

  const farkBilgisi = (solUrun?.enUcuzFiyat > 0 && sagUrun?.enUcuzFiyat > 0)
    ? `💰 Fark: <b>${formatTL(Math.abs(solUrun.enUcuzFiyat - sagUrun.enUcuzFiyat))}</b>`
    : '⚡ 60+ mağazada canlı kıyas';

  const crealityTaraf = /creality|\bender|\bk1|\bk3/i.test(tanim.solAd)
    ? tanim.solAd
    : (/creality|\bender|\bk1|\bk3/i.test(tanim.sagAd) ? tanim.sagAd : '');
  const globalCreality = crealityTaraf ? crealityResmiMagazaLink(crealityTaraf) : null;

  const sss = sssBolumu(tanim.sss);
  const govdeHtml = `
    <nav class="seo-yol" aria-label="İçerik yolu">
      <a href="/">Ana Sayfa</a> › <a href="/rehber">Rehber &amp; Karşılaştırmalar</a> › <span>${htmlKacis(tanim.kisaBaslik)}</span>
    </nav>
    ${heroAlani({
      rozet: '⚖️ Canlı Yazıcı Karşılaştırması',
      baslikHtml: `${htmlKacis(tanim.solAd)} <b>vs</b> ${htmlKacis(tanim.sagAd)}`,
      altMetin: tanim.ozet,
      istatistikler: [
        farkBilgisi,
        '🚚 Kargo dahil gerçek tutar',
        '🔒 Stoklu mağaza kontrolü',
      ],
    })}
    <section class="seo-kart">
      <h2 style="margin-top:0">Canlı Fiyat ve Stok Kıyaslaması</h2>
      ${canliKarsilastirmaKutusu(solUrun, sagUrun, tanim.solAd, tanim.sagAd, tanim.solAd, tanim.sagAd)}
      ${globalCreality ? `<div class="seo-butonlar" style="margin-top:14px"><a class="seo-cta ikincil" href="${htmlKacis(globalCreality.url)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="creality">🌍 ${htmlKacis(crealityTaraf)} — Creality Resmî Mağaza (Global) ↗</a></div>` : ''}
    </section>
    <section class="seo-kart">
      <h2 style="margin-top:0">Teknik Özellikler ve Kullanım Farkları</h2>
      <div style="overflow-x:auto">
        <table class="seo-tablo">
          <thead><tr><th>Özellik</th><th>${htmlKacis(tanim.solAd)}</th><th>${htmlKacis(tanim.sagAd)}</th></tr></thead>
          <tbody>${ozellikSatirlari}</tbody>
        </table>
      </div>
    </section>
    <section class="seo-kart">
      <h2 style="margin-top:0">Hangisini Seçmelisiniz?</h2>
      <div class="seo-izgara" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
        <div class="seo-mini-kart">
          <div class="seo-mini-ad">✅ ${htmlKacis(tanim.solAd)} kimler için?</div>
          <p style="margin:0;font-size:14px;color:var(--gri-metin);line-height:1.55">${htmlKacis(tanim.solKimler)}</p>
        </div>
        <div class="seo-mini-kart">
          <div class="seo-mini-ad">✅ ${htmlKacis(tanim.sagAd)} kimler için?</div>
          <p style="margin:0;font-size:14px;color:var(--gri-metin);line-height:1.55">${htmlKacis(tanim.sagKimler)}</p>
        </div>
      </div>
    </section>
    ${sss.html}
    ${altAraclarCubugu()}`;

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
        { '@type': 'ListItem', position: 3, name: tanim.kisaBaslik, item: canonicalUrl },
      ],
    },
    ...(sss.jsonLd ? [sss.jsonLd] : []),
  ];

  return sayfaIskeleti({
    title: tanim.title,
    description: tanim.description,
    canonicalUrl,
    ogImage: solUrun?.gorsel || sagUrun?.gorsel || `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    jsonLdList,
    govdeHtml,
    aktifNav: 'rehber',
  });
}

const YAZICI_KARSILASTIRMALARI = [
  {
    yol: '/karsilastir/bambu-lab-p1s-vs-creality-k1c',
    ikon: '⚔️',
    kisaBaslik: 'Bambu Lab P1S vs Creality K1C',
    h1: 'Bambu Lab P1S vs Creality K1C — Hangisi Alınır?',
    title: 'Bambu Lab P1S vs Creality K1C Karşılaştırması + Canlı Fiyat | Baskı Hesap',
    description: 'Bambu Lab P1S ve Creality K1C teknik farkları, çok renkli baskı, karbon fiber desteği ve Türkiye mağazalarındaki kargo dahil canlı en ucuz fiyatları.',
    ozet: 'Kapalı kasa CoreXY sınıfının en çok kıyaslanan iki modelini baskı hacmi, çok renkli baskı, mühendislik filament desteği ve bugünkü kargo dahil Türkiye fiyatlarıyla karşılaştırdık.',
    solAd: 'Bambu Lab P1S',
    sagAd: 'Creality K1C',
    solRegex: /bambu\s*lab\s*p1s/i,
    sagRegex: /creality\s*k1c|\bk1c\b/i,
    ozellikler: [
      ['Mimari & Kasa', 'CoreXY, tam kapalı kasa', 'CoreXY, tam kapalı kasa'],
      ['Baskı Hacmi', '256 × 256 × 256 mm', '220 × 220 × 250 mm'],
      ['Maksimum Hız / İvme', '500 mm/s · 20.000 mm/s²', '600 mm/s · 20.000 mm/s²'],
      ['Nozul & Karbon Fiber', 'Paslanmaz nozul (sertleştirilmiş yükseltme ile CF)', 'Dahili Unicorn üç metal sertleştirilmiş nozul (CF hazır)'],
      ['Çoklu Renk / Malzeme', 'AMS ünitesiyle kutudan 4 (toplam 16) renk', 'Tek makara (CFS / çok renk için farklı donanım gerekir)'],
      ['Yazılım Ekosistemi', 'Bambu Studio / Bambu Handy', 'Creality Print / açık Klipper erişimi'],
    ],
    solKimler: 'Daha geniş 256 mm baskı tablası isteyenler, ileride AMS ile çok renkli baskıya geçmeyi planlayanlar ve kutudan çıktığı gibi sorunsuz ekosistem arayanlar için öne çıkar.',
    sagKimler: 'Doğrudan kutudan sertleştirilmiş nozul ile karbon fiber (PA-CF / PETG-CF) basmak isteyenler, açık Klipper esnekliği arayanlar ve fiyatı daha aşağıda yakaladığında F/P odaklı kullanıcılar için idealdir.',
    sss: [
      { soru: 'Bambu Lab P1S mi Creality K1C mi daha büyük baskı alır?', cevap: 'Bambu Lab P1S 256×256×256 mm ile Creality K1C’nin 220×220×250 mm hacminden belirgin şekilde daha geniştir.' },
      { soru: 'Hangisi çok renkli baskıya daha uygundur?', cevap: 'Bambu Lab P1S doğrudan AMS ünitesi ile 4 renge kadar (çoklu AMS ile 16 renge kadar) kolay kurulum sunar.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /bambu\s*lab\s*p1s/i);
      const b = urunBul(u, /creality\s*k1c|\bk1c\b/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `P1S: ${formatTL(a.enUcuzFiyat)} · K1C: ${formatTL(b.enUcuzFiyat)}`;
      return 'CoreXY kapalı kasa canlı fiyat kıyaslaması';
    },
  },
  {
    yol: '/karsilastir/ender-3-v3-ke-vs-elegoo-neptune-4-pro',
    ikon: '⚡',
    kisaBaslik: 'Ender 3 V3 KE vs Neptune 4 Pro',
    h1: 'Creality Ender 3 V3 KE vs Elegoo Neptune 4 Pro',
    title: 'Ender 3 V3 KE vs Elegoo Neptune 4 Pro Karşılaştırması + Canlı Fiyat | Baskı Hesap',
    description: 'Creality Ender 3 V3 KE ve Elegoo Neptune 4 Pro teknik karşılaştırması, Klipper hızı, soğutma farkı ve 60+ mağazada kargo dahil canlı fiyatlar.',
    ozet: 'Orta-giriş fiyat segmentinde yüksek hızlı Klipper tabanlı iki popüler yazıcının teknik detaylarını ve Türkiye mağazalarındaki kargo dahil güncel fiyat farkını tek sayfada görün.',
    solAd: 'Creality Ender 3 V3 KE',
    sagAd: 'Elegoo Neptune 4 Pro',
    solRegex: /ender\s*3\s*v3\s*ke/i,
    sagRegex: /neptune\s*4\s*pro/i,
    ozellikler: [
      ['Baskı Hacmi', '220 × 220 × 240 mm', '225 × 225 × 265 mm'],
      ['Maksimum Hız', '500 mm/s (Klipper / Creality OS)', '500 mm/s (Klipper)'],
      ['X Ekseni Rayı', 'Lineer ray (lineer kızak)', 'Tam metal lineer kılavuz (X ve Y)'],
      ['Parça Soğutma', 'Çift taraflı model fanı', 'Arka ek 4-fanlı yüksek hız soğutma barı'],
      ['Tabla / Nozul Sıcaklığı', '100°C tabla / 300°C Sprite Direct Drive', '110°C çift bölgeli tabla / 300°C Direct Drive'],
      ['Otomatik Kalibrasyon', 'CR Touch + gerinim sensörü ile tam otomatik Z-offset', '121 nokta otomatik seviyeleme (manuel ilk Z ayarı)'],
    ],
    solKimler: 'Tam otomatik Z-offset ve dokunmatik Creality OS arayüzü sayesinde uğraşmadan hızlı başlangıç yapmak isteyenler için çok pratiktir.',
    sagKimler: 'Yüksek hızlı PLA köprülemelerinde ekstra arka fan soğutması, 265 mm Z yüksekliği ve çift bölgeli ısıtmalı tabla isteyen kullanıcılar için güçlü bir seçenektir.',
    sss: [
      { soru: 'Ender 3 V3 KE ile Neptune 4 Pro arasında kurulum kolaylığı farkı var mı?', cevap: 'Ender 3 V3 KE otomatik Z-offset sensörü ile ilk katman ayarını neredeyse tamamen otomatik yapar; Neptune 4 Pro ise klasik kağıt/kalibrasyon adımı sonrası 121 nokta mesh alır.' },
      { soru: 'İki modelde de PLA dışında PETG veya TPU basılabilir mi?', cevap: 'Evet, her iki model de 300°C Direct Drive ekstrüdere sahip olduğu için PLA, PETG ve TPU filamentleri rahatlıkla basabilir.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /ender\s*3\s*v3\s*ke/i);
      const b = urunBul(u, /neptune\s*4\s*pro/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `Ender 3 V3 KE: ${formatTL(a.enUcuzFiyat)} · N4 Pro: ${formatTL(b.enUcuzFiyat)}`;
      return '500 mm/s Klipper giriş-orta segment karşılaştırması';
    },
  },
  {
    yol: '/karsilastir/bambu-lab-a1-mini-vs-creality-ender-3-v3-ke',
    ikon: '🚀',
    kisaBaslik: 'Bambu Lab A1 Mini vs Ender 3 V3 KE',
    h1: 'Bambu Lab A1 Mini vs Creality Ender 3 V3 KE',
    title: 'Bambu Lab A1 Mini vs Ender 3 V3 KE — Başlangıç İçin Hangisi? | Baskı Hesap',
    description: 'Bambu Lab A1 Mini (180mm, AMS Lite) ve Creality Ender 3 V3 KE (220mm, Klipper) teknik farkları ve bugünkü kargo dahil Türkiye fiyatları.',
    ozet: 'İlk 3D yazıcısını alacakların en çok sorduğu iki modeli baskı alanı, çok renkli baskı (AMS Lite), ses seviyesi ve bugünkü Türkiye fiyatlarıyla kıyasladık.',
    solAd: 'Bambu Lab A1 Mini',
    sagAd: 'Creality Ender 3 V3 KE',
    solRegex: /bambu\s*lab\s*a1\s*mini/i,
    sagRegex: /ender\s*3\s*v3\s*ke/i,
    ozellikler: [
      ['Baskı Hacmi', '180 × 180 × 180 mm', '220 × 220 × 240 mm (%85+ daha fazla hacim)'],
      ['Mekanik Yapı', 'Kantilever + lineer raylar', 'Çift Z + lineer X raylı köprü gövde'],
      ['Çoklu Renk Desteği', 'AMS Lite ile 4 renge kadar tak-çalıştır', 'Tek renk (harici mod olmadan tek makara)'],
      ['Hız & Kalibrasyon', 'Tam otomatik titreşim/akış + sessiz motor', '500 mm/s Klipper + CR Touch otomatik Z-offset'],
      ['Nozul Değişimi', 'Tek klipsli hızlı nozul değişimi', 'Unicorn / vida tipi değişim'],
      ['Fiyat / Başlangıç Konforu', 'Tak-çalıştır ekosistem, sıfır ayar gereksinimi', 'Genelde daha düşük maliyet + geniş tabla'],
    ],
    solKimler: '180 mm baskı hacmi yeten, çok sessiz çalışma, tek tıkla çok renkli (AMS Lite) yükseltme ve minimum bakım isteyen kullanıcılar için idealdir.',
    sagKimler: 'Kask, büyük kutu veya geniş parça basacağı için 220×220×240 mm hacme ihtiyaç duyan ve bütçeyi daha aşağıda tutmak isteyenler için güçlüdür.',
    sss: [
      { soru: '180 mm baskı hacmi küçük kalır mı?', cevap: 'Figür, hobi ve günlük düzenleyicilerin çoğu 180 mm içine sığar; ancak büyük kutular veya kask parçaları için Ender 3 V3 KE’nin 220 mm tablası ciddi avantaj sağlar.' },
      { soru: 'Hangisi daha sessiz çalışır?', cevap: 'Bambu Lab A1 Mini aktif motor gürültüsü iptali sayesinde masa başında çok daha sessiz baskı alır.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /bambu\s*lab\s*a1\s*mini/i);
      const b = urunBul(u, /ender\s*3\s*v3\s*ke/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `A1 Mini: ${formatTL(a.enUcuzFiyat)} · V3 KE: ${formatTL(b.enUcuzFiyat)}`;
      return 'Başlangıç segmenti: AMS Lite konforu vs 220mm hacim';
    },
  },
  {
    yol: '/karsilastir/creality-k1-max-vs-bambu-lab-p1s',
    ikon: '🏗️',
    kisaBaslik: 'Creality K1 Max vs Bambu Lab P1S',
    h1: 'Creality K1 Max vs Bambu Lab P1S Karşılaştırması',
    title: 'Creality K1 Max vs Bambu Lab P1S + Canlı Türkiye Fiyatları | Baskı Hesap',
    description: '300mm hacimli Creality K1 Max ile 256mm Bambu Lab P1S CoreXY yazıcıların teknik farkları ve kargo dahil en ucuz mağaza fiyatları.',
    ozet: 'Üst segment CoreXY alırken "300×300 mm dev baskı alanı mı (K1 Max), yoksa AMS çok renkli baskı ve Bambu ekosistemi mi (P1S)?" sorusunu canlı fiyatlarla yanıtlıyoruz.',
    solAd: 'Creality K1 Max',
    sagAd: 'Bambu Lab P1S',
    solRegex: /creality\s*k1\s*max|\bk1\s*max\b/i,
    sagRegex: /bambu\s*lab\s*p1s/i,
    ozellikler: [
      ['Baskı Hacmi', '300 × 300 × 300 mm', '256 × 256 × 256 mm'],
      ['Kasa & Mimari', 'CoreXY kapalı kasa + LiDAR ilk katman', 'CoreXY kapalı kasa'],
      ['Maksimum Hız', '600 mm/s (Klipper / Creality OS)', '500 mm/s'],
      ['Çoklu Renk', 'Tek makara odaklı', 'AMS ile 4–16 renk destekli'],
      ['Yapay Zeka Kamera / LiDAR', 'Dahili AI kamera + LiDAR tarayıcı', 'Dahili izleme kamerası (LiDAR yok)'],
      ['Kullanım Odağı', 'Büyük tek parça endüstriyel/prototip baskılar', 'Çok renkli baskı + yüksek baskı tutarlılığı'],
    ],
    solKimler: 'Tek seferde 30 cm’ye varan büyük gövde, kask veya mimari maket basması gerekenler için fiyatıyla çok güçlüdür.',
    sagKimler: '256 mm tabla yeterli olan, çok renkli/çok malzemeli baskı (AMS) ve sıfıra yakın kalibrasyon zahmeti arayanlar için öne çıkar.',
    sss: [
      { soru: 'Creality K1 Max’ın en büyük artısı nedir?', cevap: '300×300×300 mm baskı hacmi sayesinde 256 mm sınıfı yazıcılarda ikiye bölmek zorunda kalacağınız parçaları tek seferde basabilirsiniz.' },
      { soru: 'P1S ile K1 Max aynı dayanıklılıkta filamentler basabilir mi?', cevap: 'Evet, ikisi de kapalı kasalı CoreXY olduğu için ABS, ASA, PETG ve doğru nozul/tabla ile teknik filamentleri basabilir.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /creality\s*k1\s*max|\bk1\s*max\b/i);
      const b = urunBul(u, /bambu\s*lab\s*p1s/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `K1 Max: ${formatTL(a.enUcuzFiyat)} · P1S: ${formatTL(b.enUcuzFiyat)}`;
      return '300mm dev hacim vs Bambu AMS CoreXY kıyaslaması';
    },
  },
  {
    yol: '/karsilastir/bambu-lab-a1-vs-bambu-lab-a1-mini',
    ikon: '⚖️',
    kisaBaslik: 'Bambu Lab A1 vs A1 Mini',
    h1: 'Bambu Lab A1 vs Bambu Lab A1 Mini Karşılaştırması',
    title: 'Bambu Lab A1 mi A1 Mini mi? Farklar + Canlı Türkiye Fiyatları | Baskı Hesap',
    description: 'Bambu Lab A1 (256mm) ile Bambu Lab A1 Mini (180mm) arasındaki baskı hacmi, gövde yapısı, AMS Lite ve kargo dahil canlı Türkiye fiyat farkları.',
    ozet: '"A1 mi almalıyım, A1 Mini yeter mi?" sorusunu 256 mm vs 180 mm baskı alanı, gürültü/yer ihtiyacı, AMS Lite uyumu ve bugünkü Türkiye mağaza fiyatlarıyla yanıtlıyoruz.',
    solAd: 'Bambu Lab A1',
    sagAd: 'Bambu Lab A1 Mini',
    solRegex: /bambu\s*lab\s*a1(?!\s*mini)/i,
    sagRegex: /bambu\s*lab\s*a1\s*mini/i,
    ozellikler: [
      ['Baskı Hacmi', '256 × 256 × 256 mm', '180 × 180 × 180 mm'],
      ['Gövde Mimarisi', 'Tam köprü (çift sütunlu bedslinger)', 'Tek kollu kompakt kantilever'],
      ['Çok Renkli Baskı', 'AMS Lite (4 renge kadar)', 'AMS Lite (4 renge kadar)'],
      ['Tabla Sıcaklığı', '100°C (PETG / büyük parçalarda daha stabil)', '80°C (PLA / PETG / TPU için yeterli)'],
      ['Hız & Nozul', '500 mm/s · hızlı klipsli nozul değişimi', '500 mm/s · aynı hızlı klipsli nozul'],
      ['Masa İhtiyacı', 'Geniş çalışma yüzeyi gerektirir', 'Çok kompakt, masaüstü dostu'],
    ],
    solKimler: 'Kask, büyük kutu, birden fazla parçayı tek tablada basma veya 256×256 mm standart MakerWorld profillerini ölçeklemeden direkt basmak isteyenler için idealdir.',
    sagKimler: 'Daha düşük bütçeyle aynı Bambu Lab baskı kalitesini ve otomatik akış kalibrasyonunu isteyen, masasında az yeri olan ve çoğunlukla 18 cm altı modeller basan kullanıcılar için öne çıkar.',
    sss: [
      { soru: 'Bambu Lab A1 ve A1 Mini baskı kalitesi aynı mı?', cevap: 'Evet, her iki model de aynı hızlı değişimli hotend sistemini, aktif motor gürültü iptalini ve otomatik akış dinamikleri kalibrasyonunu kullandığı için küçük-orta parçalarda baskı kalitesi neredeyse aynıdır.' },
      { soru: 'Hangisi daha mantıklı: A1 mi A1 Mini mi?', cevap: 'Bütçeniz elveriyorsa ve 256 mm standart MakerWorld modellerini bölmeden basmak istiyorsanız Bambu Lab A1 daha uzun ömürlüdür; masa alanı ve bütçe öncelikliyse A1 Mini fiyat/performans şampiyonudur.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /bambu\s*lab\s*a1(?!\s*mini)/i);
      const b = urunBul(u, /bambu\s*lab\s*a1\s*mini/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `A1: ${formatTL(a.enUcuzFiyat)} · A1 Mini: ${formatTL(b.enUcuzFiyat)}`;
      return '256 mm standart hacim vs 180 mm kompakt kıyaslaması';
    },
  },
  {
    yol: '/karsilastir/bambu-lab-a1-vs-creality-k1c',
    ikon: '🔥',
    kisaBaslik: 'Bambu Lab A1 vs Creality K1C',
    h1: 'Bambu Lab A1 vs Creality K1C Karşılaştırması',
    title: 'Bambu Lab A1 vs Creality K1C — Açık Çok Renk vs Kapalı Kasa | Baskı Hesap',
    description: 'Bambu Lab A1 ve Creality K1C teknik karşılaştırması: açık kasa AMS Lite çok renkli baskı vs kapalı kasa CoreXY karbon fiber ve canlı Türkiye fiyatları.',
    ozet: 'Bütçesi yakın bu iki popüler yazıcıda "Bambu ekosistemi + 256 mm alan + AMS Lite şansı (A1)" mı, yoksa "kapalı kasa CoreXY + ABS/ASA/CF uyumu (K1C)" mi daha doğru tercih?',
    solAd: 'Bambu Lab A1',
    sagAd: 'Creality K1C',
    solRegex: /bambu\s*lab\s*a1(?!\s*mini)/i,
    sagRegex: /creality\s*k1c|\bk1c\b/i,
    ozellikler: [
      ['Mimari & Kasa', 'Açık kasa bedslinger', 'CoreXY tam kapalı kasa'],
      ['Baskı Hacmi', '256 × 256 × 256 mm', '220 × 220 × 250 mm'],
      ['Malzeme Uyumu', 'PLA, PETG, TPU (ABS/ASA için kapalı ortam önerilmez)', 'PLA, PETG, TPU + ABS, ASA, PA-CF (karbon fiber)'],
      ['Çoklu Renk', 'AMS Lite ile sonradan 4 renge yükseltilebilir', 'Tek makara odaklı (CFS kiti ayrı)'],
      ['Ses Seviyesi', 'Aktif motor gürültü azaltma ile çok sessiz', 'Kapalı kasa egzoz/kasa fanları nedeniyle daha sesli'],
      ['Nozul Değişimi', 'Aletsiz tek klipsli hızlı değişim', 'Unicorn tek parça nozul'],
    ],
    solKimler: 'Evde/ofiste ağırlıklı PLA, PETG ve TPU basacak, sessiz çalışma, 256 mm geniş tabla ve ileride AMS Lite ile renkli baskı almak isteyenler için en pratik seçenektir.',
    sagKimler: 'Mühendislik parçaları (ABS, ASA, Naylon, Karbon Fiber) basacağı için kapalı kabin ve dahili karbon filtre isteyenler için CoreXY avantajı sunar.',
    sss: [
      { soru: 'Evde PLA baskı için Bambu Lab A1 mi Creality K1C mi alınmalı?', cevap: 'Yalnızca PLA/PETG/TPU basacaksanız Bambu Lab A1 hem daha sessizdir hem daha geniş 256×256 mm tabla sunar; ABS/ASA gibi mühendislik malzemeleri basacaksanız kapalı kasalı Creality K1C şarttır.' },
      { soru: 'Hangisinin yedek parça ve nozul maliyeti daha pratik?', cevap: 'Bambu Lab A1 tek klipsle saniyeler içinde nozul değiştirmenize izin verir; K1C ise uzun ömürlü tek parça Unicorn nozul kullanır.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /bambu\s*lab\s*a1(?!\s*mini)/i);
      const b = urunBul(u, /creality\s*k1c|\bk1c\b/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `A1: ${formatTL(a.enUcuzFiyat)} · K1C: ${formatTL(b.enUcuzFiyat)}`;
      return 'Açık kasa 256mm + AMS Lite vs Kapalı CoreXY CF';
    },
  },
];

function madalya(idx) {
  if (idx === 0) return '🥇 #1';
  if (idx === 1) return '🥈 #2';
  if (idx === 2) return '🥉 #3';
  return `#${idx + 1}`;
}

/** PLA ve PETG/TPU gibi canlı sıralama listeleri için ortak şablon. */
function canliSiralamaRehberiHtml(tumUrunler, tabanUrl, {
  yol, breadcrumbAd, rozet, h1Html, title, description, altMetin, bosMesaj, filtreFn, sssListesi,
}) {
  const canonicalUrl = `${tabanUrl}${yol}`;
  const urunler = tumUrunler
    .filter(u => filtreFn(u) && u.enUcuzFiyat > 0)
    .sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat);

  const satirlar = urunler.map((u, idx) => `
    <tr>
      <td><span class="sira-madalya">${madalya(idx)}</span></td>
      <td><a href="${htmlKacis(u.yol)}" style="color:var(--ana);font-weight:700;text-decoration:none">${htmlKacis(u.ad)}</a></td>
      <td>${htmlKacis(u.enUcuzSite || '—')}</td>
      <td>${u.stokluSayisi || 1} mağaza</td>
      <td><b style="color:var(--yesil)">${formatTL(u.enUcuzFiyat)}</b></td>
      <td>${u.enUcuzUrl ? `<a class="seo-cta ikincil" style="padding:5px 10px;font-size:12px" href="${htmlKacis(u.enUcuzUrl)}" target="_blank" rel="noopener sponsored nofollow">Mağaza ↗</a>` : `<a href="${htmlKacis(u.yol)}">İncele</a>`}</td>
    </tr>`).join('');

  const sss = sssBolumu(sssListesi);
  const enUcuz = urunler[0];
  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
        { '@type': 'ListItem', position: 3, name: breadcrumbAd, item: canonicalUrl },
      ],
    },
    ...(urunler.length ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: urunler.slice(0, 20).map((u, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: `${tabanUrl}${u.yol}`,
        name: u.ad,
      })),
    }] : []),
    ...(sss.jsonLd ? [sss.jsonLd] : []),
  ];

  return sayfaIskeleti({
    title,
    description,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    jsonLdList,
    aktifNav: 'rehber',
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>${htmlKacis(breadcrumbAd)}</span></nav>
      ${heroAlani({
        rozet,
        baslikHtml: h1Html,
        altMetin,
        istatistikler: [
          enUcuz ? `🥇 Lider: <b>${htmlKacis(enUcuz.ad)} · ${formatTL(enUcuz.enUcuzFiyat)}</b>` : '🔍 Canlı sıralama',
          `📦 <b>${urunler.length}</b> stoklu model`,
          '🚚 Kargo dahil kıyas',
        ],
      })}
      <section class="seo-kart">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
          <h2 style="margin:0">Güncel Kargo Dahil Fiyat Sıralaması</h2>
          <a class="seo-cta" style="padding:9px 15px;font-size:13px" href="/sepet.html">🧺 Çoklu Alımda Kargoyu Sıfırla</a>
        </div>
        ${urunler.length
          ? `<div style="overflow-x:auto"><table class="seo-tablo"><thead><tr><th>Sıra</th><th>Ürün</th><th>En Ucuz Mağaza</th><th>Teklif</th><th>Toplam</th><th>Link</th></tr></thead><tbody>${satirlar}</tbody></table></div>`
          : `<p>${htmlKacis(bosMesaj)}</p>`}
      </section>
      ${sss.html}
      ${altAraclarCubugu()}`,
  });
}

function baslangicYaziciRehberiHtml(tumUrunler, tabanUrl) {
  return canliSiralamaRehberiHtml(tumUrunler, tabanUrl, {
    yol: '/rehber/baslangic-icin-en-iyi-3d-yazicilar',
    breadcrumbAd: 'Başlangıç İçin En İyi 3D Yazıcılar',
    rozet: '🖨️ Canlı Bütçe & Fiyat Sıralaması · 2026',
    h1Html: 'Başlangıç için <b>en iyi 3D yazıcılar</b> (canlı Türkiye fiyatları)',
    title: 'Başlangıç İçin En İyi 3D Yazıcılar 2026 — Bütçeye Göre Canlı Fiyatlar | Baskı Hesap',
    description: 'İlk 3D yazıcısını alacaklar için Bambu Lab A1 Mini, Ender 3 V3 SE/KE, Elegoo Neptune 4 ve kapalı kasa modellerin kargo dahil güncel Türkiye fiyat sıralaması.',
    altMetin: 'Türkiye’deki 60+ mağazadan otomatik taranan stoklu 3D yazıcılar (yedek parçalar ve combo paketler hariç) kargo dahil en düşük bütçeden başlayarak sıralanır.',
    bosMesaj: 'Henüz taraması tamamlanan stoklu 3D yazıcı kaydı yok; ana sayfadan model aratarak canlı fiyat çekebilirsiniz.',
    filtreFn: (u) => (u.kategori === 'yazici' || u.kategoriSlug === '3d-yazici')
      && !parcaMi(u.ad)
      && u.enUcuzFiyat >= 4500
      && !/\bcombo\b/i.test(u.ad),
    sssListesi: [
      { soru: 'İlk kez 3D yazıcı alırken kaç TL bütçe ayırmak gerekir?', cevap: 'Giriş seviyesinde otomatik kalibrasyonlu, hızlı bir FDM 3D yazıcı için bütçe genellikle 10.000–16.000 TL bandından başlar; kapalı kasa CoreXY modeller ise 20.000 TL üzerinde yer alır.' },
      { soru: 'Başlangıçta açık kasa mı kapalı kasa mı tercih edilmeli?', cevap: 'Evde hobi ve figür/aparat için PLA, PETG ve TPU basacaksanız açık kasalı Bambu Lab A1 Mini, A1 veya Ender 3 V3 KE çok pratik ve sessizdir. ABS veya ASA gibi sıcak oda isteyen teknik malzemeler için kapalı kasa (K1C, P1S) gerekir.' },
      { soru: 'Bu listede neden yedek parça veya Combo paketler karışmıyor?', cevap: 'Sıralama yalnızca tekil gövde yazıcı ilanlarını kapsar; nozzle/tabla gibi aksesuarlar ve çoklu AMS Combo paketler fiyat kıyasını bozmaması için elenir.' },
    ],
  });
}

function enUcuzPlaRehberiHtml(tumUrunler, tabanUrl) {
  return canliSiralamaRehberiHtml(tumUrunler, tabanUrl, {
    yol: '/rehber/en-ucuz-pla-filament',
    breadcrumbAd: 'En Ucuz PLA Filamentler',
    rozet: '🏷️ Canlı ₺/kg PLA Sıralaması',
    h1Html: 'Türkiye\'nin <b>en ucuz PLA</b> filamentleri',
    title: 'Kilogramı En Ucuz PLA Filamentler — Canlı Türkiye Sıralaması | Baskı Hesap',
    description: 'Sunlu, Porima, Creality Ender PLA, eSun ve diğer 1.75mm PLA filamentlerin kargo dahil en ucuz güncel fiyat sıralaması.',
    altMetin: '60+ mağazadan çekilen kargo dahil stoklu 1.75mm PLA ve PLA+ filament teklifleri en düşük fiyattan başlayarak otomatik sıralanır.',
    bosMesaj: 'Henüz taraması tamamlanan PLA kaydı yok; ana sayfadan doğrudan aratarak canlı fiyat çekebilirsiniz.',
    filtreFn: (u) => u.kategoriSlug === 'pla-filament',
    sssListesi: [
      { soru: 'Bu listedeki PLA fiyatlarına kargo dahil mi?', cevap: 'Evet. Kargo ücreti bilinen tüm mağazalarda kargo bedeli toplama eklenerek sıralama yapılır; sepette kargo hesaplayan mağazalar ise ürün sayfasında açıkça işaretlenir.' },
      { soru: 'Çoklu PLA alırken kargodan nasıl tasarruf edilir?', cevap: 'Akıllı Sepet aracında istediğiniz filamentleri girerseniz, sistem mağazaların ücretsiz kargo eşiklerini hesaplayıp tek mağaza mı yoksa bölünmüş sepet mi daha ucuz olduğunu çıkarır.' },
    ],
  });
}

function enUcuzPetgTpuRehberiHtml(tumUrunler, tabanUrl) {
  return canliSiralamaRehberiHtml(tumUrunler, tabanUrl, {
    yol: '/rehber/en-ucuz-petg-ve-tpu-filamentler',
    breadcrumbAd: 'En Ucuz PETG & TPU Filamentler',
    rozet: '🦾 Canlı PETG, TPU & ABS Sıralaması',
    h1Html: 'En ucuz <b>PETG &amp; TPU</b> teknik filamentler',
    title: 'En Ucuz PETG, TPU & ABS Filamentler — Canlı Türkiye Sıralaması | Baskı Hesap',
    description: 'Porima, eSun, Microzey, Creality PETG ve esnek TPU filamentlerin Türkiye mağazalarındaki kargo dahil en ucuz güncel fiyatları.',
    altMetin: 'Dış mekan, sıcaklığa dayanıklı mekanik parça ve esnek baskılar için PETG / TPU filamentlerde 60+ mağazadaki kargo dahil en düşük teklifler.',
    bosMesaj: 'Henüz taraması tamamlanan PETG/TPU kaydı yok; ana sayfadan aratarak anlık kontrol edebilirsiniz.',
    filtreFn: (u) => u.kategoriSlug === 'petg-tpu-filament',
    sssListesi: [
      { soru: 'PETG ile esnek TPU arasında baskı hızı farkı var mı?', cevap: 'PETG standart 60–150 mm/s hızlarda rahat basılırken, 95A–98A TPU filamentler ekstrüderde bükülme olmaması için daha düşük hızlarda (20–45 mm/s) basılmalıdır.' },
      { soru: 'PETG ve TPU filamentler nem çeker mi?', cevap: 'Evet, hem PETG hem TPU higroskopiktir; uzun süre açıkta kaldığında çıtırtı ve yüzey bozulması yapmaması için filament kurutucu veya nem alıcılı saklama önerilir.' },
    ],
  });
}

function filamentKurutucuRehberiHtml(tumUrunler, tabanUrl) {
  const canonicalUrl = `${tabanUrl}/rehber/filament-kurutucu-gerekli-mi`;
  const kurutucular = tumUrunler
    .filter(u => /kurutucu|dryer|ebox|spacepi|filadryer/i.test(`${u.ad} ${u.sorgu}`))
    .sort((a, b) => (a.enUcuzFiyat || 9e9) - (b.enUcuzFiyat || 9e9));
  const enUcuz = kurutucular.find(k => k.enUcuzFiyat > 0);

  const kartlar = kurutucular.map(u => `<a class="seo-urun-kart" href="${htmlKacis(u.yol)}">
    <div class="seo-urun-ust">
      ${u.gorsel ? `<img class="seo-urun-img" src="${htmlKacis(u.gorsel)}" alt="${htmlKacis(u.ad)}" loading="lazy" />` : '<span class="seo-urun-ikon">🌡️</span>'}
      <div class="seo-mini-ad">${htmlKacis(u.ad)}</div>
    </div>
    <div class="seo-urun-etiketler">
      <span class="seo-urun-etiket">🏪 ${htmlKacis(u.enUcuzSite || 'Katalog')}</span>
      ${u.stokluSayisi > 1 ? `<span class="seo-urun-etiket">${u.stokluSayisi} mağaza</span>` : ''}
    </div>
    <div class="seo-urun-alt">
      <span class="seo-mini-fiyat">${u.enUcuzFiyat > 0 ? formatTL(u.enUcuzFiyat) : 'Canlı Tara'}</span>
      <span class="seo-urun-ok">Teklifleri Gör →</span>
    </div>
  </a>`).join('');

  const sss = sssBolumu([
    { soru: 'Hangi filamentlerde kurutucu kesin gereklidir?', cevap: 'Naylon (PA), TPU, PETG ve PVA çok hızlı nem çeker. Kuru PLA bile birkaç ay açıkta beklediğinde kolay kırılmaya ve ipliklenmeye başlar.' },
    { soru: 'Yazıcının ısıtmalı tablasıyla kurutma yapılabilir mi?', cevap: 'Acil durumda karton kutu + ısıtmalı tabla geçici çözüm sunar; ancak sıcaklık dağılımı ve enerji verimliliği açısından aktif fanlı bir kurutucu çok daha güvenlidir.' },
  ]);

  return sayfaIskeleti({
    title: 'Filament Kurutucu Gerekli mi? Hangi Sıcaklıkta Kurutulur + Canlı Fiyatlar | Baskı Hesap',
    description: 'PLA, PETG, TPU ve ABS kurutma sıcaklıkları/süreleri ve Türkiye mağazalarındaki eSun eBOX, Sunlu SP2, Creality SpacePi X4 canlı fiyatları.',
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    aktifNav: 'rehber',
    jsonLdList: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
          { '@type': 'ListItem', position: 3, name: 'Filament Kurutucu Rehberi', item: canonicalUrl },
        ],
      },
      ...(sss.jsonLd ? [sss.jsonLd] : []),
    ],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>Filament Kurutucu</span></nav>
      ${heroAlani({
        rozet: '🌡️ Baskı Kalitesi & Saklama Rehberi',
        baslikHtml: 'Filament kurutucu <b>gerçekten gerekli mi?</b>',
        altMetin: 'İpliklenme (stringing), nozul çıtırtısı ve kırılgan katmanların çoğu nemli filamentten kaynaklanır. Kurutma sıcaklıkları ve güncel cihaz fiyatları burada.',
        istatistikler: [
          enUcuz ? `🔥 En ucuz cihaz: <b>${formatTL(enUcuz.enUcuzFiyat)}</b>` : '🌡️ 45–70°C kurutma rehberi',
          `📦 <b>${kurutucular.length}</b> canlı model`,
          '💧 %15 altı bağıl nem hedefi',
        ],
      })}
      <section class="seo-kart">
        <h2 style="margin-top:0">Canlı Türkiye Filament Kurutucu Fiyatları</h2>
        <div class="seo-izgara">${kartlar || '<p>Kurutucu modelleri için Reçine &amp; Sarf kategorisini inceleyebilirsiniz.</p>'}</div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">Filamentlere Göre Kurutma Sıcaklığı ve Süresi</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr><th>Malzeme</th><th>Sıcaklık</th><th>Önerilen Süre</th><th>Nem Hassasiyeti</th></tr></thead>
            <tbody>
              <tr><td><b>PLA / PLA+</b></td><td>45 – 50 °C</td><td>4 – 6 saat</td><td>Orta (kırılganlaşma yapar)</td></tr>
              <tr><td><b>PETG</b></td><td>60 – 65 °C</td><td>4 – 6 saat</td><td>Yüksek (pürüz &amp; ipliklenme yapar)</td></tr>
              <tr><td><b>TPU (Esnek)</b></td><td>50 – 55 °C</td><td>4 – 6 saat</td><td>Çok Yüksek (kabarcık/çıtırtı)</td></tr>
              <tr><td><b>ABS / ASA</b></td><td>65 – 75 °C</td><td>4 – 6 saat</td><td>Orta-Yüksek</td></tr>
              <tr><td><b>PA / Naylon</b></td><td>70 – 80 °C</td><td>8 – 12 saat</td><td>Aşırı Yüksek (kurutucusuz basılmaz)</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      ${sss.html}
      ${altAraclarCubugu()}`,
  });
}

function plaVsPetgRehberiHtml(tumUrunler, tabanUrl) {
  const canonicalUrl = `${tabanUrl}/rehber/pla-vs-petg-filament`;
  const plaTop = tumUrunler.filter(u => u.kategoriSlug === 'pla-filament' && u.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat).slice(0, 4);
  const petgTop = tumUrunler.filter(u => u.kategoriSlug === 'petg-tpu-filament' && /petg/i.test(u.ad) && u.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat).slice(0, 4);

  const kartListe = (liste, bosMetin) => liste.length
    ? `<div class="seo-izgara">${liste.map(u => `<a class="seo-mini-kart" href="${htmlKacis(u.yol)}">
        <div class="seo-mini-ad">${htmlKacis(u.ad)}</div>
        <div class="seo-mini-fiyat">${formatTL(u.enUcuzFiyat)}</div>
        <div class="seo-mini-alt">${htmlKacis(u.enUcuzSite || '')} · Kargo dahil</div>
      </a>`).join('')}</div>`
    : `<p>${htmlKacis(bosMetin)}</p>`;

  const sss = sssBolumu([
    { soru: 'Araba içi veya güneş gören parçalarda PLA kullanılır mı?', cevap: 'Hayır, PLA yaklaşık 55°C civarında yumuşamaya başlar. Güneş gören ya da araç içi parçalarda en az PETG veya ABS/ASA tercih edilmelidir.' },
    { soru: 'PETG basarken neden daha dikkatli tabla ayarı gerekir?', cevap: 'PETG cam tablaya aşırı yapışıp yüzeyi koparabilir; PEI dokulu tabla veya yapıştırıcı/ayırıcı ince bir tabaka kullanmak güvenlidir.' },
  ]);

  return sayfaIskeleti({
    title: 'PLA vs PETG Filament Farkları, Sıcaklık Ayarları ve Canlı Fiyatlar | Baskı Hesap',
    description: 'PLA ve PETG filament arasındaki dayanıklılık, sıcaklık, esneklik, kullanım alanı farkları ve Türkiye mağazalarındaki en ucuz canlı fiyatlar.',
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    aktifNav: 'rehber',
    jsonLdList: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
          { '@type': 'ListItem', position: 3, name: 'PLA vs PETG Filament', item: canonicalUrl },
        ],
      },
      ...(sss.jsonLd ? [sss.jsonLd] : []),
    ],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>PLA vs PETG</span></nav>
      ${heroAlani({
        rozet: '🧵 Malzeme Seçim Rehberi',
        baslikHtml: 'PLA <b>vs</b> PETG — Hangisini seçmeli?',
        altMetin: 'Baskı sıcaklıkları, ısı/UV dayanımı, esneklik farkları ve bugünkü kargo dahil en ucuz makara teklifleri.',
        istatistikler: [
          plaTop[0] ? `🧵 PLA: <b>${formatTL(plaTop[0].enUcuzFiyat)}</b>'den` : '🧵 PLA',
          petgTop[0] ? `🦾 PETG: <b>${formatTL(petgTop[0].enUcuzFiyat)}</b>'den` : '🦾 PETG',
          '🌡️ 55°C vs 75°C ısı eşiği',
        ],
      })}
      <section class="seo-kart">
        <h2 style="margin-top:0">Mekanik &amp; Baskı Ayarı Karşılaştırması</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr><th>Kriter</th><th>PLA / PLA+</th><th>PETG</th></tr></thead>
            <tbody>
              <tr><td><b>Nozul Sıcaklığı</b></td><td>195 – 220 °C</td><td>230 – 250 °C</td></tr>
              <tr><td><b>Tabla Sıcaklığı</b></td><td>55 – 65 °C</td><td>75 – 85 °C</td></tr>
              <tr><td><b>Isı Dayanımı (HDT)</b></td><td>~55 °C (güneşte eğilebilir)</td><td>~70–75 °C</td></tr>
              <tr><td><b>Dayanım &amp; Esneklik</b></td><td>Sert ama ani darbede kırılgan</td><td>Darbe dayanımı ve esneme daha yüksek</td></tr>
              <tr><td><b>Baskı Kolaylığı</b></td><td>Çok kolay, ipliklenme az</td><td>Orta (nem tutar, daha fazla ipliklenebilir)</td></tr>
              <tr><td><b>İdeal Kullanım</b></td><td>Figür, prototip, dekoratif parça, kalıp</td><td>Braket, dış mekan, mekanik tutucu, su teması</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">Bugünkü En Ucuz PLA Teklifleri</h2>
        ${kartListe(plaTop, 'PLA fiyatlarını görmek için PLA kategorisine göz atabilirsiniz.')}
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">Bugünkü En Ucuz PETG Teklifleri</h2>
        ${kartListe(petgTop, 'PETG tekliflerini görmek için PETG/TPU kategorisine geçebilirsiniz.')}
      </section>
      ${sss.html}
      ${altAraclarCubugu()}`,
  });
}

function baskiMaliyetiRehberiHtml(tumUrunler, tabanUrl) {
  const canonicalUrl = `${tabanUrl}/rehber/3d-baski-maliyeti-nasil-hesaplanir`;
  const plaOrnek = tumUrunler
    .filter(u => u.kategoriSlug === 'pla-filament' && u.enUcuzFiyat > 0)
    .sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];

  const ornekKg = plaOrnek ? Math.round(plaOrnek.enUcuzFiyat) : 600;
  const hamMadde = Math.round((100 / 1000) * ornekKg * 1.1);
  const elektrik = Math.round(8 * 0.15 * 2.9);
  const toplamMaliyet = hamMadde + elektrik;

  const sss = sssBolumu([
    { soru: '3D yazıcı saatte ne kadar elektrik yakar?', cevap: 'Standart bir FDM 3D yazıcı ısıtma sonrası baskı sırasında ortalama 120–180 Watt (0.15 kWh civarı) tüketir; günde 8 saatlik bir baskı mesken tarifesinde birkaç TL tutar.' },
    { soru: 'STL dosyasından otomatik fiyat çıkarabilir miyim?', cevap: 'Evet. Baskı Maliyet Hesaplayıcı sayfamıza doğrudan STL dosyanızı sürükleyip bırakarak hacim, gramaj, elektrik ve satış fiyatını saniyeler içinde hesaplayabilirsiniz.' },
  ]);

  return sayfaIskeleti({
    title: '3D Baskı Maliyeti Nasıl Hesaplanır? (Filament + Elektrik + Satış) | Baskı Hesap',
    description: '3D yazıcı baskı maliyeti formülü: filament gramajı, fire oranı, saatlik elektrik tüketimi, yıpranma payı ve ücretsiz STL maliyet hesaplayıcı.',
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    aktifNav: 'rehber',
    jsonLdList: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
          { '@type': 'ListItem', position: 3, name: '3D Baskı Maliyeti Hesaplama', item: canonicalUrl },
        ],
      },
      ...(sss.jsonLd ? [sss.jsonLd] : []),
    ],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>3D Baskı Maliyeti</span></nav>
      ${heroAlani({
        rozet: '🧮 Fiyatlandırma & Maliyet Rehberi',
        baslikHtml: '3D baskı maliyeti <b>nasıl hesaplanır?</b>',
        altMetin: 'Satış veya teklif verirken yalnızca filament gramajına bakmak zarar ettirir. Doğru maliyet hesabı filament, fire, elektrik ve yıpranma payının toplamıdır.',
        istatistikler: [
          `⚖️ 100g örnek: <b>~${formatTL(toplamMaliyet)}</b>`,
          '⚡ Ortalama güç: ~150 W',
          '📐 STL ile saniyede hesapla',
        ],
      })}
      <section class="seo-kart">
        <div class="seo-fiyat-kutu">
          <div>💡 <b>Canlı Örnek (100 g / 8 saatlik parça):</b> ${plaOrnek ? `Bugünkü en ucuz PLA (${htmlKacis(plaOrnek.ad)} ≈ ${formatTL(ornekKg)}/kg)` : '600 TL/kg örnek PLA'} bazında %10 fireli ham madde (~${formatTL(hamMadde)}) + elektrik (~${formatTL(elektrik)}) ≈ <b style="color:var(--yesil)">${formatTL(toplamMaliyet)}</b> temel maliyet.</div>
        </div>
        <div class="seo-butonlar">
          <a class="seo-cta" href="/maliyet.html">🧮 STL Yükle &amp; Maliyeti Hesapla →</a>
          <a class="seo-cta ikincil" href="/rehber/en-ucuz-pla-filament">Güncel PLA Kg Fiyatları →</a>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">4 Adımda Baskı Maliyet Formülü</h2>
        <div class="formul-izgara">
          <div class="formul-kart">
            <b>1️⃣ Filament + Fire</b>
            <code>(gram / 1000) × ₺/kg × 1.10</code>
            <span class="seo-mini-alt">Destek (support), purge kulesi ve hatalı baskılar için %10–15 fire ekleyin.</span>
          </div>
          <div class="formul-kart">
            <b>2️⃣ Elektrik Tüketimi</b>
            <code>saat × 0.15 kW × tarife</code>
            <span class="seo-mini-alt">Yüksek tabla sıcaklığı (PETG/ABS) tüketimi hafif artırır.</span>
          </div>
          <div class="formul-kart">
            <b>3️⃣ Makine Yıpranması</b>
            <code>saat × (yazıcı / 2000)</code>
            <span class="seo-mini-alt">Nozul, PEI tabla, kayış ve fan ömrü her saat başına maliyete yazılır.</span>
          </div>
          <div class="formul-kart">
            <b>4️⃣ Emek &amp; Satış Fiyatı</b>
            <code>(temel + emek) × 2x–3x</code>
            <span class="seo-mini-alt">Destek temizleme, kutu/kargo ve varsa pazaryeri komisyonu eklenir.</span>
          </div>
        </div>
      </section>
      ${sss.html}
      ${altAraclarCubugu()}`,
  });
}

export const REHBER_SAYFALARI = [
  ...YAZICI_KARSILASTIRMALARI.map(y => ({
    yol: y.yol,
    ikon: y.ikon,
    baslik: y.h1,
    ozet: y.description,
    tur: 'Yazıcı Karşılaştırma',
    canliOzet: y.canliOzet,
    olustur: (tumUrunler, tabanUrl) => yaziciKarsilastirmaOlustur(y, tumUrunler, tabanUrl),
  })),
  {
    yol: '/rehber/baslangic-icin-en-iyi-3d-yazicilar',
    ikon: '🖨️',
    baslik: 'Başlangıç İçin En İyi 3D Yazıcılar (Bütçe Sıralaması)',
    ozet: 'İlk 3D yazıcısını alacaklar için stoklu modellerin kargo dahil güncel en düşük Türkiye fiyatları.',
    tur: 'Alım Rehberi',
    canliOzet: (u) => {
      const en = u.filter(x => (x.kategori === 'yazici' || x.kategoriSlug === '3d-yazici') && !parcaMi(x.ad) && x.enUcuzFiyat >= 4500 && !/\bcombo\b/i.test(x.ad))
        .sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      return en ? `Şu an en uygun: ${en.ad} · ${formatTL(en.enUcuzFiyat)}` : '10.000 TL+ canlı başlangıç 3D yazıcı listesi';
    },
    olustur: baslangicYaziciRehberiHtml,
  },
  {
    yol: '/rehber/en-ucuz-pla-filament',
    ikon: '🏷️',
    baslik: 'Kilogramı En Ucuz PLA & PLA+ Filamentler',
    ozet: 'Türkiye mağazalarında kargo dahil en ucuz stoklu PLA filament tekliflerini anlık sıralayın.',
    tur: 'Canlı Sıralama',
    canliOzet: (u) => {
      const en = u.filter(x => x.kategoriSlug === 'pla-filament' && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      return en ? `Şu an #1: ${en.ad} · ${formatTL(en.enUcuzFiyat)}` : 'Kargo dahil canlı ₺/kg PLA sıralaması';
    },
    olustur: enUcuzPlaRehberiHtml,
  },
  {
    yol: '/rehber/en-ucuz-petg-ve-tpu-filamentler',
    ikon: '🦾',
    baslik: 'En Ucuz PETG, TPU & ABS Filamentler',
    ozet: 'Dayanıklı dış mekan ve esnek baskılar için Türkiye mağazalarındaki en ucuz teklifler.',
    tur: 'Canlı Sıralama',
    canliOzet: (u) => {
      const en = u.filter(x => x.kategoriSlug === 'petg-tpu-filament' && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      return en ? `Şu an #1: ${en.ad} · ${formatTL(en.enUcuzFiyat)}` : 'Kargo dahil canlı PETG / TPU sıralaması';
    },
    olustur: enUcuzPetgTpuRehberiHtml,
  },
  {
    yol: '/rehber/filament-kurutucu-gerekli-mi',
    ikon: '🌡️',
    baslik: 'Filament Kurutucu Gerekli mi? Sıcaklıklar & Fiyatlar',
    ozet: 'İpliklenme ve kırılmayı önleyen kurutma süreleri ile eBOX / SP2 / SpacePi X4 canlı fiyatları.',
    tur: 'Ekipman Rehberi',
    canliOzet: (u) => {
      const en = u.filter(x => /kurutucu|dryer|ebox|spacepi|filadryer/i.test(`${x.ad} ${x.sorgu}`) && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      return en ? `En ucuz kurutucu: ${en.ad} · ${formatTL(en.enUcuzFiyat)}` : 'PLA/PETG/TPU kurutma sıcaklık tablosu';
    },
    olustur: filamentKurutucuRehberiHtml,
  },
  {
    yol: '/rehber/pla-vs-petg-filament',
    ikon: '🧵',
    baslik: 'PLA vs PETG Filament Farkları & Fiyatları',
    ozet: 'Isı dayanımı, esneklik, nozul sıcaklığı ve canlı Türkiye makara fiyatları tek sayfada.',
    tur: 'Malzeme Rehberi',
    canliOzet: (u) => {
      const pla = u.filter(x => x.kategoriSlug === 'pla-filament' && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      const petg = u.filter(x => x.kategoriSlug === 'petg-tpu-filament' && /petg/i.test(x.ad) && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      if (pla && petg) return `PLA: ${formatTL(pla.enUcuzFiyat)}'den · PETG: ${formatTL(petg.enUcuzFiyat)}'den`;
      return '55°C vs 75°C ısı dayanımı & canlı fiyatlar';
    },
    olustur: plaVsPetgRehberiHtml,
  },
  {
    yol: '/rehber/3d-baski-maliyeti-nasil-hesaplanir',
    ikon: '🧮',
    baslik: '3D Baskı Maliyeti Nasıl Hesaplanır?',
    ozet: 'Adım adım baskı maliyet formülü, örnek hesaplama ve ücretsiz STL maliyet hesaplayıcı.',
    tur: 'Maliyet Rehberi',
    canliOzet: () => '4 adımlı formül + canlı PLA maliyet örneği',
    olustur: baskiMaliyetiRehberiHtml,
  },
];

export function rehberSitemapKayitlari() {
  const bugun = new Date().toISOString().slice(0, 10);
  return [
    { yol: '/rehber', oncelik: '0.85', siklik: 'weekly', lastmod: bugun },
    ...REHBER_SAYFALARI.map(r => ({ yol: r.yol, oncelik: '0.85', siklik: 'daily', lastmod: bugun })),
  ];
}

export function rehberDiziniHtml(tabanUrl, tumUrunler = []) {
  const canonicalUrl = `${tabanUrl}/rehber`;
  const title = '3D Yazıcı Karşılaştırma ve Filament Rehberleri | Baskı Hesap';
  const description = 'Bambu Lab, Creality, Elegoo 3D yazıcı karşılaştırmaları, canlı en ucuz PLA filament sıralaması ve 3D baskı maliyet rehberleri.';

  const kartlar = REHBER_SAYFALARI.map(r => {
    const canliNot = typeof r.canliOzet === 'function' ? r.canliOzet(tumUrunler) : '';
    return `<a class="rehber-kart" href="${htmlKacis(r.yol)}">
      <div class="rehber-kart-ust">
        <span class="rehber-ikon" aria-hidden="true">${r.ikon || '📖'}</span>
        <span class="rehber-rozet">${htmlKacis(r.tur)}</span>
      </div>
      <h2 class="rehber-baslik">${htmlKacis(r.baslik)}</h2>
      <p class="rehber-ozet">${htmlKacis(r.ozet)}</p>
      ${canliNot ? `<div class="rehber-canli-band">⚡ ${htmlKacis(canliNot)}</div>` : ''}
      <span class="rehber-cta">Rehberi İncele →</span>
    </a>`;
  }).join('');

  return sayfaIskeleti({
    title,
    description,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    aktifNav: 'rehber',
    dilYolHaritasi: GLOBAL_REHBER_YOLLARI,
    jsonLdList: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonicalUrl,
    }],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <span>Rehber &amp; Karşılaştırmalar</span></nav>
      ${heroAlani({
        rozet: '📖 Canlı Fiyatlı Karşılaştırmalar · 2026',
        baslikHtml: 'Doğru 3D yazıcıyı <b>gerçek fiyatla</b> seç',
        altMetin: 'Statik blog yazıları değil — her karşılaştırma ve alım rehberi veritabanımızdaki kargo dahil güncel Türkiye mağaza fiyatlarını otomatik çeker.',
        istatistikler: [
          `📚 <b>${REHBER_SAYFALARI.length}</b> canlı rehber`,
          '⚖️ Yan yana VS kıyaslama',
          '🔄 Fiyatlar radardan otomatik güncellenir',
        ],
      })}
      <div class="rehber-izgara">${kartlar}</div>
      ${altAraclarCubugu()}`,
  });
}

export function rehberSayfasiBul(yol) {
  const temiz = String(yol || '').replace(/\/+$/, '').toLowerCase();
  return REHBER_SAYFALARI.find(r => r.yol === temiz) || null;
}

const GLOBAL_REHBER_KOPYA = Object.freeze({
  en: {
    title: '3D Printer Comparisons & Filament Buying Guides | Baski Hesap',
    desc: 'Live-priced 3D printer head-to-head comparisons, cheapest USD filament guides, and print cost calculation walkthroughs across verified US stores.',
    yolAna: 'Home',
    yolAd: 'Guides & Comparisons',
    rozet: '📖 Live-Priced Buying Guides · 2026',
    h1: 'Choose the right 3D printer with <b>live market pricing</b>',
    alt: 'Not static blog posts — compare Bambu Lab, Creality, Elegoo, and Prusa printers plus real USD filament unit costs across US stores.',
    ist1: 'live buying guides',
    ist2: '⚖️ Head-to-head VS specs',
    ist3: '🔄 Real USD store checks',
    cta: 'Read Guide →',
    aracBaslik: 'Tools to Estimate & Optimize Your Print',
    aracAlt: 'Jump straight to STL cost estimation, smart basket splitting, or the full US product catalog:',
    aracLink1: '🗂️ US Product Catalog',
    aracLink2: '🧮 STL Cost Calculator ($)',
    aracLink3: '🧺 Smart Basket Optimizer',
    aracLink4: '🧩 Cura & Slicer Plugin',
    kartlar: [
      {
        id: 'vs-p1s-k1c',
        ikon: '⚖️',
        tur: 'VS Comparison',
        baslik: 'Bambu Lab P1S vs Creality K1C',
        ozet: '256 mm AMS multicolor ecosystem vs enclosed Klipper CoreXY with hardened carbon-fiber nozzle and live US pricing.',
        band: '256×256×256 mm vs 220×220×250 mm · Enclosed CoreXY',
        sorgu: 'Bambu Lab P1S vs Creality K1C',
        urunA: 'Bambu Lab P1S',
        urunB: 'Creality K1C',
        detay: 'Compare build volume, AMS multi-color support, hardened nozzle durability, and live checkout pricing including shipping across US retailers (Creality US, Bambu Lab US, Amazon US, Best Buy, Walmart, MatterHackers).',
      },
      {
        id: 'vs-a1mini-v3ke',
        ikon: '🚀',
        tur: 'VS Comparison',
        baslik: 'Bambu Lab A1 Mini vs Creality Ender 3 V3 KE',
        ozet: 'Compact 180 mm quiet AMS Lite desktop printer vs 220 mm Klipper bedslinger with 500 mm/s peak speed.',
        band: '180 mm AMS Lite vs 220 mm 500 mm/s Klipper',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Creality Ender 3 V3 KE',
        detay: 'Best entry-level showdown: automatic flow-rate calibration and ultra-quiet operation on the A1 Mini versus larger build plate and open Klipper firmware on the Ender 3 V3 KE.',
      },
      {
        id: 'vs-v3ke-n4pro',
        ikon: '⚡',
        tur: 'VS Comparison',
        baslik: 'Creality Ender 3 V3 KE vs Elegoo Neptune 4 Pro',
        ozet: 'Two fast budget Klipper printers head-to-head: Sprite direct drive vs dual-zone heated bed & metal rails.',
        band: 'Dual-zone 250W bed vs 300°C Sprite hotend',
        sorgu: 'Elegoo Neptune 4 Pro',
        urunA: 'Creality Ender 3 V3 KE',
        urunB: 'Elegoo Neptune 4 Pro',
        detay: 'Evaluate high-flow hotend throughput, segmented bed heating efficiency, noise levels, and current US store availability.',
      },
      {
        id: 'guide-printers',
        ikon: '🖨️',
        tur: 'Buying Guide',
        baslik: 'Best Budget 3D Printers for Beginners (US Pricing)',
        ozet: 'Reliable plug-and-play FDM printers under $500 sorted by print speed, auto-leveling reliability, and real US stock.',
        band: 'Starter & mid-range FDM picks in USD',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Prusa MK4S',
        detay: 'From compact starter machines to enclosed multi-material workhorses, filter real US merchant offers with shipping included.',
      },
      {
        id: 'guide-pla',
        ikon: '🥇',
        tur: 'Filament Guide',
        baslik: 'Cheapest PLA & PLA+ Filaments per Kilogram ($/kg)',
        ozet: 'Compare 1 kg spools from eSun, SUNLU, Polymaker, Overture, and Creality Hyper PLA by real $/kg unit price.',
        band: 'Normalized $/kg comparison across US stores',
        sorgu: 'eSun PLA+ 1kg',
        urunA: 'eSun PLA+ 1kg',
        urunB: 'SUNLU PLA+ 1kg',
        detay: 'Never overpay on multi-packs or 2 kg spools: compare normalized $/kg prices after shipping across Amazon US, SUNLU, Polymaker, Overture, and MatterHackers.',
      },
      {
        id: 'guide-cost',
        ikon: '🧮',
        tur: 'Cost Guide',
        baslik: 'How to Calculate 3D Print Cost & Selling Price',
        ozet: 'Step-by-step formula covering filament grams, kWh electricity ($0.16/kWh), machine wear, and workshop profit margin.',
        band: '4-step formula + free client-side STL calculator',
        sorgu: 'PLA filament 1kg',
        urunA: 'Creality Hyper PLA 1kg',
        urunB: 'Polymaker PLA 1kg',
        detay: 'Formula: Net Cost = (Grams / 1000 × $/kg) + ((Watts × Hours / 1000) × $/kWh) + (Hours × $/hr Depreciation). Use the STL Cost Calculator to compute instantly in your browser.',
      },
    ],
  },
  fr: {
    title: 'Comparatifs Imprimantes 3D & Guides d’Achat Filament | Baski Hesap',
    desc: 'Duels techniques, classements des filaments PLA au meilleur prix au €/kg et calculateur de coût réel dans les boutiques européennes.',
    yolAna: 'Accueil',
    yolAd: 'Guides & Comparatifs',
    rozet: '📖 Guides d’Achat & Comparatifs · 2026',
    h1: 'Choisissez la bonne imprimante 3D au <b>prix réel (€)</b>',
    alt: 'Comparez Bambu Lab, Creality, Elegoo et Prusa ainsi que le coût réel au kilogramme de vos bobines sur les boutiques EU/FR.',
    ist1: 'guides pratiques',
    ist2: '⚖️ Comparatifs côte à côte',
    ist3: '🔄 Prix vérifiés en EUR (€)',
    cta: 'Lire le guide →',
    aracBaslik: 'Outils d’estimation et d’optimisation',
    aracAlt: 'Accédez directement au calculateur de coût STL, au panier intelligent ou au catalogue européen :',
    aracLink1: '🗂️ Catalogue Produits EU',
    aracLink2: '🧮 Calculateur de Coût (€)',
    aracLink3: '🧺 Panier Intelligent',
    aracLink4: '🧩 Extension Cura & Slicer',
    kartlar: [
      {
        id: 'vs-p1s-k1c',
        ikon: '⚖️',
        tur: 'Duel VS',
        baslik: 'Bambu Lab P1S vs Creality K1C',
        ozet: 'Écosystème multicouleur AMS (256 mm) contre CoreXY rapide avec buse renforcée pour fibre de carbone.',
        band: '256×256×256 mm vs 220×220×250 mm · CoreXY fermée',
        sorgu: 'Bambu Lab P1S',
        urunA: 'Bambu Lab P1S',
        urunB: 'Creality K1C',
        detay: 'Comparaison du volume d’impression, du support AMS, des températures admissibles et des tarifs TTC livraison incluse sur Bambu Lab EU, Creality EU, Amazon.fr, 3DJake et LDLC.',
      },
      {
        id: 'vs-a1mini-v3ke',
        ikon: '🚀',
        tur: 'Duel VS',
        baslik: 'Bambu Lab A1 Mini vs Creality Ender 3 V3 KE',
        ozet: 'Imprimante silencieuse 180 mm compatible AMS Lite face à une cartésienne Klipper 220 mm à 500 mm/s.',
        band: '180 mm AMS Lite vs 220 mm Klipper 500 mm/s',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Creality Ender 3 V3 KE',
        detay: 'Calibration automatique du débit et silence remarquable pour la A1 Mini vs grand plateau 220 mm et firmware Klipper ouvert sur la V3 KE.',
      },
      {
        id: 'vs-v3ke-n4pro',
        ikon: '⚡',
        tur: 'Duel VS',
        baslik: 'Creality Ender 3 V3 KE vs Elegoo Neptune 4 Pro',
        ozet: 'Deux imprimantes Klipper abordables : extrudeur Sprite 300 °C contre plateau chauffant double zone.',
        band: 'Plateau bi-zone 250 W vs Sprite 300 °C',
        sorgu: 'Elegoo Neptune 4 Pro',
        urunA: 'Creality Ender 3 V3 KE',
        urunB: 'Elegoo Neptune 4 Pro',
        detay: 'Analyse des performances de chauffe, des rails métalliques et des prix actuels port compris en Europe.',
      },
      {
        id: 'guide-printers',
        ikon: '🖨️',
        tur: 'Guide d’achat',
        baslik: 'Meilleures Imprimantes 3D pour Débuter (Prix EU)',
        ozet: 'Modèles fiables prêts à imprimer avec nivellement automatique et disponibilité immédiate en France/UE.',
        band: 'Sélection entrée & milieu de gamme en €',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Prusa MK4S',
        detay: 'Des machines compactes aux stations CoreXY rapides, vérifiez les stocks européens port inclus.',
      },
      {
        id: 'guide-pla',
        ikon: '🥇',
        tur: 'Guide Filament',
        baslik: 'Filaments PLA & PLA+ les moins chers au kilo (€/kg)',
        ozet: 'Comparez le vrai prix au kg (eSun, SUNLU, Overture, Elegoo, Bambu) livraison incluse.',
        band: 'Prix normalisé au €/kg sur boutiques EU',
        sorgu: 'eSun PLA+ 1kg',
        urunA: 'eSun PLA+ 1kg',
        urunB: 'SUNLU PLA+ 1kg',
        detay: 'Comparez le coût réel au kilogramme sur les packs 1 kg, 2 kg et bobines recharge.',
      },
      {
        id: 'guide-cost',
        ikon: '🧮',
        tur: 'Guide Coût',
        baslik: 'Comment calculer le coût de revient d’une impression 3D ?',
        ozet: 'Formule complète (filament, électricité 0,25 €/kWh, usure machine, marge) et calculateur STL gratuit.',
        band: 'Formule en 4 étapes + calculateur STL local',
        sorgu: 'PLA filament 1kg',
        urunA: 'Creality Hyper PLA 1kg',
        urunB: 'Overture PLA 1kg',
        detay: 'Coût net = (Grammes / 1000 × €/kg) + (kWh × tarif EDF) + (Heures × amortissement). Testez vos fichiers STL sans rien envoyer en ligne.',
      },
    ],
  },
  ja: {
    title: '3Dプリンター徹底比較＆フィラメント購入ガイド | Baski Hesap',
    desc: '人気3Dプリンターのスペック比較、kg単価ベースの最安PLAフィラメント、3Dプリント原価計算方法を日本市場の円（¥）基準で解説。',
    yolAna: 'ホーム',
    yolAd: 'ガイド・徹底比較',
    rozet: '📖 3Dプリント購入ガイド・比較 · 2026',
    h1: '<b>実勢価格（円）</b>と性能で失敗しない3Dプリンター選び',
    alt: 'Bambu Lab・Creality・Elegoo・Prusaのスペック比較や、日本国内ストア対応のkgあたり最安フィラメント選びをサポートします。',
    ist1: '件の比較・ガイド',
    ist2: '⚖️ 人気機種の徹底比較',
    ist3: '🔄 日本円（¥）リアルタイム検索対応',
    cta: 'ガイドを見る →',
    aracBaslik: '見積もり・まとめ買いツール',
    aracAlt: 'STL原価シミュレーターやスマートカート、日本製品カタログへ直接移動できます：',
    aracLink1: '🗂️ 日本向け製品カタログ',
    aracLink2: '🧮 原価シミュレーター (¥)',
    aracLink3: '🧺 スマートカート＆送料最適化',
    aracLink4: '🧩 Cura・スライサー連携',
    kartlar: [
      {
        id: 'vs-p1s-k1c',
        ikon: '⚖️',
        tur: '徹底比較 VS',
        baslik: 'Bambu Lab P1S vs Creality K1C',
        ozet: 'AMS多色造形対応の256mm密閉型P1Sと、カーボン強化ノズル標準装備のKlipper機K1Cを比較。',
        band: '256mm vs 220mm · 密閉型CoreXY高速機',
        sorgu: 'Bambu Lab P1S',
        urunA: 'Bambu Lab P1S',
        urunB: 'Creality K1C',
        detay: '造形サイズ、多色印刷（AMS）対応、炭素繊維入りフィラメント適正、日本国内公式ストア・Amazon.co.jpでの送料込み価格を比較します。',
      },
      {
        id: 'vs-a1mini-v3ke',
        ikon: '🚀',
        tur: '徹底比較 VS',
        baslik: 'Bambu Lab A1 Mini vs Creality Ender 3 V3 KE',
        ozet: '静音＆AMS Lite対応の180mmコンパクト機と、500mm/s高速220mmベッドスリンガーを比較。',
        band: '180mm 静音AMS Lite vs 220mm Klipper高速機',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Creality Ender 3 V3 KE',
        detay: '初心者向けの扱いやすさ・静音性と、より広い造形スペースのどちらを優先すべきか比較できます。',
      },
      {
        id: 'vs-v3ke-n4pro',
        ikon: '⚡',
        tur: '徹底比較 VS',
        baslik: 'Creality Ender 3 V3 KE vs Elegoo Neptune 4 Pro',
        ozet: '高コスパKlipper機対決：300℃ Spriteホットエンド vs デュアルゾーン加熱ベッド＆金属レール。',
        band: '2エリア独立加熱ベッド vs 300℃ダイレクト',
        sorgu: 'Elegoo Neptune 4 Pro',
        urunA: 'Creality Ender 3 V3 KE',
        urunB: 'Elegoo Neptune 4 Pro',
        detay: '消費電力節約に効く独立加熱ベッドや高速出力時の冷却性能、日本国内の送料込み価格をチェック。',
      },
      {
        id: 'guide-printers',
        ikon: '🖨️',
        tur: '購入ガイド',
        baslik: '初心者におすすめの高コスパ3Dプリンター（日本価格）',
        ozet: 'オートレベリング対応で失敗しにくい人気エントリー〜中級機を日本円の実勢価格でチェック。',
        band: '入門・中級FDMプリンター比較',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Prusa MK4S',
        detay: '設置スペースや予算別に日本公式サイト・国内代理店の在庫と送料込み価格を比較できます。',
      },
      {
        id: 'guide-pla',
        ikon: '🥇',
        tur: 'フィラメント',
        baslik: 'kg単価が最安のPLA・PLA+フィラメント比較 (¥/kg)',
        ozet: 'eSun・SUNLU・Bambu Lab・Creality・QIDIの1kgスプールを送料込kg単価で徹底比較。',
        band: '1kg換算 ¥/kg ベース比較',
        sorgu: 'eSun PLA+ 1kg',
        urunA: 'eSun PLA+ 1kg',
        urunB: 'SUNLU PLA+ 1kg',
        detay: 'まとめ買いや容量違いスプールを1kg単価へ自動換算して最安ショップを見つけます。',
      },
      {
        id: 'guide-cost',
        ikon: '🧮',
        tur: '原価計算',
        baslik: '3Dプリントの原価（材料費・電気代・償却費）の計算方法',
        ozet: 'フィラメント使用量・電力単価（31円/kWh）・機体消耗費から適正販売価格を導く計算式。',
        band: '4ステップ計算式＋ローカルSTL見積もり',
        sorgu: 'PLA filament 1kg',
        urunA: 'Creality Hyper PLA 1kg',
        urunB: 'eSun PLA+ 1kg',
        detay: '原価 = (使用グラム/1000 × ¥/kg) + (消費電力kW × 時間 × 電力単価) + (時間 × 償却費)。原価シミュレーターで即計算できます。',
      },
    ],
  },
});

function rehberIcinUrunBul(g, tumUrunler = []) {
  if (!Array.isArray(tumUrunler) || !tumUrunler.length) return null;
  const filamentKartMi = g.id === 'guide-pla' || g.id === 'guide-cost';
  const havuz = tumUrunler.filter((u) => {
    if (!u || !(Number(u.enUcuzFiyat) > 0)) return false;
    if (filamentKartMi) {
      return u.kategori === 'filament' || ['pla-filament', 'filament'].includes(u.kategoriSlug);
    }
    return (u.kategoriSlug === '3d-yazici' || u.kategori === 'yazici') && !parcaMi(u.ad);
  });
  if (!havuz.length) return null;

  const adayEslesirMi = (u, hedef) => {
    const baglam = `${u.ad || ''} ${u.sorgu || ''}`.toLowerCase();
    const tokenler = String(hedef || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t && !['3d', 'printer', '1kg', 'filament'].includes(t));
    if (!tokenler.length) return false;
    return tokenler.every(t => baglam.includes(t));
  };

  const tamA = havuz.find(u => adayEslesirMi(u, g.urunA));
  if (tamA) return tamA;
  const tamB = havuz.find(u => adayEslesirMi(u, g.urunB));
  if (tamB) return tamB;

  if (g.id === 'guide-cost') {
    const pla = havuz
      .filter(u => u.kategoriSlug === 'pla-filament')
      .sort((a, b) => Number(a.enUcuzFiyat) - Number(b.enUcuzFiyat));
    if (pla.length) return pla[0];
  }
  return null;
}

export function globalRehberDiziniHtml(dil = 'en', tabanUrl = '', tumUrunler = []) {
  const kod = dil === 'fr' ? 'fr' : (dil === 'ja' ? 'ja' : 'en');
  const k = GLOBAL_REHBER_KOPYA[kod];
  const onEk = `/${kod}`;
  const canonicalUrl = `${tabanUrl}${GLOBAL_REHBER_YOLLARI[kod]}`;
  const varsayilanPara = kod === 'fr' ? 'EUR' : (kod === 'ja' ? 'JPY' : 'USD');
  const katYol = kod === 'fr' ? '/fr/produits' : (kod === 'ja' ? '/ja/products' : '/en/products');
  const malYol = kod === 'fr' ? '/fr/calculateur-cout' : (kod === 'ja' ? '/ja/cost-calculator' : '/en/cost-calculator');
  const sepYol = kod === 'fr' ? '/fr/panier' : (kod === 'ja' ? '/ja/basket' : '/en/basket');
  const slcYol = `/${kod}/slicer`;
  const karsilastirEtiket = kod === 'fr' ? '🔍 Comparer →' : (kod === 'ja' ? '🔍 価格比較 →' : '🔍 Compare →');

  const kartlarHtml = k.kartlar.map((g) => {
    const araLinkA = `${onEk}?url=${encodeURIComponent(g.urunA)}`;
    const araLinkB = `${onEk}?url=${encodeURIComponent(g.urunB)}`;
    const tekUrun = rehberIcinUrunBul(g, tumUrunler);
    const canliSatir = tekUrun?.enUcuzFiyat > 0
      ? `${tekUrun.ad} · ${formatPara(tekUrun.enUcuzFiyat, tekUrun.paraBirimi || varsayilanPara)}${tekUrun.enUcuzSite ? ` (${tekUrun.enUcuzSite})` : ''}`
      : g.band;
    return `<article class="rehber-kart" id="${htmlKacis(g.id)}">
      <div class="rehber-kart-ust">
        <span class="rehber-ikon" aria-hidden="true">${g.ikon}</span>
        <span class="rehber-rozet">${htmlKacis(g.tur)}</span>
      </div>
      <h2 class="rehber-baslik">${htmlKacis(g.baslik)}</h2>
      <p class="rehber-ozet">${htmlKacis(g.ozet)}</p>
      <p class="rehber-ozet" style="font-size:12.5px;opacity:.92">${htmlKacis(g.detay)}</p>
      <div class="rehber-canli-band">⚡ ${htmlKacis(canliSatir)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
        <a class="rehber-cta" href="${htmlKacis(araLinkA)}">🔍 ${htmlKacis(g.urunA)} →</a>
        <a class="rehber-cta" href="${htmlKacis(araLinkB)}">⚖️ ${htmlKacis(g.urunB)} →</a>
      </div>
    </article>`;
  }).join('');

  return sayfaIskeleti({
    title: k.title,
    description: k.desc,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    aktifNav: 'rehber',
    dil: kod,
    dilYolHaritasi: GLOBAL_REHBER_YOLLARI,
    jsonLdList: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: k.title,
      description: k.desc,
      url: canonicalUrl,
    }],
    govdeHtml: `
      <nav class="seo-yol"><a href="${onEk}">${htmlKacis(k.yolAna)}</a> › <span>${htmlKacis(k.yolAd)}</span></nav>
      <section class="hero seo-hero">
        <div class="hero-ic">
          <span class="hero-rozet">${k.rozet}</span>
          <h1>${k.h1}</h1>
          <p>${htmlKacis(k.alt)}</p>
          <div class="hero-istatistik">
            <span>📚 <b>${k.kartlar.length}</b> ${htmlKacis(k.ist1)}</span>
            <span>${k.ist2}</span>
            <span>${k.ist3}</span>
          </div>
        </div>
      </section>
      <div class="rehber-izgara">${kartlarHtml}</div>
      <section class="seo-rehber-kart" aria-label="${htmlKacis(k.aracBaslik)}">
        <div class="seo-rehber-ust">
          <div>
            <h2 class="bolum-baslik" style="margin:0 0 4px">${htmlKacis(k.aracBaslik)}</h2>
            <p class="ipucu" style="margin:0">${htmlKacis(k.aracAlt)}</p>
          </div>
          <a class="seo-tum-link" href="${onEk}">${karsilastirEtiket}</a>
        </div>
        <div class="seo-rehber-baglar">
          <a href="${katYol}">${k.aracLink1}</a>
          <a href="${malYol}">${k.aracLink2}</a>
          <a href="${sepYol}">${k.aracLink3}</a>
          <a href="${slcYol}">${k.aracLink4}</a>
        </div>
      </section>`,
  });
}
