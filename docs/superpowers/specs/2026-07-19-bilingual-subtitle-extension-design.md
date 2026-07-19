# Çift Dilli Odaklı Altyazı Eklentisi — Tasarım

## 1. Amaç

YouTube, Udemy ve Netflix videolarında iki dili aynı anda gösteren bir tarayıcı eklentisi geliştirilecektir. Ürün, kullanıcının altyazıyı okumak için videonun altına sürekli bakması yerine altyazıyı videonun istediği bölgesinde veya fare imlecinin yakınında takip edebilmesini sağlayacaktır.

Platform geliştirme sırası:

1. YouTube
2. Udemy
3. Netflix

İlk uygulama planı YouTube sürümünü kapsayacak; ortak altyazı motoru sonraki platform adaptörlerinde yeniden kullanılacaktır.

## 2. Ürün Kapsamı

### 2.1 Çift dilli altyazı

- İki dil aynı anda alt alta gösterilir.
- Üst satır özgün veya öğrenilen dili, alt satır kullanıcının ana dilindeki çeviriyi gösterir.
- Kullanıcı öğrenilen dili ve ana dilini seçebilir.
- Eklenti önce platformun mevcut altyazısını kullanır.
- Platform altyazısı yoksa ses, yapay zekâ aracılığıyla zaman kodlu metne dönüştürülür.
- İkinci dil mevcut değilse altyazı metni seçilen dile çevrilir.

### 2.2 Konum modları

Eklenti üç ayrı konum modu sunar:

1. **Sabit:** Kullanıcı altyazı kutusunu video üzerinde sürükleyip istediği noktaya bırakır. Konum kaydedilir.
2. **Hareketli:** Altyazı kutusu fare imlecini yumuşak biçimde takip eder ve imlecin altında görünür.
3. **Gecikmeli:** İmleç hareket ederken altyazı kutusu gizlenir. İmleç durduktan sonra kısa bir gecikmeyle imlecin altında görünür.

Gecikmeli modun ilk varsayılan süresi 600 milisaniyedir ve kullanıcı tarafından ayarlanabilir. Her üç modda da altyazı kutusu video sınırları içinde tutulur.

### 2.3 Görünüm özelleştirmesi

Kullanıcı iki altyazı satırını ayrı ayrı özelleştirebilir:

- Yazı rengi
- Yazı boyutu
- Yazı kalınlığı

Altyazı kutusuna ait ortak ayarlar:

- Arka plan rengi
- Arka plan saydamlığı
- İç boşluk
- Köşe yuvarlaklığı
- İki dil arasındaki satır boşluğu
- Hareketli ve gecikmeli modlarda imleçten uzaklık

Kullanıcı tüm görünüm ayarlarını varsayılan değerlere döndürebilir. Tercihler bütün platformlarda ortak kullanılabilir veya siteye özel kaydedilebilir.

### 2.4 Arayüz dili

- Eklenti arayüzü sabit Türkçe veya İngilizce metinlerden oluşmaz.
- İlk açılışta tarayıcının kullanıcı arayüzü dili otomatik olarak kullanılır.
- Kullanıcı arayüz dilini ayarlardan “Otomatik”, Türkçe veya İngilizce olarak değiştirebilir.
- Popup, durum mesajları, hata metinleri, düğmeler ve erişilebilirlik etiketleri locale anahtarlarından üretilir; kullanıcıya görünen metinler kaynak kod içinde doğrudan yazılmaz.
- İlk sürüm Türkçe ve İngilizce locale paketlerini içerir. Desteklenmeyen tarayıcı dillerinde İngilizce locale paketi kullanılır.

## 3. Mimari

### 3.1 Genel yaklaşım

Ürün, ortak bir altyazı motoru ve platforma özel adaptörlerden oluşur. Kullanıcı arayüzü, altyazı senkronizasyonu, çeviri, yapay zekâya geçiş ve konum davranışları ortak kodda tutulur. YouTube, Udemy ve Netflix adaptörleri yalnızca kendi video oynatıcılarıyla bağlantı kurar.

### 3.2 Bileşenler

#### Tarayıcı eklentisi çekirdeği

- Eklentiyi etkinleştirir veya devre dışı bırakır.
- Kullanıcı ayarlarını tarayıcı depolamasında saklar.
- Platform adaptörünü seçer.
- Ortak servislerle içerik betiği arasındaki mesajlaşmayı yönetir.

#### Platform adaptörleri

Her adaptör aşağıdaki ortak arayüzü uygular:

- Aktif video öğesini bulma
- Oynatma zamanını, hızını ve durumunu okuma
- Mevcut altyazı parçalarını sağlama
- Sayfa veya video değişikliklerini bildirme
- Normal, sinema ve tam ekran görünümleri için altyazı katmanının bağlanacağı alanı sağlama

YouTube ilk adaptördür. Udemy ve Netflix daha sonra aynı arayüz üzerinden eklenir.

