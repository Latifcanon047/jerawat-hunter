# PRD v1.0 — Web App Pendamping Mengurangi Kebiasaan Picking

## 1. Ringkasan Produk

Website mobile-first yang membantu pengguna mengurangi kebiasaan memencet jerawat, mengelupas koreng, dan mengutak-atik kulit.

Fokus MVP:
- Membantu pengguna melewati dorongan picking melalui fitur Pause.
- Mencatat kejadian picking dan keberhasilan menahan dorongan.
- Menampilkan statistik dan pola perilaku agar pengguna memahami kebiasaannya.

Prinsip utama: relapse bukan kegagalan total. Setiap kejadian adalah data untuk memahami dan memperbaiki kebiasaan.

## 2. Teknologi dan Platform

- Framework: Next.js dengan TypeScript
- Konfigurasi TypeScript: mode `strict` aktif (`strict: true`)
- ORM: Prisma
- Database: Neon PostgreSQL
- Lingkungan pengembangan: Antigravity
- Desain: mobile-first, terutama untuk penggunaan melalui HP
- Autentikasi: email/password dan Google
- Fitur akun: registrasi, login, dan reset password melalui email
- Multi-user: setiap pengguna hanya boleh mengakses data miliknya sendiri.

## 3. Ruang Lingkup MVP

### A. Dashboard

Dashboard adalah halaman utama dengan desain minimalis dan bersih yang berfungsi sebagai pusat kendali (*hub*) aktivitas pengguna.

Prioritas tampilan:
1. Tombol Pause yang mudah dijangkau untuk merespons dorongan seketika.
2. Tombol aksi cepat untuk mencatat keberhasilan (*Standalone Resistance*) dan mencatat kejadian picking (*Standalone Picking*) secara mandiri.
3. Tautan riwayat kejadian picking dan riwayat keberhasilan.
4. Bagian Statistik: ringkasan kartu total dan grafik garis tren keberhasilan menahan dorongan serta kejadian picking.
5. Ringkasan pola pemicu dan analisis perilaku (direncanakan).

*Catatan Navigasi:*
- Kebutuhan produk awal menetapkan navigasi utama menggunakan *bottom navigation*.
- Implementasi saat ini menggunakan pola *Dashboard Hub & Spoke*: menu tautan/tombol kartu di halaman beranda (`/`) dan tautan kembali (*"← Kembali ke beranda"*) di header setiap halaman subfitur (`/pause`, `/picking`, `/resistance`). Bottom navigation tetap menjadi kebutuhan yang belum diimplementasikan dan akan dievaluasi pada pembaruan UI berikutnya.

### B. Fitur Pause

Alur:
1. Pengguna menekan tombol Pause.
2. Pengguna memilih durasi: 30 detik, 1 menit, 3 menit, 5 menit, atau durasi khusus.
3. Timer dimulai.
4. Aplikasi menampilkan instruksi singkat untuk membantu pengguna melewati dorongan.
5. Pengguna dapat mengakhiri sesi lebih awal melalui konfirmasi singkat.
6. Setelah sesi, pengguna memilih hasil:
   - Berhasil melewati dorongan.
   - Masih menahan diri.
   - Akhirnya melakukan picking.

Jika pengguna masih menahan diri, aplikasi memprioritaskan tawaran mengulangi Pause, tetapi pengguna tetap boleh berhenti dan kembali ke beranda.

Jika pengguna akhirnya melakukan picking, aplikasi menawarkan pengisian catatan kejadian picking melalui alur tindak lanjut (*follow-up*):
- Status tindak lanjut dicatat dalam `PauseSession.pickingFollowUpCompleted`.
- Jika sesi berakhir dengan hasil picking tetapi pengguna belum melengkapi detailnya, Dashboard akan menampilkan dialog pengingat ramah (*"Catatan picking belum selesai"*) yang mengarahkan pengguna untuk melengkapi detail kejadian tersebut atau tetap membuka dashboard.
- Ketika catatan kejadian picking tersimpan, `pickingFollowUpCompleted` ditandai selesai (`true`).
- Jika suatu catatan `PickingEvent` yang terhubung ke Pause kemudian dihapus oleh pengguna, status `pickingFollowUpCompleted` pada sesi Pause terkait **tetap dipertahankan bernilai `true`** agar pengingat tidak muncul kembali secara mengganggu.

