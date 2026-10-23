# EcoFinance

Aplikasi web untuk UMKM: buku kas sederhana, hitung jejak karbon (kg CO₂e), grafik, dan laporan PDF/CSV terpadu. Tampil baik di HP dan laptop, mengikuti mode terang/gelap.

Tidak ada langkah build. Semua berkas statis, jadi bisa dipasang di Netlify, Vercel, Cloudflare Pages, atau GitHub Pages.

```
index.html            halaman utama
styles.css            tampilan
app.js                logika aplikasi
config.js             isi URL dan kunci Supabase di sini
emission-factors.js   faktor emisi beserta sumber dan statusnya
supabase/schema.sql   tabel database dan aturan keamanan
```

## Mencoba cepat (mode demo)

Buka `index.html` di peramban. Selama `config.js` kosong, aplikasi berjalan dalam mode demo: tombol Google, Apple, dan Facebook hanya meniru login, dan data tersimpan di peramban itu saja.

## Memasang dengan login sungguhan

### 1. Buat proyek Supabase

1. Daftar di https://supabase.com dan buat proyek baru (paket gratis cukup untuk mulai).
2. Buka **SQL Editor**, tempel isi `supabase/schema.sql`, lalu **Run**. Ini membuat tabel `businesses`, `transactions`, `emissions`, dan aturan agar tiap pengguna hanya bisa melihat datanya sendiri.
3. Buka **Project Settings > API**, salin **Project URL** dan **anon public key** ke `config.js`.

Anon key memang boleh terlihat di browser. Keamanan data dijaga oleh aturan Row Level Security di database. Jangan pernah menaruh `service_role` key di aplikasi ini.

### 2. Pasang di hosting statis

Unggah seluruh folder ini. Catat alamat situs Anda, misalnya `https://ecofinance.example.com`.

### 3. Daftarkan alamat situs di Supabase

Di **Authentication > URL Configuration**:
- **Site URL**: alamat situs Anda.
- **Redirect URLs**: tambahkan alamat yang sama (dan `http://localhost:8000` bila ingin menguji lokal).

### 4. Aktifkan penyedia login

Di **Authentication > Providers**. Callback URL yang harus didaftarkan ke tiap penyedia ditampilkan Supabase di halaman masing-masing (bentuknya `https://<id-proyek>.supabase.co/auth/v1/callback`).

| Penyedia | Yang perlu disiapkan |
|---|---|
| Email | Aktif secara bawaan. Atur apakah konfirmasi email diperlukan. |
| Google | Buat OAuth Client ID (jenis Web) di Google Cloud Console, lalu isi Client ID dan Secret. |
| Facebook | Buat aplikasi di Meta for Developers, aktifkan Facebook Login, isi App ID dan Secret. |
| Apple (iCloud) | Perlu akun Apple Developer berbayar: Services ID, key, dan Team ID. Ikuti panduan Supabase untuk Apple. |

Tombol penyedia yang belum diaktifkan akan menampilkan pesan galat dari Supabase saat ditekan. Anda bisa memulai dengan Email dan Google, lalu menambah yang lain.

### 5. Uji

Buka situs, daftar, catat satu transaksi, lalu muat ulang dan buka dari perangkat lain. Data harus tetap ada. Di tabel `transactions` pada Supabase, kolom `user_id` terisi otomatis.

## Faktor emisi

Semua faktor ada di `emission-factors.js`, masing-masing dengan status:

| Sumber | Faktor | Status |
|---|---|---|
| Gas LPG | 3,02 kg CO₂ per kg | Resmi: faktor nasional ESDM 65,41 tCO₂/TJ × NCV 46,12 TJ/Gg |
| Bensin | 2,26 kg CO₂ per liter | Turunan: faktor nasional ESDM 69,04 tCO₂/TJ × NCV IPCC 44,3 TJ/Gg × massa jenis 0,74 kg/liter (asumsi) |
| Solar | 2,63 kg CO₂ per liter | Turunan: faktor nasional ESDM 72,93 tCO₂/TJ × NCV IPCC 43,0 TJ/Gg × massa jenis 0,84 kg/liter (asumsi) |
| Listrik PLN | 0,87 kg CO₂e per kWh | **Perlu verifikasi** |
| Sampah ke TPA | 0,58 kg CO₂e per kg | **Perlu verifikasi** |

Sumber angka BBM dan LPG: tabel faktor emisi BBM dan batubara, Kementerian ESDM
(https://www.esdm.go.id/assets/media/content/content-faktor-emisi-bahan-bakar-minyak-bbm-dan-batubara.pdf).
Hanya CO₂ yang dihitung untuk bahan bakar. NCV bensin dan solar serta massa jenis adalah nilai umum, bukan dari dokumen ESDM tersebut.

**Yang belum terverifikasi:** saya tidak menemukan dokumen resmi yang memuat angka faktor emisi listrik jaringan PLN terbaru maupun faktor sampah TPA untuk Indonesia. Kedua angka itu masih perkiraan umum. Sebelum laporan dipakai untuk pelaporan formal, ambil angkanya dari:
- Direktorat Jenderal Ketenagalistrikan, Kementerian ESDM, untuk faktor emisi sistem ketenagalistrikan.
- KLHK (SRN PPI) atau pedoman IPCC 2006 untuk sektor sampah.

Lalu ubah `f`, `status`, `basis`, dan `ref` di `emission-factors.js`.

Setiap catatan emisi menyimpan faktor yang berlaku saat dicatat (kolom `factor`), sehingga mengubah faktor tidak mengubah laporan bulan lalu.

Intensitas karbon (kg CO₂e per Rp1 juta pemasukan) dan kategorinya (rendah, sedang, tinggi) adalah indikator internal untuk membandingkan bulan ke bulan, bukan sertifikasi.

## Catatan

- Satu akun memegang satu usaha. Untuk beberapa usaha, tambahkan kolom `business_id` pada tabel transaksi dan emisi.
- Tarif listrik untuk perhitungan penghematan di Beranda (Rp1.445/kWh) ada di `app.js` (`TARIF_KWH`). Sesuaikan dengan golongan tarif Anda.
- Hapus akun sepenuhnya dilakukan dari dashboard Supabase (Authentication > Users). Data pengguna ikut terhapus.
