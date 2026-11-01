/** İkinci parti siteler — platform fabrikalarından oluştur. */
import { tsoftSite } from './plt-tsoft.js';
import { platinmarketSite } from './plt-platinmarket.js';
import { ticimaxSite } from './plt-ticimax.js';
import { ideasoftKlasikSite } from './plt-ideasoft-klasik.js';
import { ideasoftQukaSite } from './plt-ideasoft-quka.js';
import { prestashopSite } from './plt-prestashop.js';
import { trendruumSite } from './plt-trendruum.js';
import { koctasSite } from './plt-koctas.js';
import { teknosaSite } from './plt-teknosa.js';
import { pttavmSite } from './plt-pttavm.js';
import { ciceksepetiSite } from './plt-ciceksepeti.js';
import { urhanshopSite } from './plt-urhanshop.js';
import { n11Site } from './plt-n11.js';

export const yeniSiteler = [
  // PlatinMarket
  platinmarketSite({ id: 'deneystore', name: 'Deneystore', hosts: ['deneystore.com', 'www.deneystore.com'], base: 'https://www.deneystore.com' }),
  // T-Soft
  tsoftSite({ id: 'nmosphere', name: 'Nmosphere', hosts: ['nmosphere.com.tr', 'www.nmosphere.com.tr'], base: 'https://nmosphere.com.tr', tema: 'baslik' }),
  tsoftSite({ id: 'robo90', name: 'Robo90', hosts: ['robo90.com', 'www.robo90.com'], base: 'https://robo90.com' }),
  tsoftSite({ id: 'hepsivar', name: 'Hepsivar', hosts: ['hepsivar.com', 'www.hepsivar.com'], base: 'https://www.hepsivar.com', tema: 'baslik', aramaYolu: '/1-13.xhtml?q=' }),
  // Ticimax (arama yolu siteye göre değişir: /arama ya da /Arama)
  ticimaxSite({ id: '3dultra', name: '3D Ultra', hosts: ['3dultra.com.tr', 'www.3dultra.com.tr'], base: 'https://www.3dultra.com.tr', aramaYolu: '/Arama?kelime=' }),
  ticimaxSite({ id: 'robotizmo', name: 'Robotizmo', hosts: ['robotizmo.net', 'www.robotizmo.net'], base: 'https://robotizmo.net', aramaYolu: '/Arama?kelime=' }),
  ticimaxSite({ id: '3dcim', name: '3Dcim', hosts: ['3dcim.com', 'www.3dcim.com'], base: 'https://3dcim.com', aramaYolu: '/Arama?kelime=' }),
  // IdeaSoft klasik teması
  ideasoftKlasikSite({ id: 'mintengo', name: 'Mintengo', hosts: ['mintengo.com', 'www.mintengo.com'], base: 'https://mintengo.com' }),
  ideasoftKlasikSite({ id: 'kurumsalit', name: 'Kurumsal IT', hosts: ['kurumsalit.com', 'www.kurumsalit.com'], base: 'https://kurumsalit.com' }),
  ideasoftKlasikSite({ id: 'robotzade', name: 'Robotzade', hosts: ['robotzade.com', 'www.robotzade.com'], base: 'https://www.robotzade.com' }),
  ideasoftKlasikSite({ id: 'robitshop', name: 'Robitshop', hosts: ['robitshop.com', 'www.robitshop.com'], base: 'https://robitshop.com' }),
  // bisiparisver.com (2026-10-29): IdeaSoft klasik teması — ölçümle doğrulandı:
  // /tumu-c-0?k=<sorgu> 56 kart + showcase-price-new, ürün sayfasında product-price-new.
  // JSON-LD YOK (ideasoftSite uygun değil), doğrudan çekim 200/379KB.
  ideasoftKlasikSite({ id: 'bisiparisver', name: 'Bi Sipariş Ver', hosts: ['bisiparisver.com', 'www.bisiparisver.com'], base: 'https://www.bisiparisver.com' }),
  // IdeaSoft quka teması
  ideasoftQukaSite({ id: 'rhino3dprinter', name: 'Rhino 3D Printer', hosts: ['rhino3dprinter.com', 'www.rhino3dprinter.com'], base: 'https://www.rhino3dprinter.com' }),
  // PrestaShop
  prestashopSite({ id: 'sivasrobotik', name: 'Sivas Robotik', hosts: ['sivasrobotik.com.tr', 'www.sivasrobotik.com.tr'], base: 'https://sivasrobotik.com.tr' }),
  // Özel platformlar
  trendruumSite({ id: 'trendruum', name: 'trendruum', hosts: ['trendruum.com', 'www.trendruum.com'], base: 'https://www.trendruum.com' }),
  koctasSite({ id: 'koctas', name: 'Koçtaş', hosts: ['koctas.com.tr', 'www.koctas.com.tr'], base: 'https://www.koctas.com.tr' }),
  // Cloudflare korumalı (render tabanlı; başarılı istek başına 10 kredi)
  teknosaSite({ id: 'teknosa', name: 'Teknosa', hosts: ['teknosa.com', 'www.teknosa.com'], base: 'https://www.teknosa.com' }),
  pttavmSite({ id: 'pttavm', name: 'PTT AVM', hosts: ['pttavm.com', 'www.pttavm.com'], base: 'https://www.pttavm.com' }),
  // Cloudflare korumalı pazaryeri (render tabanlı; parametre `query` — `q` değil)
  ciceksepetiSite({ id: 'ciceksepeti', name: 'Çiçeksepeti', hosts: ['ciceksepeti.com', 'www.ciceksepeti.com'], base: 'https://www.ciceksepeti.com' }),
  // ASP.NET postback araması (VIEWSTATE + oturum çerezi ile 3 adımlı akış)
  urhanshopSite({ id: 'urhanshop', name: 'URHANSHOP', hosts: ['urhanshop.com', 'www.urhanshop.com'], base: 'https://www.urhanshop.com' }),
  // Büyük pazaryeri — HTTPS Cloudflare korumalı, tüm istekler düz HTTP üzerinden (1 kredi/istek)
  n11Site({ id: 'n11', name: 'n11', hosts: ['n11.com', 'www.n11.com'], base: 'http://www.n11.com' }),
];
