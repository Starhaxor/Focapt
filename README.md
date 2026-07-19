# Focapt

YouTube için çift dilli, özelleştirilebilir altyazı eklentisi.

## YouTube MVP

- Kaynak altyazı üstte, çeviri altta gösterilir.
- Sabit, fareyi izleyen ve fare durunca gecikmeli görünen üç konum modu vardır.
- İki satırın renk, boyut ve kalınlığı ayrı ayrı değiştirilebilir.
- Kutu rengi, saydamlığı, boşlukları ve sabit konumu ayarlanabilir.
- Arayüz ilk açılışta tarayıcı dilini kullanır; Türkçe ve İngilizce elle seçilebilir.

## Kurulum

```powershell
npm install
npm -w @focapt/extension run build
```

Chrome'da `chrome://extensions` sayfasını açın, **Geliştirici modu**nu etkinleştirin, **Paketlenmemiş öğe yükle** seçeneğiyle `apps/extension/.output/chrome-mv3` klasörünü seçin.

YouTube videosunu açın ve Focapt popup'ından dilleri, konum modunu ve görünümü ayarlayın. Video için mevcut YouTube altyazısı bulunmalıdır. İkinci satır YouTube'un kendi `tlang` çeviri altyazısından üretilir; token veya ayrı sunucu gerekmez.

## Geliştirme doğrulaması

```powershell
npm test
npm run typecheck
npm run build
```

Udemy, Netflix ve ses üzerinden AI altyazı üretimi sonraki aşamadadır.
