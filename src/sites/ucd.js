/** 3D baskı sektörü siteleri — platform fabrikalarından oluştur. */
import { tsoftSite } from './plt-tsoft.js';
import { platinmarketSite } from './plt-platinmarket.js';
import { shopifySite } from './plt-shopify.js';
import { ideasoftSite } from './plt-ideasoft.js';
import { ideasoftKlasikSite } from './plt-ideasoft-klasik.js';
import { ticimaxSite } from './plt-ticimax.js';
import { ikasSite } from './plt-ikas.js';

export const ucdSiteler = [
  // T-Soft — eski tema (product-title kartları)
  tsoftSite({ id: 'robotistan', name: 'Robotistan', hosts: ['robotistan.com', 'www.robotistan.com'], base: 'https://www.robotistan.com', tema: 'baslik' }),
  tsoftSite({ id: 'robolinkmarket', name: 'Robolink Market', hosts: ['robolinkmarket.com', 'www.robolinkmarket.com'], base: 'https://www.robolinkmarket.com', tema: 'baslik' }),
  // T-Soft — yeni tema (data-toggle="product-url" kartları)
  // direnc.net fiyatları KDV HARİÇ yayımlıyor (sayfada "567,11 TL + KDV" ve
  // "680,53 TL KDV Dahil"); kdvDahil:true, KDV dahil tutarın gösterilmesini sağlar.
  tsoftSite({ id: 'direnc', name: 'Direnc.net', hosts: ['direnc.net', 'www.direnc.net'], base: 'https://www.direnc.net', tema: 'url', kdvDahil: true }),
  tsoftSite({ id: 'motorobit', name: 'Motorobit', hosts: ['motorobit.com', 'www.motorobit.com'], base: 'https://www.motorobit.com', tema: 'url' }),
  tsoftSite({ id: 'filamentsan', name: 'FilamentSan', hosts: ['filamentsan.com', 'www.filamentsan.com'], base: 'https://filamentsan.com', tema: 'url' }),
  tsoftSite({ id: '3dortgen', name: '3dörtgen', hosts: ['3dortgen.com', 'shop.3dortgen.com', 'www.3dortgen.com'], base: 'https://shop.3dortgen.com', tema: 'url' }),
  // PlatinMarket
  platinmarketSite({ id: 'domirobot', name: 'domiRobot', hosts: ['domirobot.com', 'www.domirobot.com'], base: 'https://www.domirobot.com' }),
  // Shopify
  shopifySite({ id: '3dteknomarket', name: '3D Tekno Market', hosts: ['3dteknomarket.com', 'www.3dteknomarket.com'], base: 'https://3dteknomarket.com' }),
  // IdeaSoft smart teması (token'lı canlı arama ucu)
  ideasoftSite({ id: 'filamentmarketim', name: 'FilamentMarketim', hosts: ['filamentmarketim.com', 'www.filamentmarketim.com'], base: 'https://www.filamentmarketim.com' }),
  ideasoftSite({ id: 'teknikfilament3d', name: 'Teknik Filament 3D', hosts: ['teknikfilament3d.com', 'www.teknikfilament3d.com'], base: 'https://www.teknikfilament3d.com' }),
  // IdeaSoft klasik teması
  ideasoftKlasikSite({ id: 'matersan', name: 'Matersan', hosts: ['matersan.com.tr', 'www.matersan.com.tr'], base: 'https://matersan.com.tr' }),
  // Ticimax
  ticimaxSite({ id: 'filamentdepom', name: 'Filament Depom', hosts: ['filamentdepom.com', 'www.filamentdepom.com'], base: 'https://filamentdepom.com' }),
  // İkas
  ikasSite({ id: 'samm', name: 'SAMM Market', hosts: ['market.samm.com', 'samm.com'], base: 'https://market.samm.com' }),
];
