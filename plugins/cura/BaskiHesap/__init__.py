# -*- coding: utf-8 -*-
"""
Baskı Hesap — Cura eklenti giriş noktası.

Cura, plugins/<id>/__init__.py içindeki `register(app)` fonksiyonunu çağırır.
Dönen sözlükteki `extension` nesnesi Cura yaşam döngüsüne bağlanır.

Eklenti yüklenirken oluşan HİÇBİR hata Cura'yı çökertmez: hata loglanır ve
boş sözlük döner (Cura eklentisiz devam eder).
"""


def getMetaData():
    """Cura'nın eklenti listesinde görünen bilgiler."""
    return {
        "plugin": {
            "name": "Baskı Hesap - Filament Maliyet Radarı",
            "description": (
                "Dilimleme bittiğinde harcanacak filamenti ve en ucuz stoklu "
                "makarayı gösterir. Tek tıkla satın alma bağlantısı açar."
            ),
            "version": "1.0.0",
            "author": "Baskı Hesap",
            "website": "https://baskihesap.tech/slicer.html",
        }
    }


def register(app):
    """Eklentiyi Cura'ya kaydeder (tamamen korumalı)."""
    try:
        from . import BaskiHesapExtension

        uzanti = BaskiHesapExtension.BaskiHesapExtension()
        # CuraApplication geç hazır olabiliyor → eklenti kendi içinde
        # gecikmeli/tembel bağlanır (bkz. _cerceve_bagla ve QTimer tekrarı).
        uzanti.baglanmayi_planla()
        return {"extension": uzanti}
    except Exception as hata:  # noqa: BLE001 — Cura'yı korumak için geniş yakalama
        try:
            from UM.Logger import Logger
            Logger.log("e", "[BaskiHesap] Eklenti yüklenemedi: %s", hata)
        except Exception:
            pass
        return {}
