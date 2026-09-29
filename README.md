# Roy Envanter 🚁

Drone tamiri ve al-sat için envanter sistemi. Tam bir drondan tek bir M2 vidaya kadar her şey burada takip edilir.

İki şekilde çalışır:

- **İnternette (Vercel):** Her yerden, telefondan ya da bilgisayardan açılır. Bilgisayarın açık olması gerekmez.
- **Kendi bilgisayarında (`start.bat`):** İnternet gerekmez, sadece aynı Wi-Fi'deki cihazlar erişir.

---

## A) Vercel'e kurulum (önerilen)

Hepsi Vercel panelinden yapılır, yaklaşık 10 dakika sürer. Hepsi ücretsiz planda çalışır.

### 1. Projeyi bağla
1. https://vercel.com/new adresinde GitHub'daki `royenvanter` reposunu seç → **Import**.
2. Framework Preset: **Other** (ayarlar `vercel.json`'dan okunur, başka bir şey değiştirme).
3. **Environment Variables** kısmına şunları ekle:

| Ad | Değer | Ne işe yarar |
|---|---|---|
| `ROY_PIN` | En az 6 haneli bir PIN (ör. doğum tarihi olmasın) | Siteye giriş şifresi. **Zorunlu.** |
| `CRON_SECRET` | Rastgele uzun bir metin (ör. [buradan](https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&format=html) üret) | Gece otomatik yedeği için |

4. **Deploy**'a bas. İlk açılışta "Veritabanı bağlı değil" yazması normal, sıradaki adıma geç.

### 2. Veritabanını ekle (Neon Postgres)
Proje sayfasında **Storage → Create Database → Neon (Serverless Postgres)** → bölge olarak **Frankfurt (eu-central-1)** seç → projeye bağla.
`DATABASE_URL` kendiliğinden eklenir. Tablolar ilk açılışta otomatik oluşur.

### 3. Fotoğraf deposunu ekle (Vercel Blob)
**Storage → Create Database → Blob** → erişimi **Private** seç → projeye bağla.
`BLOB_READ_WRITE_TOKEN` kendiliğinden eklenir.

> Public bir Blob deposu oluşturduysan ortam değişkenlerine `BLOB_ACCESS` = `public` ekle.

### 4. Yeniden dağıt
**Deployments → en üstteki → ⋯ → Redeploy.** Siteyi aç, PIN ile gir. Hazır.

Telefonda siteyi açıp tarayıcı menüsünden **"Ana ekrana ekle"** dersen uygulama gibi çalışır.

### Bilgisayardaki verileri internete taşımak
Eski (yerel) sistemde **Ayarlar → Yedek indir (JSON)**, yeni sitede **Ayarlar → Yedekten geri yükle**.
Fotoğraflar bu yedeğe dahil değildir, onları ürün sayfasından yeniden eklemek gerekir.

---

## B) Kendi bilgisayarında çalıştırma

1. [Node.js](https://nodejs.org) (LTS, 22.13 veya üstü) kurulu olmalı.
2. **`start.bat`** dosyasına çift tıkla. İlk seferde gerekli paketler kurulur (internet gerekir), sonra tarayıcı açılır: http://localhost:3000
3. Siyah pencere açık kaldığı sürece sistem çalışır.

Telefondan erişmek için siyah pencerede ya da **Ayarlar**'da yazan `http://192.168.x.x:3000` adresini kullan. Windows güvenlik duvarı sorarsa **Özel ağlar**'a izin ver.
PIN koymak için `start.bat` içindeki `REM set ROY_PIN=...` satırının başındaki `REM ` kısmını sil.

Veriler `data/` klasöründedir: `envanter.db` (veritabanı), `uploads/` (fotoğraflar), `backups/` (günlük yedekler). Taşımak ya da yedeklemek için klasörü kopyalamak yeterli.

---

## Neler yapabilirsin

| Bölüm | Ne işe yarar |
|---|---|
| **Envanter** | Drone, parça, aksesuar ve sarf malzemesi. Her kayda otomatik kod verilir (DR-0001, PR-0002…). Ad, kod, marka, uyumlu model, konum ya da seri no ile ara. Satırdaki − / + ile adedi anında düzelt. |
| **Hızlı giriş** | **"Kaydet, yenisi"** tür, kategori ve konumu korur. Aynı kutudaki 30 parçayı art arda gir. |
| **Toplu ekleme** | Ayarlar → şablonu indir, Excel'de doldur, CSV olarak yükle. Yüzlerce parça tek seferde. |
| **Stok hareketleri** | *Stok girişi* (ortalama maliyet otomatik), *Sat* (kâr anında), *Çıkış*, *Sayım*. Yanlış girilen hareket ↶ ile geri alınır. |
| **Drone ↔ parça** | Drondan sökülen parçayı o drona bağla, drone sayfasında listelensin. |
| **Tamir** | Müşteri, cihaz, şikâyet, ücret, kapora. Kullanılan parça stoktan düşer. WhatsApp'tan tek tıkla "hazır" mesajı. |
| **Servis fişi** | Dükkân bilgisi, arıza, parçalar, tutar ve imza alanlı yazdırılabilir form. |
| **Etiket + QR** | Kutulara yapıştırılacak etiketler. QR'ı telefon kamerasıyla okutunca ürün sayfası açılır. |
| **Panel** | Stok değeri, bu ayın satış ve tamir kazancı, son 6 ayın kâr grafiği, azalan stoklar, aktif tamirler. |
| **Yedek** | Her gün otomatik yedek (son 30 gün). JSON / Excel olarak indirilebilir. |

## Teknik

```
lib/app.js      iş mantığı + API (yerel ve Vercel ortak)
lib/db.js       SQLite (yerel) / Neon Postgres (DATABASE_URL varsa)
lib/storage.js  disk (yerel) / Vercel Blob (BLOB_READ_WRITE_TOKEN varsa)
server.js       yerel sunucu
api/index.js    Vercel fonksiyonu
public/         arayüz (framework'süz tek sayfa uygulama)
```

Ortam değişkenleri: `ROY_PIN`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `BLOB_ACCESS`, `CRON_SECRET`,
`SESSION_SECRET` (isteğe bağlı; değiştirilirse tüm oturumlar kapanır), `APP_TZ` (varsayılan `Europe/Istanbul`), `PORT`, `ROY_DATA`.

Güvenlik: PIN girişi 8 hatalı denemeden sonra 15 dakika kilitlenir. Oturum çerezi HttpOnly + SameSite. Fotoğraflar ve yedekler gizli depoda tutulur, yalnızca giriş yapmış kullanıcıya sunulur.