#### Altyazı edinme katmanı

- İlk tercih olarak platform altyazısını kullanır.
- Altyazı bulunamazsa yapay zekâ ile konuşmayı metne dönüştürme akışını başlatır.
- Metin, başlangıç ve bitiş zamanlarını ortak altyazı parçası biçimine dönüştürür.
- Aynı video ve dil seçimi için sonuçların yeniden kullanılabilmesini sağlar.

#### Çeviri katmanı

- Kaynak metni seçilen ana dile çevirir.
- Kaynak ve çeviri parçalarını aynı zaman aralığında eşler.
- Çeviri geciktiğinde eski veya yanlış parçanın ekranda tutulmasını engeller.

#### Senkronizasyon motoru

- Video zamanı değiştikçe etkin altyazı parçasını seçer.
- Oynatma hızı, duraklatma ve ileri/geri sarma olaylarını işler.
- Kaynak ve çevrilmiş metni görüntüleme katmanına tek bir görünüm modeli olarak iletir.

#### Altyazı görüntüleme katmanı

- Çift altyazıyı alt alta çizer.
- Sabit, hareketli ve gecikmeli konum modlarını uygular.
- Kutuyu video sınırları içinde tutar.
- Video kontrollerini mümkün olduğunca kapatmayacak bir konum seçer.
- Tam ekran ve oynatıcı boyutu değişikliklerine uyum sağlar.

#### Ayarlar paneli

- Dil seçimlerini yönetir.
- Konum modunu değiştirir.
- İki dilin görünüm ayarlarını ayrı ayrı düzenler.
- Ortak kutu stilini ve imleç mesafesini düzenler.
- Siteye özel veya ortak tercih kullanımını seçtirir.
- Varsayılan ayarlara dönüş sağlar.
- Arayüz dilini otomatik, Türkçe veya İngilizce olarak seçtirir.

#### Yapay zekâ servisi

- Ses parçalarını zaman kodlu metne dönüştürür.
- Hazır olan kısa parçaları akış hâlinde eklentiye döndürür.
- Uzun videonun tamamen işlenmesini beklemeden altyazı gösterimini başlatır.
- Çeviri servisiyle bağımsız değiştirilebilir bir sınır üzerinden haberleşir.

## 4. Veri Akışı

1. Eklenti desteklenen bir video sayfasını algılar ve ilgili platform adaptörünü başlatır.
2. Adaptör aktif videoyu ve mevcut altyazı seçeneklerini bulur.
3. Uygun platform altyazısı varsa ortak altyazı biçimine dönüştürülür.
4. Uygun altyazı yoksa kullanıcıya yapay zekâ üretiminin başladığı bildirilir ve ses kısa parçalar hâlinde işlenir.
5. Kaynak altyazı seçilen ana dile çevrilir.
6. Senkronizasyon motoru video zamanına karşılık gelen kaynak ve çeviri parçalarını seçer.
7. Görüntüleme katmanı metinleri kullanıcının stil ve konum ayarlarıyla gösterir.
8. Aynı video ve dil çifti için kullanılabilir sonuçlar önbelleğe alınır.

## 5. Kullanıcı Durumları

- **Hazır:** Platform altyazısı bulundu ve görüntüleniyor.
- **Oluşturuluyor:** Platform altyazısı bulunmadı; yapay zekâ altyazısı hazırlanıyor.
- **Çevriliyor:** Kaynak metin hazır, ikinci dil bekleniyor.
- **Çevrimdışı:** Yeni işlem yapılamıyor; varsa önbellekteki altyazı kullanılıyor.
- **Desteklenmiyor:** Platform oynatıcısındaki değişiklik nedeniyle adaptör aktif videoya bağlanamıyor.
- **Geçici hata:** Yapay zekâ veya çeviri servisine kısa ve sınırlı tekrar denemeleri yapılıyor.

Normal video oynatma hiçbir eklenti hatası nedeniyle engellenmez.

## 6. Hata Yönetimi

- Platform sayfa yapısı değişirse eklenti güvenli biçimde devre dışı kalır ve anlaşılır uyarı gösterir.
- Yapay zekâ veya çeviri servisi geçici olarak kesilirse sınırlı tekrar denemesi yapılır.
- Çeviri alınamazsa mevcut kaynak altyazı gösterilmeye devam eder.
- Her iki metin de hazır değilse önceki zaman aralığına ait yanlış altyazı tutulmaz; kısa bir yükleniyor durumu gösterilir.
- Ağ yoksa önbellekteki sonuçlar kullanılabilir; yeni yapay zekâ ve çeviri işleri bekletilir.
- Uzun metinler video alanına göre satırlara bölünür ve taşma engellenir.
- Video veya sayfa değiştiğinde önceki videoya ait dinleyiciler ve altyazı katmanları temizlenir.

## 7. Ayarların Saklanması