Pengguna tetap boleh mencatat keberhasilan melewati dorongan maupun kejadian picking secara mandiri meskipun tidak menggunakan Pause.

### C. Pencatatan Kejadian Picking

Pencatatan dibuat singkat dan menggunakan pilihan terstruktur agar data mudah dihitung.

**Jenis picking — wajib dipilih:**
- Memencet jerawat.
- Mengelupas koreng atau kulit yang sedang sembuh.
- Meraba atau mengutak-atik kulit tanpa sengaja melukai.

**Data tambahan — opsional:**

**Pemicu**
- Merasa ada benjolan atau tekstur kulit.
- Melihat kulit di cermin.
- Melihat atau merasakan koreng yang kering.
- Stres atau cemas.
- Bosan atau tidak ada kegiatan.
- Tangan bergerak otomatis tanpa sadar.
- Ingin merasakan kepuasan atau kelegaan.
- Pemicu lainnya.

**Emosi**
- Cemas atau gelisah.
- Stres atau tertekan.
- Bosan.
- Kesal atau frustrasi.
- Kosong atau tidak merasakan apa-apa.
- Penasaran atau ingin merasa puas.
- Ingin merasa lega.
- Netral atau biasa saja.
- Emosi lainnya.

**Kekuatan dorongan**
- 1 — Sangat lemah.
- 2 — Lemah.
- 3 — Sedang.
- 4 — Kuat.
- 5 — Sangat kuat.

**Durasi**
- Kurang dari 1 menit.
- 1–5 menit.
- 6–15 menit.
- 16–30 menit.
- Lebih dari 30 menit.

**Alasan melakukan picking**
- Ingin menghilangkan benjolan atau tekstur yang terasa mengganggu.
- Ingin mengelupas kulit atau koreng yang kering.
- Mencari rasa puas saat memencet atau mengelupas.
- Mencari kelegaan dari dorongan.
- Ingin kulit terasa lebih halus atau terlihat lebih bersih.
- Melakukannya tanpa sadar atau tanpa alasan yang jelas.
- Alasan lainnya.

**Dampak setelah picking**
- Kulit menjadi merah atau iritasi.
- Kulit terluka atau berdarah.
- Terbentuk koreng baru.
- Terasa perih atau sakit.
- Meninggalkan bekas pada kulit.
- Merasa lega atau puas sementara.
- Merasa menyesal atau kecewa.

**Konteks kejadian**
- Sendirian di kamar.
- Di depan cermin atau kamar mandi.
- Saat menggunakan HP atau menonton.
- Saat belajar atau bekerja.
- Sebelum tidur.
- Saat melakukan aktivitas lain.
- Konteks lainnya.

Semua data tambahan boleh dilewati. Jenis picking tetap wajib untuk menyimpan catatan kejadian.

**Waktu kejadian aktual (`occurredAt`):**
- Setiap catatan picking menyimpan waktu kejadian kanonis pada kolom `occurredAt` (`DateTime? @db.Timestamptz(3)`).
- Waktu kejadian diisi melalui pemilih tanggal/jam sesuai kalender `Asia/Jakarta` (UTC+7).
- Waktu pembuatan record (`createdAt`) dan waktu rekam (`recordedAt`) tidak digunakan sebagai pengganti waktu kejadian untuk keperluan statistik.
- Catatan historis lama dengan `occurredAt = null` dipertahankan apa adanya (tanpa backfill asumtif), sedangkan pencatatan baru memvalidasi waktu kejadian yang valid.

Gunakan radio button untuk pilihan satu jawaban dan checkbox untuk pilihan yang boleh lebih dari satu. Pilihan “Lainnya” tidak mewajibkan pengguna menulis penjelasan panjang.

Tidak ada kewajiban mencatat lokasi jerawat.

