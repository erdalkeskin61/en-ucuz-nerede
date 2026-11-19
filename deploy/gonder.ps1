# =============================================================================
#  Baskı Hesap — tek komutla dağıtım (Windows PowerShell)
# =============================================================================
#  Ne yapar:
#    1) Yeni dağıtım paketini üretir (scripts/deploy-paket.mjs)
#    2) Paketi ve güncelleme betiğini sunucuya kopyalar (scp)
#    3) Sunucuda betiği çalıştırır (ssh) → yedek + kod + npm + restart + sağlık
#
#  Kullanım:
#    .\deploy\gonder.ps1                       # varsayılan: root@158.158.38.174
#    .\deploy\gonder.ps1 -Kullanici ubuntu
#    .\deploy\gonder.ps1 -Kullanici root -Sunucu 158.158.38.174
#    .\deploy\gonder.ps1 -SadecePaket          # yalnızca paket üret
#
#  Şifre sorulursa SSH'nin kendi istemi çıkar (şifre hiçbir yere yazılmaz).
# =============================================================================
param(
  [string]$Kullanici = "root",
  [string]$Sunucu    = "158.158.38.174",
  [switch]$SadecePaket
)

$ErrorActionPreference = "Stop"
$Kok = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Kok

Write-Host "`n=== 1/3 · Paket üretiliyor ===" -ForegroundColor Cyan
$cikti = node scripts/deploy-paket.mjs
$cikti | Write-Output
$paket = Get-ChildItem deploy -Filter "en-ucuz-nerede-*.tar.gz" |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $paket) { throw "Paket bulunamadı." }
Write-Host ("Paket: {0} ({1:N2} MB)" -f $paket.Name, ($paket.Length / 1MB)) -ForegroundColor Green

if ($SadecePaket) {
  Write-Host "`n-SadecePaket: gönderim atlandı." -ForegroundColor Yellow
  exit 0
}

$hedef = "$Kullanici@$Sunucu"
Write-Host "`n=== 2/3 · Sunucuya kopyalanıyor ($hedef) ===" -ForegroundColor Cyan
scp $paket.FullName "${hedef}:/tmp/"
if ($LASTEXITCODE -ne 0) { throw "scp başarısız (paket)." }

scp "deploy/sunucu-guncelle.sh" "${hedef}:/tmp/"
if ($LASTEXITCODE -ne 0) { throw "scp başarısız (betik)." }

Write-Host "`n=== 3/3 · Sunucuda güncelleme ===" -ForegroundColor Cyan
$uzakPaket = "/tmp/$($paket.Name)"
ssh $hedef "bash /tmp/sunucu-guncelle.sh $uzakPaket"
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nGüncelleme başarısız. Sunucu günlüklerini kontrol edin." -ForegroundColor Red
  exit 1
}

Write-Host "`n=== Doğrulama: canlı site ===" -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest -Uri "https://baskihesap.tech/" -UseBasicParsing -TimeoutSec 25
  $baslik = [regex]::Match($r.Content, '<title>(.*?)</title>').Groups[1].Value
  $logo = $null
  try { $logo = (Invoke-WebRequest -Uri "https://baskihesap.tech/logo.png" -UseBasicParsing -TimeoutSec 15).StatusCode } catch { $logo = "404" }
  Write-Host ("Başlık : {0}" -f $baslik)
  Write-Host ("/logo.png: {0}" -f $logo)
  if ($baslik -match "Baskı Hesap" -and "$logo" -eq "200") {
    Write-Host "`n✅ Yayın tamam: Baskı Hesap canlıda." -ForegroundColor Green
  } else {
    Write-Host "`n⚠️ Site yanıtladı ama yeni sürüm görünmüyor. Önbellek/CDN veya süreç kontrolü gerekli." -ForegroundColor Yellow
  }
} catch {
  Write-Host "Canlı doğrulama yapılamadı: $($_.Exception.Message)" -ForegroundColor Yellow
}