Tarayıcı depolamasında aşağıdaki bilgiler tutulur:

- Öğrenilen dil ve ana dil
- Aktif konum modu
- Sabit mod konumu
- Gecikmeli mod süresi
- İmleçten uzaklık
- Her dil için renk, boyut ve kalınlık
- Kutu arka planı, saydamlığı, iç boşluğu ve köşe yuvarlaklığı
- Satır boşluğu
- Ortak veya siteye özel tercih seçimi
- Arayüz dili seçimi (`auto`, `tr` veya `en`)

Video veya kullanıcı ses içeriği tarayıcı ayar depolamasına yazılmaz.

## 8. Gizlilik ve Güvenlik İlkeleri

- Platform altyazısı mevcutsa ses yapay zekâ servisine gönderilmez.
- Yapay zekâ yalnızca altyazı üretiminin gerekli olduğu durumda devreye girer.
- Ses işleme başlamadan önce kullanıcı bu durum hakkında bilgilendirilir.
- Servise gönderilen veri yalnızca gerekli video/ses parçaları ve işlem bağlamıyla sınırlandırılır.
- Kimlik bilgileri ve servis anahtarları içerik betiğine gömülmez.
- Önbellek anahtarları kullanıcılar arasında içerik veya kimlik sızıntısına yol açmayacak şekilde tasarlanır.

## 9. Test Stratejisi

### 9.1 Ortak motor testleri

- Kaynak ve çeviri parçalarının zaman eşlemesi
- Duraklatma, devam, ileri/geri sarma ve oynatma hızı değişiklikleri
- Altyazı parçası bulunmayan zaman aralıkları
- Platform altyazısından yapay zekâ akışına geçiş
- Önbellek okuma ve yazma davranışları
- Servis hatası ve tekrar deneme sınırları

### 9.2 Görüntüleme testleri

- Sabit modda sürükleme, sınırlar ve konum kalıcılığı
- Hareketli modda imleç takibi ve video sınırları
- Gecikmeli modda hareket sırasında gizlenme ve durunca görünme
- İki dil için bağımsız renk, boyut ve kalınlık
- Tarayıcı arayüz dilinin otomatik seçimi ve manuel arayüz dili seçimi
- Kullanıcıya görünen metinlerin eksiksiz locale anahtarı kullanması
- Kutu arka planı, saydamlık ve diğer stil ayarları
- Uzun altyazıların satır kırılımı
- Normal, sinema ve tam ekran görünümü
- Video kontrolleriyle çakışmayı azaltan yerleşim

### 9.3 YouTube entegrasyon testleri

- Altyazılı ve altyazısız videolar
- Video değişimi ve tek sayfa uygulaması gezinmesi
- Tam ekran ve sinema modu
- Oynatma hızı değişimi
- Duraklatma ve ileri/geri sarma
- Kullanıcı tarafından altyazı dilinin değiştirilmesi

### 9.4 Sonraki platformlar

Udemy ve Netflix adaptörleri ortak motor test paketini yeniden kullanır. Her adaptör için video bulma, platform altyazısını okuma, oynatıcı modu değişiklikleri ve sayfa yaşam döngüsü testleri ayrıca eklenir.

## 10. Başarı Ölçütleri

YouTube ilk sürümü aşağıdaki koşullarda başarılı kabul edilir:

- Desteklenen bir YouTube videosunda eklenti etkinleştirilebilir ve kapatılabilir.
- İki dil aynı anda doğru zaman aralığında alt alta gösterilir.
- Platform altyazısı varsa yapay zekâya gerek kalmadan kullanılır.
- Platform altyazısı yoksa yapay zekâ üretimi kullanıcıya görünür bir durumla başlar.
- Sabit, hareketli ve gecikmeli modların tamamı çalışır.
- Kullanıcı iki dilin rengini, boyutunu ve kalınlığını ayrı ayrı değiştirebilir.
- Eklenti arayüzü varsayılan olarak tarayıcının arayüz dilini kullanır ve kullanıcı tarafından değiştirilebilir.
- Kutunun konumu ve ortak görünüm ayarları değiştirilebilir ve korunur.
- Tam ekran, sinema modu, ileri/geri sarma ve oynatma hızı değişikliklerinde senkronizasyon korunur.
- Eklenti hatası YouTube video oynatımını bozmaz.

## 11. Kapsam Dışı

İlk YouTube sürümünde aşağıdakiler kapsam dışıdır:

- Kelime sözlüğü, kelime kaydetme veya tekrar kartları
- Dil bilgisi açıklamaları
- Kullanıcı topluluğu ve altyazı paylaşımı
- Mobil YouTube uygulaması entegrasyonu
- Udemy ve Netflix üretim adaptörleri
- Gelişmiş hesap ve ödeme sistemi

Bu maddeler ortak altyazı deneyimi doğrulandıktan sonra ayrı tasarım çalışmaları olarak ele alınabilir.