Pengguna dapat mengelola riwayat kejadian picking melalui halaman `/picking` yang mendukung:
- Peninjauan daftar kejadian yang diurutkan dari yang terbaru.
- Pengubahan (*edit*) detail kejadian picking milik sendiri.
- Penghapusan (*delete*) catatan secara permanen tanpa merusak integritas sesi Pause terkait.

### D. Pencatatan Keberhasilan Menahan Dorongan

- Pengguna dapat mencatat keberhasilan meskipun tidak memakai Pause (melalui tombol aksi *Catat Keberhasilan* di Dashboard).
- Setiap dorongan yang berhasil dilewati disimpan sebagai keberhasilan tersendiri (model `Resistance`).
- Waktu kejadian disimpan pada kolom `occurredAt` (`DateTime? @db.Timestamptz(3)`) berdasarkan zona waktu `Asia/Jakarta`.
- Semantik keberhasilan mencakup dua sumber:
  1. Catatan mandiri (*Standalone Resistance*) di mana `pauseSessionId` bernilai `null`.
  2. Catatan hasil sesi Pause di mana `pauseSession.outcome` berstatus `SUCCEEDED`. Catatan dari sesi Pause yang belum selesai atau berstatus selain berhasil tidak dianggap sebagai keberhasilan.
- Jika dorongan muncul kembali setelah mereda, pengguna boleh mencatatnya sebagai kejadian baru.
- Jika pengguna berhasil menahan dorongan tetapi kemudian melakukan picking, kedua kejadian tetap tersimpan secara terpisah.
- Riwayat keberhasilan tidak dihapus akibat relapse.
- Pengguna dapat mengelola riwayat keberhasilan melalui halaman `/resistance` untuk meninjau, mengedit metadata (`occurredAt`, `durationSecs`, `note`), atau menghapus catatan.

### E. Dashboard dan Statistik

Dashboard menyajikan data visual perkembangan kebiasaan pengguna secara interaktif, minimalis, dan responsif.

**Fitur Statistik yang Sudah Diimplementasikan:**
1. **Dua Kartu Ringkasan:**
   - Total dorongan yang berhasil dilewati (*Berhasil Menahan*).
   - Total kejadian picking (*Kejadian Picking*).
   - Nilai ringkasan selalu sinkron dengan akumulasi titik pada grafik periode terkait.
2. **Grafik Garis Tren (Dua Seri Data):**
   - Menggunakan library Recharts v3 dengan dua seri garis yang kontras: Teal (`#0f766e`) untuk keberhasilan menahan dan Rose (`#e11d48`) untuk kejadian picking.
   - Sumbu X responsif mobile (mereduksi kepadatan label pada layar sempit tanpa memotong titik data).
   - Tooltip interaktif menampilkan nama tanggal/bulan lengkap dan nilai kedua seri.
3. **Filter Periode:**
   - **Mode Bulanan:** Pengguna memilih tahun, bulan, serta tanggal awal dan tanggal akhir dalam bulan tersebut. Menghasilkan satu titik data untuk setiap hari dalam rentang yang dipilih.
   - **Mode Tahunan:** Pengguna memilih tahun. Menghasilkan satu titik data untuk setiap bulan pada tahun tersebut.
   - *Perilaku interaksi:* Pengubahan input form tidak langsung mengambil data. Pengambilan data baru hanya dipicu saat pengguna menekan tombol **Tampilkan**. Tampilan grafik dan ringkasan terakhir tetap terlihat selama filter diedit maupun saat data baru sedang dimuat.
