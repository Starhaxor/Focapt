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
Copy-Item apps/api/.env.example apps/api/.env
```

`apps/api/.env` içindeki `HF_TOKEN` alanına Hugging Face access token yazın.

Çeviri API'sini başlatın:

```powershell
npm -w @focapt/api run dev
```

Eklentiyi derleyin:

```powershell
npm -w @focapt/extension run build
```

Chrome'da `chrome://extensions` sayfasını açın, **Geliştirici modu**nu etkinleştirin, **Paketlenmemiş öğe yükle** seçeneğiyle `apps/extension/.output/chrome-mv3` klasörünü seçin.

YouTube videosunu açın ve Focapt popup'ından dilleri, konum modunu ve görünümü ayarlayın. Video için mevcut YouTube altyazısı bulunmalıdır.

## Geliştirme doğrulaması

```powershell
npm test
npm run typecheck
npm run build
```

Udemy, Netflix ve ses üzerinden AI altyazı üretimi sonraki aşamadadır.
