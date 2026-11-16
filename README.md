# Hayalet EXIF Viewer

**Fotoğrafının içinde ne var? Tarayıcında gör, hiçbir yere yükleme.**
*What's inside your photo? See it in your browser, upload it nowhere.*

Bir fotoğrafın içine gizlenmiş konumu (GPS), telefon modelini, seri numarasını ve çekim saatini gösteren küçük, açık kaynak bir web aracı. [Hayalet](https://huseyinacikgoz.com.tr/hayalet/) uygulamasının bir parçası.

## Neden güvenebilirsin? / Why you can trust it

- **Dosya hiçbir yere gitmez.** Fotoğraf yalnızca tarayıcının belleğinde okunur. Sunucu yok, yükleme yok.
- **Tarayıcı bunu zorlar.** `index.html` içindeki Content-Security-Policy `connect-src 'none'` der: sayfa istese bile hiçbir ağ isteği yapamaz. Dış kütüphane, yazı tipi, analiz ya da çerez yoktur.
- **Kod küçük ve okunabilir.** Bütün okuma işi tek dosyada: [`exif.js`](exif.js), bağımlılık yok.
- **Dosyadan gelen hiçbir şey HTML olarak işlenmez**; kötü niyetli bir fotoğraf sayfaya kod sokamaz.

## Ne gösterir? / What it shows

- Konum (EXIF ve XMP GPS)
- Cihaz: marka, model, yazılım, lens, seri numarası, sahip adı
- Çekim zamanı ve saat dilimi
- Gömülü küçük önizleme, XMP, IPTC, yorumlar
- Tüm EXIF etiketlerinin tam listesi

Desteklenen biçimler: **JPEG, PNG, WebP**. HEIC/AVIF tanınır ama henüz okunmaz.

> **Android notu:** Android, "fotoğraf konumu" izni olmayan uygulamalardan (tarayıcılar dahil) konumu gizler. Telefonda konum görünmüyorsa dosyada yine de olabilir; bilgisayardan kontrol et.

## Kullanım / Usage

Barındırılan sürüm: https://huseyinacikgoz.com.tr/hayalet/exif/

Yerelde çalıştırmak için (ES modülleri `file://` üzerinden yüklenmez):

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Test

```bash
npm test   # node test/exif.test.mjs, bağımlılık yok
```

Test dosyaları (`test/fixtures`) tamamen yapay; gerçek kişi ya da konum içermez.

## Lisans / License

MIT © 2026 Hüseyin Açıkgöz. Simgeler [Ionicons](https://ionic.io/ionicons) (MIT).
