"""
Net Etkin Fiyat Motoru — örnek senaryolar ve doğrulama.
Çalıştırma:  python senaryolar.py
"""
from decimal import Decimal

from net_effective_price import NetEffectivePriceCalculator

calc = NetEffectivePriceCalculator()

# ===========================================================================
# Senaryo 1: Klasik — sepet indirimi + kupon + banka indirimi + ücretsiz kargo
# Etiket 1.200 → satış 1.050; %10 sepet indirimi (min 200); 50 TL kupon (min 300);
# Ziraat Bankkart 100 TL (kuponla birleşmiyor); kargo 49,90 ama 1.000 TL üzeri bedava;
# %2 puan (indirim sonrası tabandan).
# ===========================================================================
urun_1 = {
    "id": "P-1001",
    "title": "Kablosuz Kulaklık X",
    "currency": "TRY",
    "list_price": "1200.00",
    "selling_price": "1050.00",
    "price_includes_tax": True,
    "taxes": [{"type": "KDV", "rate": "0.20", "amount_included": "175.00"}],
    "cart_discounts": [
        {"id": "sepet-10", "method": "percent", "value": "10",
         "min_basket": "200.00", "label": "%10 sepet indirisi", "source": "site kampanyası"}
    ],
    "coupons": [
        {"id": "KUP-50", "code": "YAZ50", "method": "fixed", "value": "50",
         "min_basket": "300.00", "label": "YAZ50 kuponu"}
    ],
    "bank_campaigns": [
        {"id": "ZIR-100", "bank": "Ziraat", "card_program": "Bankkart",
         "method": "fixed", "value": "100", "min_basket": "500",
         "combinable_with_coupons": False, "label": "Ziraat Bankkart'a özel 100 TL"}
    ],
    "shipping": {"fee": "49.90", "free_over": "1000.00", "threshold_base": "after_discounts"},
    "cashback": {"kind": "points", "rate": "0.02", "base": "post_discount"},
    "fees": [],
}
kullanici_1 = {
    "currency": "TRY",
    "coupons_owned": ["YAZ50"],
    "card": {"bank": "Ziraat", "program": "Bankkart"},
}
r1 = calc.calculate(urun_1, kullanici_1)
print("=== Senaryo 1: sepet indirimi + banka + eşik üstü kargo ===")
for b in r1.breakdown:
    print(f"  {b.step:22} {b.label:45} {b.amount:>10}")
print(f"  PAYABLE_NOW = {r1.payable_now} | CASHBACK = {r1.cashback_value} | EFFECTIVE = {r1.effective_cost}")
print(f"  Varsayımlar: {r1.assumptions}")
print(f"  Atlanan: {[(s.label, s.reason) for s in r1.skipped]}")
print(f"  MESAJ: {r1.format_user_message()}")
print()

# Beklenen el ile hesap:
#   1050 − %10 (105) = 945 → banka 100 seçilir (kupon 50'den büyük, birleşmiyorlar)
#   945 − 100 = 845 → kargo eşiği 1000 aşılamadı! → +49.90 = 894.90
#   puan: %2 × 845 = 16.90 → etkin = 894.90 − 16.90 = 878.00
assert r1.payable_now == Decimal("894.90"), r1.payable_now
assert r1.cashback_value == Decimal("16.90"), r1.cashback_value

# ===========================================================================
# Senaryo 2: Kupon daha avantajlı — kupon 300 TL, banka 100 TL
# ===========================================================================
urun_2 = {**urun_1, "coupons": [
    {"id": "KUP-300", "code": "VIP300", "method": "fixed", "value": "300",
     "min_basket": "300.00", "label": "VIP300 kuponu"}
]}
kullanici_2 = {**kullanici_1, "coupons_owned": ["VIP300"]}
r2 = calc.calculate(urun_2, kullanici_2)
print("=== Senaryo 2: kupon (300) > banka (100), birleşmezlik ===")
print(f"  PAYABLE_NOW = {r2.payable_now} | varsayım: {r2.assumptions}")
# 1050 − 105 = 945 → kupon 300 seçilir → 645 → eşik altı → +49.90 = 694.90
assert r2.payable_now == Decimal("694.90"), r2.payable_now

# ===========================================================================
# Senaryo 3: Eşik üstü — satış fiyatı 1.400 (indirimler sonrası 1.190 > 1.000) → kargo bedava
# ===========================================================================
urun_3 = {**urun_1, "list_price": "1500.00", "selling_price": "1400.00"}
r3 = calc.calculate(urun_3, kullanici_1)
print("=== Senaryo 3: kargo eşiği aşılır ===")
print(f"  PAYABLE_NOW = {r3.payable_now}")
# 1400 − 140 = 1260 → banka 100 → 1160 ≥ 1000 → kargo bedava → 1160; puan %2×1160=23.20
assert r3.payable_now == Decimal("1160.00"), r3.payable_now
assert r3.cashback_value == Decimal("23.20"), r3.cashback_value

