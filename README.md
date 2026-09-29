# Roy Envanter 🚁

Drone tamiri ve al-sat için envanter sistemi. Tam bir drondan tek bir M2 vidaya kadar her şey burada takip edilir.

## Çalıştırma

1. Bilgisayarda [Node.js](https://nodejs.org) (LTS, 22.13 veya üstü) kurulu olmalı.
2. **`start.bat`** dosyasına çift tıkla. Tarayıcı kendiliğinden açılır: http://localhost:3000
3. Siyah pencere açık kaldığı sürece sistem çalışır. Kapatırsan site de kapanır.

Başka kurulum gerekmez (`npm install` yok, internet gerekmez).

### Telefondan kullanma

Telefon bilgisayarla aynı Wi-Fi'deyse siyah pencerede yazan `http://192.168.x.x:3000` adresini telefonun tarayıcısına yaz.
Adresi **Ayarlar** sayfasında da görebilirsin. Tarayıcı menüsünden "Ana ekrana ekle" dersen uygulama gibi açılır.

> Windows ilk açılışta güvenlik duvarı izni sorarsa **Özel ağlar** için izin ver.

### PIN koymak (isteğe bağlı)

`start.bat` dosyasını Not Defteri ile aç, `REM set ROY_PIN=1234` satırındaki `REM ` kısmını sil ve 1234'ü kendi PIN'inle değiştir.

## Neler yapabilirsin

| Bölüm | Ne işe yarar |
|---|---|
| **Envanter** | Drone, parça, aksesuar ve sarf malzemesi. Her kaydın otomatik bir kodu olur (DR-0001, PR-0002…). Ad, kod, marka, uyumlu model, konum ya da seri no ile ara. Satırdaki − / + ile adedi anında düzelt. |
| **Hızlı giriş** | Yeni ürün formundaki **"Kaydet, yenisi"** butonu tür, kategori ve konumu korur. Aynı kutudaki 30 parçayı art arda hızlıca girebilirsin. |
| **Stok hareketleri** | Ürün sayfasında: *Stok girişi* (alış fiyatı girersen ortalama maliyet güncellenir), *Sat* (kâr anında hesaplanır), *Çıkış* (bozuldu, kayıp…), *Sayım*. |
| **Drone ↔ parça** | Bir drondan parça söktüğünde parçayı o drona bağla. Drone sayfasında hangi parçaların nereye gittiği görünür. |
| **Tamir** | Müşteri, cihaz, şikâyet, ücret ve kapora bilgilerini tutar. "Stoktan parça ekle" ile kullanılan parça stoktan düşer, kaldırılırsa geri eklenir. Tamir bitince WhatsApp'tan tek tıkla müşteriye haber verebilirsin. |
| **Panel** | Stok değeri, bu ayın satış ve tamir kazancı, azalan stoklar (ürüne "min. stok" girersen), aktif tamirler. |
| **Etiket** | Kod ve konumu yazan 62×29 mm etiketler. Kutulara yapıştırmak için. |
| **Yedek** | Her gün otomatik yedek alınır (son 30 gün, `data/backups`). Ayarlar'dan JSON yedeği ya da Excel için CSV indirebilirsin. |

## Veriler nerede?

Her şey `data/` klasöründe:

- `envanter.db`: veritabanı
- `uploads/`: ürün fotoğrafları
- `backups/`: günlük otomatik yedekler

**Başka bir bilgisayara taşımak ya da yedeklemek için tüm klasörü kopyalaman yeterli.**
Ara ara `data` klasörünü bir flash belleğe ya da Google Drive'a kopyalamak iyi bir alışkanlık.

## Teknik

- Sunucu: `server.js`, Node.js'in yerleşik `http` ve `node:sqlite` modülleri. Hiçbir harici paket yok.
- Arayüz: `public/`, framework'süz tek sayfa uygulama (vanilla JS + CSS). Koyu ve açık tema var.
- Ortam değişkenleri: `PORT` (varsayılan 3000), `ROY_PIN`, `ROY_DATA` (veri klasörü yolu).
