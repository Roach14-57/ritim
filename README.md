# Ritim — müzik topluluğu

React + Vite ile hazırlanmış, mobil/tablet/masaüstü uyumlu bir müzik sosyal ağı. Dinleyiciler Spotify kataloğunda şarkı ve albüm arar; 10 üzerinden puan verip yorumunu akışta paylaşır. Diğer üyeler yorumları beğenebilir, yanıt yazabilir ve paylaşımları kaydedebilir.

## Hızlı başlangıç: demo modu

Uygulama, hiçbir bulut hesabı olmadan demo akışı ve etkileşimlerle açılır. Paylaşım, yorum, beğeni ve profil adı bu tarayıcının `localStorage` alanında saklanır; farklı cihazlara/kişilere senkronize olmaz.

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. Spotify Developer Dashboard’da uygulama oluşturup Client ID alın.
3. Spotify uygulamasına `http://127.0.0.1:5173` Redirect URI’sini ekleyin ve `.env` içine yazın:

   ```env
   VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
   VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173
   ```

4. Çalıştırın:

   ```bash
   npm install
   npm run dev -- --host 127.0.0.1
   ```

Uygulamadaki Spotify aramasını kullanmak için Spotify hesabınızla bağlanın. Giriş, tarayıcı uygulamalarına uygun Authorization Code with PKCE akışını kullanır; Client Secret istemez.

## Birden fazla kişinin kullandığı topluluk modu

Demo modu tek tarayıcıyla sınırlıdır. Paylaşımların farklı hesaplarda görünmesi için bir Supabase projesi gerekir:

1. Supabase projesi oluşturun.
2. `supabase/schema.sql` dosyasını Supabase SQL Editor’da çalıştırın. Bu dosya yorum, yorum yanıtı ve beğeni tablolarını, indeksleri ve kullanıcıya göre erişim sağlayan RLS politikalarını kurar.
3. `.env` içine Supabase Project URL ve **publishable key** değerlerini ekleyin:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

4. Geliştirme sunucusunu yeniden başlatın. Uygulamada hesap oluşturup giriş yapınca paylaşımlar ve etkileşimler Supabase’e kaydedilir ve diğer üyelerle ortak akışta görünür.

Tarayıcıya yalnızca public/publishable anahtarı koyun. Supabase secret/service role anahtarını veya Spotify Client Secret’ını `.env` dosyasına eklemeyin.

## Özellikler

- Spotify Web API aramasıyla albüm ve şarkı bulma
- 1–10 puanlı topluluk değerlendirmeleri ve yorum akışı
- Beğeniler, paylaşım bağlantısı, yorum yanıtları ve kaydedilen gönderiler
- E-posta hesabı ile giriş/kayıt (Supabase yapılandırıldığında)
- Demo verisiyle yapılandırmasız yerel önizleme
- CSS Grid/Flexbox, semantik HTML5, SEO/Open Graph metaverileri ve geç yüklenen görseller

## Komutlar

- `npm run dev` — geliştirme sunucusu
- `npm run build` — üretim derlemesi
- `npm run preview` — üretim derlemesini yerelde görüntüleme