# ===========================================================================
# Senaryo 4: Yüzde kupon + tavan (max_discount) + süresi dolmuş kupon
# ===========================================================================
urun_4 = {
    **urun_1,
    "coupons": [
        {"id": "KUP-15", "code": "YUZDE15", "method": "percent", "value": "15",
         "max_discount": "100.00", "label": "%15 kupon (max 100 TL)"},
        {"id": "KUP-ESKI", "code": "ESKI", "method": "fixed", "value": "80",
         "expires_at": "2026-01-01T00:00:00", "label": "Süresi dolmuş kupon"},
    ],
}
kullanici_4 = {"currency": "TRY", "coupons_owned": ["YUZDE15", "ESKI"]}
r4 = calc.calculate(urun_4, kullanici_4)
print("=== Senaryo 4: %15 kupon max 100 TL tavanı + süresi dolmuş kupon ===")
for b in r4.breakdown:
    print(f"  {b.step:22} {b.label:45} {b.amount:>10}")
print(f"  PAYABLE_NOW = {r4.payable_now} | atlanan: {[(s.label, s.reason) for s in r4.skipped]}")
# 1050 − 105 = 945 → kupon %15 = 141.75 ama tavan 100 → 845 → banka ile birleşmiyor:
# kupon (100) > banka (100)? eşit — min() ilkini seçer (adaylar sırası: kupon+banka birlikte
# denenmez çünkü banka birleşmiyor; alternatifler: kupon yalnız → 845, banka yalnız → 845)
assert r4.payable_now == Decimal("894.90"), r4.payable_now  # 845 + 49.90 kargo

# ===========================================================================
# Senaryo 5: KDV hariç fiyat + hizmet bedeli + taksit vade farkı
# ===========================================================================
urun_5 = {
    **urun_1,
    "list_price": "800.00",
    "selling_price": "800.00",
    "price_includes_tax": False,
    "taxes": [{"type": "KDV", "rate": "0.20"}],
    "cart_discounts": [],
    "coupons": [],
    "bank_campaigns": [
        {"id": "GAR-9", "bank": "Garanti", "method": "fixed", "value": "60",
         "combinable_with_coupons": True,
         "installments": [{"count": 9, "surcharge": "45.00"}],
         "label": "Garanti BBVA 60 TL"}
    ],
    "shipping": {"fee": "30.00", "free_over": None},
    "cashback": None,
    "fees": [{"kind": "Hizmet", "amount": "5.00"}],
}
kullanici_5 = {
    "currency": "TRY",
    "card": {"bank": "Garanti", "program": "Bonus"},
    "installment_count": 9,
}
r5 = calc.calculate(urun_5, kullanici_5)
print("=== Senaryo 5: KDV hariç + hizmet bedeli + 9 taksit vade farkı ===")
for b in r5.breakdown:
    print(f"  {b.step:22} {b.label:45} {b.amount:>10}")
print(f"  PAYABLE_NOW = {r5.payable_now}")
# 800 + KDV %20 (160) = 960 → banka 60 → 900 → kargo 30 → 930 → hizmet 5 → 935 → vade 45 → 980
assert r5.payable_now == Decimal("980.00"), r5.payable_now

# ===========================================================================
# Senaryo 6: Banka kartı uyuşmuyor (kullanıcı farklı bankalı) → kampanya atlanır
# ===========================================================================
kullanici_6 = {"currency": "TRY", "card": {"bank": "İşbank", "program": "Maximum"}}
r6 = calc.calculate(urun_1, kullanici_6)
print("=== Senaryo 6: kart uyuşmazlığı ===")
print(f"  PAYABLE_NOW = {r6.payable_now} | atlanan: {[(s.label, s.reason[:60]) for s in r6.skipped]}")
# 1050 − 105 = 945 → kupon 50 (banka yok) → 895 → kargo 49.90 → 944.90
assert r6.payable_now == Decimal("944.90"), r6.payable_now

# ===========================================================================
# Senaryo 7: Döviz — USD fiyatlı ürün, TRY bağlamı
# ===========================================================================
urun_7 = {
    **urun_1,
    "currency": "USD",
    "list_price": "40.00",
    "selling_price": "35.00",
    "cart_discounts": [],
    "coupons": [],
    "bank_campaigns": [],
    "shipping": {"fee": "5.00", "free_over": None},
    "cashback": None,
}
kullanici_7 = {"currency": "TRY", "exchange_rates": {"USD": "34.50"}}
r7 = calc.calculate(urun_7, kullanici_7)
print("=== Senaryo 7: USD -> TRY çevirim ===")
print(f"  PAYABLE_NOW = {r7.payable_now} {r7.currency} | varsayım: {r7.assumptions}")
# (35 + 5) × 34.50 = 1380.00 TRY
assert r7.payable_now == Decimal("1380.00"), r7.payable_now

print()
print("TÜM SENARYO DOĞRULAMALARI GEÇTİ ✓")