4. **Aturan Waktu dan Perhitungan:**
   - Seluruh batasan waktu, kalender, dan tampilan menggunakan zona waktu **`Asia/Jakarta`** (UTC+7) dengan rentang awal inklusif dan akhir eksklusif.
   - Menggunakan `occurredAt` sebagai waktu kejadian aktual. Record dengan `occurredAt = null` tidak dihitung.
   - Keberhasilan hanya menghitung Resistance yang berstatus sukses (standalone atau sesi Pause `SUCCEEDED`).
   - Kejadian picking yang telah dihapus tidak dihitung.
   - *Periode berjalan:* Mode bulanan membatasi hari hingga hari ini (tidak menampilkan tanggal esok sebagai hari selesai); mode tahunan membatasi bulan hingga bulan berjalan.
   - *Kondisi tanpa aktivitas:* Periode tanpa aktivitas tetap menampilkan grafik garis bernilai nol, kartu ringkasan bernilai 0, dan pesan informatif: *"Belum ada aktivitas pada periode ini."*

**Kebutuhan Statistik yang Belum Diimplementasikan:**
- **Mode Mingguan:** PRD menyebutkan ringkasan harian, mingguan, dan bulanan. Saat ini implementasi menyediakan mode Bulanan (titik harian) dan Tahunan (titik bulanan); mode mingguan khusus (misalnya 7 hari terakhir atau per minggu kalender) belum tersedia.
- **Pemicu Paling Sering di Dashboard:** Widget/kartu pola pemicu teratas belum diimplementasikan pada dashboard.
- **Pencapaian dan Streak:** Streak berdasarkan keberhasilan melewati dorongan belum diimplementasikan. Streak tidak hanya bergantung pada hari tanpa picking; keberhasilan menahan dorongan tetap dihargai terpisah meski terjadi relapse. Formulasi definisi teknis streak masih perlu dirumuskan.

### F. Analisis Perilaku

Pengguna dapat membuka bagian analisis saat ingin memahami kebiasaannya.

Analisis awal mencakup:
- Pemicu yang paling sering muncul.
- Emosi yang sering menyertai picking.
- Hubungan antara kekuatan dorongan dan kejadian picking.
- Distribusi durasi picking.
- Alasan yang paling sering dipilih.
- Dampak yang sering dilaporkan.
- Konteks yang paling sering terkait dengan kejadian.

Analisis hanya menggunakan data yang benar-benar tersedia. Data kosong tidak boleh dianggap sebagai jawaban “tidak ada”.

## 4. Prinsip UI/UX

- Minimalis dan bersih.
- Mobile-first, dioptimalkan untuk penggunaan satu tangan di HP.
- Navigasi: kebutuhan desain menargetkan *bottom navigation*; implementasi saat ini menggunakan navigasi kartu terpusat di Dashboard dengan tombol kembali pada halaman anak.
- Tombol Pause selalu mudah dijangkau dari dashboard.
- Formulir singkat dan tidak mengharuskan semua detail diisi (opsional selain jenis picking).
- Pilihan terstruktur (kode stabil) untuk memudahkan pencatatan dan analisis.
- Bahasa tenang, suportif, dan tidak menghakimi.
- Menghindari pengingat notifikasi berkala yang mengganggu. Pengingat yang ada bersifat kontekstual di dalam aplikasi (*in-app prompt*) saat pengguna membuka Dashboard jika ada sesi Pause `PICKED` yang belum dilengkapi detailnya, dengan opsi bebas untuk dilewati (*"Tetap buka dashboard"*).
- Tidak memberikan hukuman atau menghapus riwayat keberhasilan saat relapse.

## 5. Keamanan dan Kepemilikan Data

- Pengguna harus login untuk mengakses data pribadinya.
- Setiap catatan, keberhasilan, dan statistik terikat pada pemiliknya.
- API harus memverifikasi kepemilikan data di server, bukan hanya menyembunyikan data di UI.
- Pengguna tidak boleh membaca, mengubah, atau menghapus data pengguna lain.
- Password harus disimpan dalam bentuk hash yang aman.
- Kredensial dan secret tidak boleh dimasukkan ke repositori.

## 6. Di Luar Cakupan MVP

Untuk menjaga fokus, versi pertama tidak mencakup:
- Pelacakan setiap jerawat secara individual.
- Riwayat penyembuhan setiap titik kulit.
- Galeri perkembangan kulit.
- Sistem level atau gamifikasi yang kompleks.
- Pengingat rutin yang mengganggu.

