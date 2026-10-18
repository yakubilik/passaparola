# The 136 "contains" questions replaced by "starts" questions

Every answer must start with its letter, so each of the 136 questions of type
`contains` was replaced by a new `starts` question with the same id, letter,
category and level. Their old clips (`<id>.mp3`, `<id>-cevap.mp3`) were deleted;
the phone voice reads them until Yakup records the 272 lines again
(`ses-ornekleri/yeniden-seslendirilecek.csv`, written by `tools/gen-voice-lines.py`).

"How checked" names the source of each fact: a reference (TDK dictionary, TDV
İslâm Ansiklopedisi, the official body), the standard school curriculum, or
"Web check" where it was looked up online while writing.

| id | old answer | new answer | new clue | how checked |
|---|---|---|---|---|
| tarih-1-I-2 | Yıldırım | Isparta | Antik Yunan'da Atina'nın rakibi olan, çocuklarını küçük yaştan savaşçı olarak yetiştiren şehir devleti. | Ancient Sparta is 'Isparta' in Turkish school history books; Athens–Sparta rivalry is standard 9th-grade history. |
| tarih-1-I-3 | Kızılay | Irkçılık | Martin Luther King ile Nelson Mandela'nın karşı mücadele ettiği, insanları ten rengine göre ayıran ayrımcılık. | Common knowledge: King (US civil rights) and Mandela (apartheid) fought racial discrimination. |
| tarih-1-I-4 | Mısır | Irmak | Mezopotamya'daki ilk uygarlıkların kıyısında kurulduğu Dicle ile Fırat'ın her biri. | Common knowledge: Tigris and Euphrates are rivers; Mesopotamia means 'land between rivers'. |
| tarih-1-J-4 | Anadolu Ajansı | Jandarma | Kuruluşu 1839'a dayanan, kırsal bölgelerde asayişi sağlayan kolluk gücü. | Jandarma Genel Komutanlığı gives 14 June 1839 as its founding date; rural policing is its legal duty. |
| tarih-1-Ö-1 | Söğüt | Öğretmenler Günü | Her yıl 24 Kasım'da kutlanan, eğitimcilere adanmış gün. | Teachers' Day is 24 November in Turkey (anniversary of Atatürk accepting the title Başöğretmen, 1928). |
| tarih-1-Ö-2 | Göbeklitepe | Özgürlük Heykeli | 1886'da Fransa'nın ABD'ye armağan ettiği, New York limanındaki elinde meşale tutan heykel. | Statue of Liberty: gift of France, dedicated 28 October 1886 in New York Harbor. |
| tarih-1-Ö-3 | Kavimler Göçü | Özgürlük | 1789 Fransız İhtilali'nin eşitlik ve kardeşlikle birlikte yaydığı üç ilkeden biri. | Motto of the French Revolution: Liberté, égalité, fraternité. |
| tarih-1-Ö-4 | Şövalye | Ölüler Kitabı | Eski Mısır'da ölünün öteki dünyadaki yolculuğu için mezara konan dua ve büyü metinleri. | Egyptian Book of the Dead: funerary spells placed in tombs; standard ancient-history fact. |
| tarih-1-Ü-1 | Süleymaniye | Üniversite | Osmanlı'da Darülfünun adıyla anılan, bugün fakültelerden oluşan yükseköğretim kurumu. | Darülfünun was the Ottoman name of the university (later İstanbul Üniversitesi, 1933). |
| tarih-1-Ü-2 | Sütçü İmam | Ülkü | Atatürk'ün manevi kızlarının en küçüğü; adı ideal anlamına gelir. | Ülkü Adatepe (1932–2012) was Atatürk's youngest adopted daughter; 'ülkü' means ideal (TDK). |
| tarih-1-Ü-3 | Birinci Dünya Savaşı | Üzengi | Atlı Türk göçebelerinin ok atarken ayaklarını dayadığı, eyerin iki yanından sarkan halka. | Stirrup (üzengi): defined in TDK; mounted archery of steppe nomads is standard history. |
| tarih-1-Ü-4 | Büyük Taarruz | Üsküdar | Kız Kulesi'nin hemen karşısındaki kıyıda kurulu, İstanbul'un Anadolu yakasındaki tarihî ilçe. | Kız Kulesi stands off the Üsküdar shore (Salacak); common knowledge. |
| tarih-2-I-1 | Kırım | Irak Cephesi | Birinci Dünya Savaşı'nda 1916'da Kut'ül Amare zaferinin kazanıldığı cephe. | Siege of Kut ended 29 April 1916 with British surrender, on the Mesopotamian (Irak) front. |
| tarih-2-I-2 | Sarıkamış | Ilgaz / Ilgaz Dağı | Kurtuluş Savaşı'nda İnebolu'dan Ankara'ya cephane taşınan İstiklal Yolu'nun aştığı, Kastamonu ile Çankırı arasındaki dağ. | İstiklal Yolu: İnebolu–Küre–Kastamonu–Ilgaz–Çankırı–Ankara; Ilgaz Mountains lie between Kastamonu and Çankırı. |
| tarih-2-I-3 | Kıbrıs | Islahhane | Mithat Paşa'nın açtığı, kimsesiz çocuklara meslek öğreten Osmanlı okulu. | Midhat Paşa founded ıslahhaneler (vocational schools for orphans), first in Niş in the 1860s. |
| tarih-2-Ö-3 | Köprülü | Özbekistan | Timur'un türbesinin bulunduğu Semerkant'ın bugün yer aldığı ülke. | Gur-i Emir, Timur's mausoleum, is in Samarkand, Uzbekistan. |
| tarih-2-Ö-4 | Köroğlu | Ölçüler Kanunu | 1931'de metre, kilogram ve litreyi resmî birim yapan Cumhuriyet dönemi yasası. | Law no. 1782, Ölçüler Kanunu, 26 March 1931, adopted the metric system. |
| tarih-2-Ü-1 | Küçük Kaynarca | Üçlü İttifak | Birinci Dünya Savaşı öncesinde Almanya, Avusturya-Macaristan ve İtalya'nın kurduğu blok. | Triple Alliance of 1882: Germany, Austria-Hungary, Italy. |
| tarih-2-Ü-2 | Hürrem Sultan | Ümit Burnu | 1488'de Bartolomeu Dias'ın dolaştığı, Hindistan deniz yolunu açan Afrika'nın güneyindeki burun. | Bartolomeu Dias rounded the Cape of Good Hope in 1488. |
| tarih-2-Ü-4 | Süveyş Kanalı | Üsküp | Osmanlı'nın 1392'de aldığı, bugün Kuzey Makedonya'nın başkenti olan şehir. | Skopje fell to the Ottomans in 1392; capital of North Macedonia. |
| tarih-3-I-1 | Akıncı | Iğdır | Moskova ve Kars antlaşmalarıyla Türkiye'de kalan, 1992'de il olan, Nahçıvan'a sınırı bulunan yer. | Iğdır stayed in Turkey under the treaties of Moscow and Kars (1921), became a province in 1992, borders Nakhchivan. |
| tarih-3-I-2 | Kanun-ı Esasi | Ihlamur Kasrı | Sultan Abdülmecid'in Beşiktaş'ta yaptırdığı, adını bir ağaçtan alan köşk. | Ihlamur Kasrı, Beşiktaş, built for Abdülmecid (1849–1855); named after linden (ıhlamur) trees. |
| tarih-3-I-3 | Tımar | Irgandı Köprüsü / Irgandı | Bursa'da Gökdere üzerinde, üstünde dükkânlar bulunan 15. yüzyıl Osmanlı köprüsü. | Irgandı Köprüsü, Bursa, 1442, over Gökdere, a bridge lined with shops. |
| tarih-3-I-4 | Kadızadeliler | Ihlara Vadisi / Ihlara | Bizans döneminde keşişlerin kayalara oyduğu kiliseleriyle bilinen, Aksaray'daki vadi. | Ihlara Valley, Aksaray, known for Byzantine rock-cut churches. |
| tarih-3-J-3 | Lejyon | Jurnal / Jurnaller | II. Abdülhamit döneminde hafiyelerin padişaha sunduğu ihbar raporları. | 'Jurnal' (TDK): informer's report; the Abdülhamid II informer system is standard Ottoman history. |
| tarih-3-J-4 | Kanije | Jamestown | 1607'de kurulan, İngilizlerin Kuzey Amerika'daki ilk kalıcı yerleşimi. | Jamestown, Virginia, founded 1607, first permanent English settlement in North America. |
| tarih-3-Ö-3 | Kösem Sultan | Ömer Muhtar | 1931'de İtalyanlarca idam edilen, Çöl Aslanı diye anılan Libyalı direniş önderi. | Omar al-Mukhtar, 'Lion of the Desert', hanged by Italy on 16 September 1931. |
| tarih-3-Ö-4 | Köse Mihal | Örfi İdare | Osmanlı'da ve Cumhuriyet'in ilk yıllarında sıkıyönetimin eski adı. | TDK: örfî idare = sıkıyönetim; term used in the late Ottoman and early Republic periods. |
| tarih-3-Ü-1 | Kül Tigin | Üç Şerefeli Cami / Üç Şerefeli | II. Murat'ın 1438-1447 yılları arasında Edirne'de yaptırdığı, adını minaresinin balkon sayısından alan cami. | Üç Şerefeli Mosque, Edirne, built 1438–1447 under Murad II; named after the three balconies of its minaret. |
| tarih-3-Ü-2 | Gümrü | Ümera | Osmanlı'da beylerbeyi ve sancakbeyi gibi yüksek askerî yöneticilerin topluca adı. | TDK: ümera, plural of emir; Ottoman term for beylerbeyi and sancakbeyi. |
| tarih-3-Ü-3 | Hünkâr İskelesi | Ülgen | Altay Türklerinin inancında iyiliği temsil eden, Erlik'in karşıtı olan gök tanrısı. | Altai Turkic belief: Ülgen, sky god of good, opposed to Erlik of the underworld. |
| tarih-3-Ü-4 | Süleyman Şah | Üniversite Reformu | 1933'te Darülfünun'u kapatıp yerine yeni bir yükseköğretim kurumu açan düzenleme. | Law no. 2252 of 31 May 1933 closed the Darülfünun; İstanbul Üniversitesi opened 1 August 1933. |
| cografya-1-C-2 | Kocaeli | Cetvel | Haritada iki nokta arasındaki uzaklığı ölçmek için kullanılan düz araç. | Common knowledge (primary-school map reading). |
| cografya-1-C-3 | Erciyes | Cadde | Şehirde iki yanı binalarla çevrili, ana yollardan biri olan geniş yol. | TDK definition of cadde. |
| cografya-1-C-4 | Macaristan | Coğrafya | Yeryüzünü, iklimleri ve insanların çevreyle ilişkisini inceleyen bilim. | TDK definition of coğrafya. |
| cografya-1-J-3 | Plaj | Jeolog | Kayaları ve yer kabuğunu inceleyen bilim insanı. | TDK definition of jeolog. |
| cografya-1-J-4 | Baraj | Japon Denizi | Japonya ile Kore Yarımadası arasında kalan deniz. | Sea of Japan lies between Japan and the Korean Peninsula (atlas). |
| cografya-1-Ö-3 | Kömür | Öğle / Öğle vakti | Güneş'in gökyüzünde en yükseğe çıktığı, gölgelerin en kısa olduğu gün ortası vakti. | Shadows are shortest at solar noon; school geography. |
| cografya-1-Ö-4 | Bölge | Ören yeri / Ören | Eski yapıların yıkıntılarının bulunduğu, kazı yapılan yer. | TDK: ören / ören yeri = ruins, archaeological site. |
| cografya-1-Ü-3 | Türkiye | Üzüm | Manisa ve Denizli'de bağlarda yetiştirilen, kurusu da satılan meyve. | Manisa and Denizli are Turkey's main grape (and sultana) growing provinces. |
| cografya-1-Ü-4 | Kütahya | Ürün | Tarlada yetiştirilip hasat edilen buğday, pamuk ya da fındık gibi tarım malının genel adı. | TDK definition of ürün. |
| cografya-2-C-4 | Bilecik | Cunda / Cunda Adası | Ayvalık'a köprüyle bağlı, Alibey Adası da denen Ege adası. | Cunda (Alibey Adası) is joined to Ayvalık by a causeway bridge. |
| cografya-2-I-3 | Kırklareli | Ilıman / Ilıman iklim / Ilıman kuşak | Ne çok sıcak ne çok soğuk olan, dört mevsimin belirgin yaşandığı iklim kuşağı. | Temperate zone (ılıman kuşak): standard school geography. |
| cografya-2-I-4 | Sıradağ | Issık Göl / Issıkgöl | Kırgızistan'daki, kışın donmamasıyla bilinen büyük dağ gölü. | Issyk-Kul, Kyrgyzstan: large alpine lake that does not freeze in winter. |
| cografya-2-J-4 | Nijerya | Jura Dağları / Jura | Fransa ile İsviçre arasında uzanan, bir jeolojik devreye adını veren sıradağlar. | Jura Mountains on the France–Switzerland border gave the Jurassic its name. |
| cografya-2-Ö-2 | Gölcük | Ömerli Barajı / Ömerli | İstanbul'un Anadolu yakasında, şehrin en büyük içme suyu kaynağı olan baraj. | İSKİ: Ömerli Dam is the largest of İstanbul's drinking-water reservoirs, on the Anatolian side. |
| cografya-2-Ö-3 | Göreme | Ön Asya | Anadolu, Mezopotamya, İran ve Arap Yarımadası'nı kapsayan bölgenin coğrafi adı. | Ön Asya (Western Asia / Near East) as defined in Turkish geography texts. |
| cografya-2-Ö-4 | Göksu | Örtü altı tarımı / Örtüaltı tarımı / Örtü altı | Antalya'da yaygın olan, seralarda yapılan tarım. | Antalya has the largest greenhouse (örtü altı) area in Turkey (TÜİK). |
| cografya-2-Ü-3 | Gümüşhane | Ünye | Ordu'nun kalesi ve fındığıyla bilinen sahil ilçesi. | Ünye is a coastal district of Ordu with Ünye Kalesi; hazelnut region. |
| cografya-2-Ü-4 | Bükreş | Ümit Burnu | Vasco da Gama'nın 1497'de dolaşıp Hindistan'a ulaştığı, Afrika'nın güneyindeki burun. | Vasco da Gama rounded the Cape of Good Hope in November 1497 on his way to India. |
| cografya-3-I-4 | Sırbistan | Işıklı Gölü / Işıklı | Denizli Çivril'de bulunan, Büyük Menderes'in kaynağı sayılan göl. | Işıklı Gölü, Çivril (Denizli), is fed by the Büyük Menderes headwater springs. |
| cografya-3-J-3 | Nijer | Jet akımı / Jet akıntısı | Yüksek irtifada batıdan doğuya esen, dar ve çok hızlı hava akımı. | Jet stream: narrow, fast westerly wind in the upper troposphere (meteorology textbooks). |
| cografya-3-J-4 | Fiji | Jips | Alçıtaşı da denen, sularda çözünerek obruk ve mağaralar oluşturabilen mineral. | TDK: jips = alçıtaşı (gypsum); gypsum karst forms sinkholes and caves. |
| cografya-3-Ö-3 | Dönence | Ötrofikasyon | Göllerin aşırı besin tuzlarıyla dolup yosunlanması ve oksijensiz kalması. | Eutrophication (ötrofikasyon): nutrient overload, algal bloom, oxygen depletion. |
| cografya-3-Ö-4 | Köyceğiz | Özerk | Nahçıvan gibi, bir devlete bağlı olup kendi kendini yöneten bölgeler için kullanılan sıfat. | Nakhchivan Autonomous (Özerk) Republic, part of Azerbaijan. |
| cografya-3-Ü-3 | Süphan | Ürümçi | Çin'in Sincan Uygur Özerk Bölgesi'nin merkezi olan şehir. | Ürümqi is the capital of the Xinjiang Uyghur Autonomous Region. |
| cografya-3-Ü-4 | Sürmene | Üçüncü Zaman / Üçüncü Jeolojik Zaman | Alp kıvrımlarının oluştuğu, Türkiye'nin bugünkü yer şekillerinin büyük ölçüde biçimlendiği jeolojik zaman. | Turkish geography curriculum: Alpine orogeny in the Tertiary (Üçüncü Zaman) shaped Anatolia's relief. |
| bilim-1-I-4 | Balık | Ispanak | Demir ve folik asit bakımından zengin, yaprakları yenen yeşil sebze. | Spinach is rich in folate and contains iron (USDA nutrient data). |
| bilim-1-J-3 | Enerji | Jet / Jet uçağı | Pervanesi olmayan, motorundan çıkan sıcak gazla hızla uçan uçak. | Jet engine principle: thrust from hot exhaust gas; common knowledge. |
| bilim-1-J-4 | Oksijen | Jeolog | Kayaları ve yer kabuğunu inceleyen bilim insanı. | TDK definition of jeolog. |
| bilim-1-Ö-4 | Kömür | Öğün | Kahvaltı, öğle ve akşam yemeği gibi her bir yemek zamanı. | TDK definition of öğün. |
| bilim-1-Ü-2 | Bülbül | Üçgen | Kenar sayısı en az olan çokgen. | A polygon has at least three sides: the triangle. |
| bilim-1-Ü-3 | Gümüş | Üretici / Üreticiler | Besin zincirinde kendi besinini fotosentezle yapan canlı. | Food chain: producers (üreticiler) make their own food by photosynthesis (school science). |
| bilim-1-Ü-4 | Tüy | Ütü | Elektrik enerjisini ısıya çevirip kumaşı düzleştiren ev aleti. | Electric iron converts electrical energy into heat; school science. |
| bilim-2-I-4 | Yıldırım | Isıl denge | Sıcaklıkları farklı iki maddenin temas edince aynı sıcaklığa ulaşması. | Thermal equilibrium (ısıl denge), Turkish 7th-grade science curriculum. |
| bilim-2-J-3 | Biyoloji | Jako / Jako papağanı | Konuşmayı taklit etmesiyle ünlü, gri tüylü ve kırmızı kuyruklu Afrika papağanı. | African grey parrot (jako): grey with a red tail, known for mimicking speech. |
| bilim-2-Ö-1 | Göktaşı | Özkütle / Öz kütle | Bir maddenin birim hacminin kütlesi. | Density (özkütle) = mass / volume; school physics. |
| bilim-2-Ö-2 | Kök | Öd / Öd suyu | Karaciğerde üretilip safra kesesinde depolanan, yağların sindirimine yardım eden sıvı. | Bile is made by the liver, stored in the gallbladder, emulsifies fats. |
| bilim-2-Ö-3 | Böcek | Ördekgagalı | Avustralya'da yaşayan, yumurtlayan memeli. | Platypus (ördekgagalı) is an egg-laying mammal of Australia. |
| bilim-2-Ö-4 | Çöl | Öglena | Hem fotosentez yapabilen hem de kamçısıyla yüzen tek hücreli canlı. | Euglena (öglena): flagellated, has chloroplasts; Turkish biology textbook example. |
| bilim-2-Ş-1 | Aşı | Şeker hastalığı | Pankreasın yeterli insülin üretememesiyle kandaki glikozun yükseldiği hastalık. | Diabetes mellitus: insufficient insulin, high blood glucose. |
| bilim-2-Ş-2 | Ateşböceği | Şeffaf | Işığı geçiren, arkasındakinin net görüldüğü maddeler için kullanılan sıfat. | TDK: şeffaf = saydam (transparent). |
| bilim-2-Ş-3 | Kuşburnu | Şakak | Kafatasının yan tarafında, göz ile kulak arasında kalan bölge. | TDK definition of şakak (temple). |
| bilim-2-Ü-3 | Kükürt | Üzengi kemiği / Üzengi | Orta kulakta bulunan, vücudun en küçük kemiği. | The stapes (üzengi) in the middle ear is the smallest bone in the human body. |
| bilim-2-Ü-4 | Dürbün | Ülser | Mide ya da on iki parmak bağırsağının iç yüzeyinde açılan yara. | Peptic ulcer: sore in the lining of the stomach or duodenum. |
| bilim-3-I-2 | Kırılma | Işıma / Işınım | Isının bir ortama gerek duymadan elektromanyetik dalgalarla yayılması. | Heat transfer by radiation (ışıma) needs no medium; school physics. |
| bilim-3-I-3 | Kızıl dev | Iraksak mercek / Iraksak | Işığı dağıtan, kenarları ortasından kalın olan mercek. | Diverging (ıraksak) lens is thicker at the edges than in the middle. |
| bilim-3-I-4 | Altın oran | Isı yalıtımı | Binalarda ısı kaybını azaltmak için duvarlara köpük levha gibi malzemeyle yapılan uygulama. | Thermal insulation (ısı yalıtımı) of buildings with foam boards; standard term. |
| bilim-3-J-4 | Paleontoloji | Jeofizik | Yer'in iç yapısını deprem dalgaları ve manyetik alanla inceleyen bilim. | Geophysics studies Earth's interior with seismic waves and magnetic field data. |
| bilim-3-Ş-2 | Aşınma | Şist | İnce tabakalar halinde ayrılabilen, yapraklanma gösteren başkalaşım kayacı. | Schist (şist): foliated metamorphic rock. |
| bilim-3-Ş-3 | Dişbudak | Şap / Şap hastalığı | Sığır ve koyunlarda ağızda ve ayaklarda yaralara yol açan virüs hastalığı. | Foot-and-mouth disease (şap) is viral and causes mouth and foot lesions in cloven-hoofed animals. |
| bilim-3-Ü-2 | Kümülüs | Ürik asit | Fazlası eklemlerde birikerek gut hastalığına yol açan madde. | Gout is caused by uric acid crystals in joints. |
| bilim-3-Ü-3 | Süblimleşme | Üveyik | Kumruya benzeyen, yazı Türkiye'de geçiren göçmen yabani güvercin. | Üveyik = European turtle dove (Streptopelia turtur), a migratory summer visitor. |
| bilim-3-Ü-4 | Sülük | Üst deri / Üstderi | Derinin en dışta bulunan katmanı. | Epidermis = üst deri, outermost skin layer. |
| sanat-1-I-3 | Halı | Islık | Dudakları büzüp üfleyerek çıkarılan, şarkı da çalınabilen ince ses. | TDK definition of ıslık. |
| sanat-1-I-4 | Kırmızı Başlıklı Kız | Işık gölge / Işık-gölge | Resimde nesnelere derinlik vermek için aydınlık ve karanlık tonların birlikte kullanılması. | Light and shade (chiaroscuro) is a basic school art lesson. |
| sanat-1-Ö-3 | Köroğlu | Örümcek Adam | Gerçek adı Peter Parker olan çizgi roman kahramanı. | Spider-Man's secret identity is Peter Parker (Marvel). |
| sanat-1-Ö-4 | Gölge oyunu | Örgü | İki şiş ve yün iple yapılan el işi. | Knitting with two needles; common knowledge. |
| sanat-1-U-4 | Tuval | Uçan halı | Masallarda sahibini havada taşıyan sihirli eşya. | Flying carpet of the One Thousand and One Nights tales. |
| sanat-1-Ü-2 | Müzik | Üflemeli çalgılar / Üflemeli | Flüt ve zurna gibi nefesle çalınan çalgıların genel adı. | Wind instruments are called üflemeli çalgılar; flute and zurna are examples. |
| sanat-1-Ü-3 | Düet | Üç Küçük Domuz / Üç Küçük Domuzcuk | Kurdun üfleyerek samandan ve çubuktan evleri yıktığı masal. | The Three Little Pigs: the wolf blows down the straw and stick houses. |
| sanat-1-Ü-4 | Kütüphane | Ünlem / Ünlem işareti | Şaşkınlık ya da heyecan bildiren cümlenin sonuna konan noktalama işareti. | TDK spelling guide: ünlem işareti marks surprise or excitement. |
| sanat-2-I-1 | Kuyucaklı Yusuf | Issız Adam | Çağan Irmak'ın, Alper ile Ada'nın aşkını anlatan 2008 filmi. | Issız Adam (2008), directed by Çağan Irmak; leads Alper and Ada. |
| sanat-2-I-2 | Kaşağı | Işık | Monet gibi izlenimci ressamların günün farklı saatlerinde yakalamaya çalıştığı şey. | Impressionists painted the same subject at different times of day to catch changing light (Monet's haystacks). |
| sanat-2-I-3 | Kırmızı Saçlı Kadın | Işıldak | Tiyatroda sahnedeki oyuncuyu izleyen güçlü ışık kaynağı. | TDK: ışıldak = projector / spotlight. |
| sanat-2-I-4 | Kiralık Konak | Itri / Itrî | Bayram tekbirinin bestecisi olarak bilinen 17. yüzyıl Osmanlı bestecisi. | Buhurizâde Mustafa Itrî (1640?–1712) composed the Segâh Tekbir (TDV İslâm Ansiklopedisi). |
| sanat-2-Ö-3 | Dönüşüm | Ölü Ozanlar Derneği | Robin Williams'ın edebiyat öğretmeni Keating'i oynadığı 1989 filmi. | Dead Poets Society (1989): Robin Williams as John Keating. |
| sanat-2-U-4 | Kuğu Gölü | Uğultu Tepeleri | Emily Brontë'nin Heathcliff ile Catherine'i anlatan 1847 tarihli romanı. | Wuthering Heights by Emily Brontë, 1847. |
| sanat-2-Ü-3 | Bülbül | Ütopya | Thomas More'un 1516'da yazdığı, ideal bir ada toplumunu anlatan eser. | Thomas More, Utopia, 1516. |
| sanat-2-Ü-4 | Hüsn ü Aşk | Üç Kız Kardeş | Çehov'un, Moskova'ya dönmeyi düşleyen Olga, Maşa ve İrina'yı anlatan oyunu. | Chekhov, Three Sisters (1901): Olga, Masha, Irina long for Moscow. |
| sanat-3-Ç-1 | Üç İstanbul | Çeşm-i Bülbül / Çeşmibülbül | Beykoz'da üretilen, beyaz ve renkli şeritlerle süslü Osmanlı cam işi. | Çeşm-i bülbül: Beykoz glassware with white and coloured spiral stripes. |
| sanat-3-I-1 | Yusuf Atılgan | Irak / Irak makamı | Adı bir ülkeyle aynı olan, klasik Türk müziğinin eski makamlarından biri. | Irak is a makam of classical Turkish music (TDV İslâm Ansiklopedisi 'Irak' entry). |
| sanat-3-I-2 | Yalnızız | Ihlamurlar Altında | Fransız yazar Alphonse Karr'ın Türkçeye bir ağaç adıyla çevrilen 1832 tarihli romanı. | Web check: Sous les tilleuls (1832), published in Turkish as Ihlamurlar Altında (kitapyurdu, classiques-garnier). |
| sanat-3-I-3 | Tarık Buğra | Isfahan / Isfahan makamı | Adını İran'ın bir şehrinden alan, klasik Türk müziğinin en eski makamlarından biri. | Web check: TDV İslâm Ansiklopedisi 'Isfahan (mûsiki)' calls it one of the oldest makams of Turkish music. |
| sanat-3-I-4 | Ağrıdağı Efsanesi | Işıklar Sönmesin | Yönetmen Reis Çelik'in 1996'da çektiği ilk uzun metrajlı filmi. | Web check: Işıklar Sönmesin (1996) is Reis Çelik's debut feature (IMDb tt0151080, TheTVDB). |
| sanat-3-Ö-2 | Göl Saatleri | Ölmeye Yatmak | Adalet Ağaoğlu'nun, Aysel'in bir otel odasında hayatını sorguladığı 1973 tarihli romanı. | Adalet Ağaoğlu, Ölmeye Yatmak (1973); Aysel reflects on her life in a hotel room. |
| sanat-3-Ö-3 | Kör Baykuş | Ömer Lütfi Akad | Gelin, Düğün ve Diyet filmlerinden oluşan göç üçlemesinin yönetmeni. | Lütfi Ö. Akad directed the migration trilogy Gelin (1973), Düğün (1974), Diyet (1975). |
| sanat-3-Ö-4 | Gölgesizler | Ögdülmiş | Kutadgu Bilig'de aklı temsil eden, vezirin oğlu olan kişi. | Kutadgu Bilig: Ögdülmiş (intellect) is the son of vizier Ay Toldı. |
| sanat-3-Ş-4 | Abdülhak Şinasi Hisar | Şemsettin Sami / Şemseddin Sami | İlk Türk romanı sayılan Taaşşuk-ı Talat ve Fitnat'ın ve Kamus-ı Türki sözlüğünün yazarı. | Şemseddin Sami wrote Taaşşuk-ı Tal'at ve Fitnat (1872) and Kâmûs-ı Türkî (1900). |
| sanat-3-U-4 | Huzur | Uşşak / Uşşak makamı | Adı âşıklar anlamına gelen, klasik Türk müziğinin temel makamlarından biri. | Uşşak (Arabic plural of âşık) is one of the basic makams (TDV İslâm Ansiklopedisi). |
| sanat-3-Ü-1 | Dünyanın En Güzel Arabistanı | Üç İstanbul | Mithat Cemal Kuntay'ın, İstanbul'u üç dönemde anlatan romanı. | Mithat Cemal Kuntay, Üç İstanbul (1938): Abdülhamid, Meşrutiyet and Mütareke İstanbul. |
| sanat-3-Ü-2 | Müzeyyen Senar | Üç Maymun | Nuri Bilge Ceylan'a 2008'de Cannes'da en iyi yönetmen ödülünü kazandıran film. | Three Monkeys won Nuri Bilge Ceylan the Best Director award at Cannes 2008. |
| sanat-3-Ü-3 | Münir Nurettin Selçuk | Üzeyir Hacıbeyli / Üzeyir Hacıbeyov / Üzeyir Hacıbəyli | Leyla ile Mecnun operasının ve Azerbaycan milli marşının bestecisi. | Uzeyir Hajibeyov composed Leyli and Majnun (1908) and the anthem of Azerbaijan. |
| spor-1-I-3 | Kırmızı kart | Iska | Topa ya da hedefe vurmaya çalışırken boşa geçme. | TDK: ıska = missing the target. |
| spor-1-I-4 | Takım | Ispanak | Temel Reis'in yiyince güçlendiği yeşil sebze. | Popeye (Temel Reis) gets his strength from spinach. |
| spor-1-Ö-3 | Bölüm | Örümcek Adam | Gerçek adı Peter Parker olan, ağ atarak binadan binaya sallanan kahraman. | Spider-Man's secret identity is Peter Parker (Marvel). |
| spor-1-Ö-4 | Dönme dolap | Ön eleme / Ön elemeler | Turnuvanın asıl bölümünden önce yapılan, katılacak takımları belirleyen eleme. | Qualifying round (ön eleme): common sports term. |
| spor-1-Ü-2 | Türkü | Üçüncü / Üçüncülük | Bronz madalya kazanan sporcunun derecesi. | Bronze medal is awarded for third place. |
| spor-1-Ü-3 | Düdük | Üzengi | Binicilikte atlının ayağını dayadığı, eyerden sarkan halka. | TDK definition of üzengi (stirrup). |
| spor-1-Ü-4 | Gümüş | Üye | Bir spor kulübüne aidat ödeyerek katılan kişi. | TDK definition of üye (member). |
| spor-2-I-1 | Sarı kart | Istaka | Bilardoda toplara vurmak için kullanılan uzun sopa. | TDK: ıstaka = billiard cue. |
| spor-2-I-2 | Filenin Sultanları | Issız Adam | Çağan Irmak'ın, Cahit Berkay müzikli, Alper ile Ada'nın aşkını anlatan 2008 filmi. | Issız Adam (2008), directed by Çağan Irmak; music by Cahit Berkay. |
| spor-2-I-3 | Yarı final | Irmak | Rafting ve kanonun yapıldığı, Çoruh ve Köprüçay gibi akarsuların genel adı. | Çoruh and Köprüçay are Turkey's best-known rafting rivers. |
| spor-2-Ö-1 | Göztepe | Öyle Bir Geçer Zaman ki | 2010-2013 yılları arasında yayınlanan, Ali Kaptan ve ailesini anlatan dizi. | Öyle Bir Geçer Zaman ki (Kanal D, 2010–2013); Ali Kaptan is the father. |
| spor-2-Ö-3 | Söz yazarı | Ölümlü Dünya | Ali Atay'ın yönettiği, Erdenay ailesinin tetikçi maceralarını anlatan 2018 komedisi. | Ölümlü Dünya (2018), directed by Ali Atay; the Erdenay family of hitmen. |
| spor-2-Ö-4 | Rövanş | Özil | Almanya formasıyla 2014 Dünya Kupası'nı kazanan, sonra Fenerbahçe'de de oynayan Türk asıllı futbolcu. | Mesut Özil: 2014 World Cup winner with Germany, played for Fenerbahçe 2021–2022. |
| spor-2-Ü-3 | Bülent Ersoy | Üçlü atlama | Atletizmde sek, şek ve atlama adımlarıyla yapılan dal. | Triple jump: hop, step and jump. |
| spor-2-Ü-4 | Müzikal | Ümit Milli Takım / Ümit Millî Takım / Ümitler | 21 yaş altı oyunculardan kurulan milli futbol takımı. | TFF calls the U21 national team 'Ümit Milli Takım'. |
| spor-3-I-1 | Sırıkla atlama | Işık Doğudan Yükselir | Sezen Aksu'nun halk müziğine yöneldiği 1995 tarihli albümü. | Web check: Sezen Aksu, Işık Doğudan Yükselir, released 28 June 1995 (Wikipedia, Deezer). |
| spor-3-I-2 | Mızrap | Işıklar / Işık | Formula 1'de yarışın başlaması için sönmesi beklenen beş kırmızı lamba. | F1 sporting regulations: the race starts when the five red start lights go out. |
| spor-3-I-3 | Sırtüstü | Ilgaz / Ilgaz Dağı | Kastamonu ile Çankırı arasında, kayak merkezi bulunan dağ. | Ilgaz Mountain National Park has a ski resort, on the Kastamonu–Çankırı border. |
| spor-3-I-4 | Atıf Yılmaz | Işıl Alben | Galatasaray'la anılan, kadın basketbol milli takımının kaptanlığını da yapan oyun kurucu. | Web check: Işıl Alben, point guard, Galatasaray legend and national team captain, retired June 2023 (Fanatik, Türkiye). |
| spor-3-Ö-3 | Röveşata | Özel Olimpiyatlar | Zihinsel engelli sporcular için düzenlenen uluslararası spor organizasyonu. | Special Olympics (Özel Olimpiyatlar) for athletes with intellectual disabilities. |
| spor-3-Ö-4 | Gölge oyunu | Ömer Faruk Sorak | Yılmaz Erdoğan'la birlikte Vizontele'yi yöneten, Gora'nın da yönetmeni olan isim. | Ömer Faruk Sorak co-directed Vizontele (2001) and directed G.O.R.A. (2004). |
| spor-3-Ü-3 | Münir Nurettin Selçuk | Üniversiade | Üniversite öğrencileri için düzenlenen, 2005'te İzmir'de yapılan dünya spor oyunları. | 2005 Summer Universiade was held in İzmir. |
| spor-3-Ü-4 | Süleyman Seba | Ülker Sports Arena / Ülker Spor ve Etkinlik Salonu / Ülker | Fenerbahçe'nin basketbol maçlarını oynadığı, Ataşehir'deki salon. | Fenerbahçe plays home basketball games at the Ülker Sports Arena (Ülker Spor ve Etkinlik Salonu), Ataşehir. |