Fitur tersebut dapat dipertimbangkan setelah MVP digunakan dan kebutuhan nyata mulai terlihat.

## 7. Kriteria Selesai MVP

MVP dianggap memenuhi tujuan awal jika:
1. Pengguna dapat mendaftar, login, dan logout (kebutuhan produk: alur logout lengkap; status saat ini: kriteria belum sepenuhnya terpenuhi karena tombol/tautan logout pada antarmuka pengguna belum tersedia, meskipun fungsi backend `signOut` telah ada).
2. Pengguna dapat menjalankan Pause dengan durasi yang tersedia.
3. Pengguna dapat mencatat hasil setelah Pause.
4. Pengguna dapat mencatat kejadian picking dengan jenis wajib dan detail opsional.
5. Pengguna dapat mencatat keberhasilan tanpa harus menggunakan Pause.
6. Keberhasilan dan relapse tersimpan tanpa saling menghapus.
7. Dashboard menampilkan ringkasan data yang benar.
8. Analisis dapat menghitung frekuensi pilihan dari catatan pengguna (kebutuhan produk: analisis agregasi pola dan frekuensi; status saat ini: kriteria belum terpenuhi karena fitur analisis perilaku belum diimplementasikan).
9. Data antar-pengguna terisolasi dengan benar.
10. Alur utama nyaman digunakan dari HP.

## 8. Status Implementasi dan Verifikasi

Status berikut merangkum audit kode. “Sudah diimplementasikan” berarti alur terkait ditemukan pada kode, bukan berarti sudah terverifikasi di browser atau terhadap database nyata.

| Kebutuhan | Status implementasi berdasarkan audit kode | Status verifikasi |
|---|---|---|
| Pause, termasuk pemilihan hasil | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Pencatatan picking dari tindak lanjut Pause dan secara manual | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Pencatatan keberhasilan dari Pause dan secara manual | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Riwayat picking dengan edit dan hapus | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Riwayat keberhasilan dengan edit dan hapus, termasuk catatan yang terhubung ke Pause | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Validasi server dan pemeriksaan kepemilikan data pada jalur yang diaudit | Sudah diimplementasikan pada jalur tersebut | Lolos pengujian unit mock; integrasi Server Action dengan transaksi Prisma terhadap database nyata belum diverifikasi end-to-end. |
| Ringkasan progres dan statistik pada Dashboard | Sudah diimplementasikan untuk mode Bulanan (titik harian) dan Tahunan (titik bulanan) menggunakan Recharts v3 | Lolos pengujian unit komprehensif (103 assertions untuk query bounds, konversi zona waktu Asia/Jakarta, dan agregasi data); belum diverifikasi end-to-end di browser. |
| Pemicu paling sering di Dashboard | Belum diimplementasikan | — |
| Streak dan pencapaian keberhasilan | Belum diimplementasikan (definisi dan formulasi teknis belum dirumuskan) | — |
| Analisis perilaku berdasarkan data picking dan keberhasilan | Belum diimplementasikan | — |
| Navigasi utama menggunakan bottom navigation | Belum diimplementasikan (saat ini menggunakan pola Hub & Spoke melalui kartu aksi pada Dashboard) | — |
| UI logout yang dapat digunakan pengguna | Belum diimplementasikan (fungsi `signOut` tersedia di server backend `src/auth.ts`, belum ada tombol/tautan pada antarmuka pengguna) | — |
| Pengalaman penggunaan aktual di browser dan perangkat mobile | — | Belum diverifikasi secara manual maupun E2E di perangkat nyata. |
| Alur login, registrasi, reset password, serta autentikasi Google dan email/password secara end-to-end | Implementasi kode tersedia pada jalur terkait | Belum diverifikasi end-to-end di lingkungan produksi (layanan pihak ketiga seperti Resend dan Google OAuth live belum diuji). |

### Statistik dan keputusan yang masih terbuka

1. **Timestamp Kanonis (`occurredAt`):**
   - Kebutuhan timestamp kanonis telah diselesaikan melalui migrasi database `20261017104500_add_occurrence_timestamps`, yang menambahkan kolom `occurredAt` bertipe `TIMESTAMPTZ(3) NULL` serta indeks komposit `(userId, occurredAt)` pada tabel `PickingEvent` dan `Resistance`.
   - Perhitungan statistik dashboard saat ini mengecualikan record lama yang memiliki `occurredAt = null`.
2. **Statistik Terimplementasi:**
   - Grafik garis ganda (Keberhasilan Menahan Dorongan vs Kejadian Picking) dan dua kartu metrik ringkasan telah diimplementasikan untuk mode **Bulanan** (rentang tanggal dalam bulan bersangkutan dengan agregasi harian) dan mode **Tahunan** (seluruh bulan dalam tahun bersangkutan).
   - Seluruh logika tanggal dan batasan waktu dipatok secara ketat pada zona waktu **`Asia/Jakarta`** (UTC+7).
3. **Keputusan Produk yang Masih Terbuka:**
   - **Formulasi Streak dan Pencapaian:** Bagaimana mendefinisikan dan menghitung streak keberhasilan secara teknis agar adil dan tidak mematikan motivasi saat terjadi relapse (mengingat prinsip inti Jerawat Hunter menghargai setiap keberhasilan menahan dorongan secara terpisah).
   - **Pemicu Paling Sering di Dashboard:** Menentukan format visualisasi (misal: badge tag frekuensi, progress bar proporsional, atau daftar ringkas) dan apakah dibatasi pada 3 atau 5 pemicu teratas.
   - **Kebutuhan Mode Mingguan Khusus:** Memutuskan apakah aplikasi memerlukan filter mode Mingguan terpisah (misalnya 7 hari bergulir atau Senin-Minggu) di samping kustomisasi rentang tanggal harian yang sudah ada pada mode Bulanan.
   - **Transisi Navigasi:** Menentukan timeline transisi dari navigasi kartu Hub & Spoke saat ini menuju *bottom navigation* tetap pada perangkat mobile.
   - **Penempatan UI Logout:** Menentukan lokasi tombol/menu keluar bagi pengguna (misalnya pada header profil, menu pengaturan, atau kartu terpisah).

### Catatan risiko teknis untuk tindak lanjut

- **Strategi Sesi Auth.js:** `auth.config.ts` dikonfigurasi dengan `session: { strategy: "jwt" }` karena Auth.js v5 mewajibkan strategi JWT saat menggunakan penyedia kredensial (email & password). Pada saat yang sama, `PrismaAdapter` tetap dipasang untuk sinkronisasi akun OAuth dan token database. Penyesuaian ini menjawab perbedaan catatan pada `TECHNICAL_DECISIONS.md`.
- **Idempotensi Pencatatan:** Pencatatan Resistance manual belum memiliki mekanisme idempotensi persisten; percobaan pengiriman ulang (retry) akibat kendala koneksi berpotensi menimbulkan duplikasi record.
- **Konsistensi State Follow-up:** Penghapusan `Resistance` yang terhubung dengan Pause mengembalikan `outcome` sesi ke `null` dalam transaksi database. Perlu audit berkala untuk memastikan tidak terjadi status inkonsisten (seperti `pickingFollowUpCompleted = true` ketika data terkait dihapus).
- **Penanganan Record Null Timestamp:** Catatan historis lama dengan `occurredAt = null` tidak muncul dalam grafik statistik berbasis periode; strategi migrasi atau backfill data lama dapat dipertimbangkan jika diperlukan di masa depan.


## 9. Strategi Pengembangan

Pengembangan dilakukan bertahap:
1. Fondasi proyek, database, dan autentikasi.
2. Struktur halaman dan navigasi.
3. Dashboard dan fitur Pause.
4. Pencatatan picking serta keberhasilan menahan dorongan.
5. Statistik dan analisis.
6. Pengujian, perbaikan, dan deployment.

Detail yang belum ditentukan akan diputuskan ketika dibutuhkan oleh implementasi. Perubahan kebutuhan dicatat dan PRD diperbarui bila perlu.
