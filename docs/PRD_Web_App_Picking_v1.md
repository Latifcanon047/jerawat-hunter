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
5. Tautan ke analisis pola picking tersedia pada Dashboard. Ringkasan pemicu teratas di Dashboard masih belum tersedia.

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

**Pengingat saat deadline Pause:**
- Deadline dihitung dari `startedAt + durationSecs`. Pengingat normal hanya diproses setelah status akhir sesi dikonfirmasi server, dengan `endedEarly = false` dan belum ada hasil (`outcome = null`). Sesi yang diakhiri lebih awal tidak memicu pengingat normal.
- Monitor pengingat berada pada provider client di layout root agar tetap aktif selama navigasi antarhalaman aplikasi. Pemeriksaan deadline memakai timer client dan pemeriksaan ulang saat halaman kembali terlihat; server tetap menjadi sumber konfirmasi status sesi.
- Audio aktif secara default dengan pilihan awal suara lembut. Pengguna dapat memilih satu dari tiga audio yang tersedia atau menonaktifkannya. Preferensi disimpan di `localStorage`, divalidasi saat dibaca, dan menggunakan nilai default jika data tidak tersedia atau tidak valid.
- Pada satu sesi, aplikasi mencoba audio otomatis satu kali. Jika pemutaran otomatis gagal, pengguna dapat memulai pemutaran manual; audio yang sedang berjalan dapat dihentikan melalui tombol **Matikan Suara**. Percobaan audio dan notifikasi dilakukan secara independen.
- Izin notifikasi diminta melalui tombol khusus di pengaturan Pengingat Pause. Dengan izin tersedia, aplikasi menyerahkan notifikasi sistem melalui service worker. Klik notifikasi memprioritaskan tab sumber yang masih tersedia, kemudian mencoba tab aplikasi se-origin lain, dan membuka `/pause` di tab baru hanya sebagai upaya terakhir. Jika ID tab sumber tidak dapat diperoleh, pemilihan tab memakai fallback deterministik yang sama. Klik notifikasi tidak memutar ulang audio.
- Marker `localStorage` dan guard client mencegah pemrosesan berulang sebagai upaya terbaik, tetapi tidak memberikan eksklusivitas lintas-tab yang atomik. Marker disimpan sebelum percobaan pengiriman; jika marker berhasil disimpan tetapi audio/notifikasi gagal, pengingat otomatis tidak dicoba ulang pada pemuatan berikutnya. Audio yang gagal dapat dicoba manual pada halaman yang masih menampilkan status kegagalan.
- Pengingat bergantung pada aplikasi yang masih berjalan untuk mendeteksi deadline. Timer dapat diperlambat saat tab di latar belakang; browser atau OS dapat membatasi pemutaran otomatis, tampilan notifikasi, navigasi, maupun fokus tab. Pengingat tidak dijamin ketika browser ditutup atau perangkat tidur. Service worker menangani klik notifikasi, bukan scheduler deadline atau push notification.

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
- Filter periode Bulanan (rentang tanggal dalam bulan) dan Tahunan, serta paginasi.
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
- Pengguna dapat mengelola riwayat keberhasilan melalui halaman `/resistance` untuk meninjau, memfilter periode Bulanan/Tahunan, menavigasi halaman, mengedit metadata (`occurredAt`, `durationSecs`, `note`), atau menghapus catatan.

### E. Dashboard dan Statistik

Dashboard menyajikan data visual perkembangan kebiasaan pengguna secara interaktif, minimalis, dan responsif.

**Fitur Statistik yang Sudah Diimplementasikan:**
1. **Ringkasan Statistik:**
   - Total dorongan yang berhasil dilewati (*Berhasil Menahan*).
   - Total kejadian picking (*Kejadian Picking*).
   - Persentase Keberhasilan dihitung dengan bobot satu poin untuk setiap keberhasilan dan setengah poin untuk setiap kejadian picking: `(jumlah keberhasilan + 0,5 × jumlah picking) / (jumlah keberhasilan + jumlah picking) × 100`. Jika tidak ada aktivitas, nilainya 0%.
   - Kedua jumlah ringkasan selalu sinkron dengan akumulasi titik pada grafik periode terkait. Persentase ditampilkan sebagai metrik visual tambahan.
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
- **Mode Mingguan:** Mode mingguan khusus (misalnya 7 hari terakhir atau per minggu kalender) belum tersedia. Saat ini implementasi menyediakan mode Bulanan (titik harian) dan Tahunan (titik bulanan).
- **Pemicu Paling Sering di Dashboard:** Widget/kartu pola pemicu teratas belum diimplementasikan pada dashboard.
- **Pencapaian dan Streak:** Streak berdasarkan keberhasilan melewati dorongan belum diimplementasikan. Streak tidak hanya bergantung pada hari tanpa picking; keberhasilan menahan dorongan tetap dihargai terpisah meski terjadi relapse. Formulasi definisi teknis streak masih perlu dirumuskan.

### F. Analisis Perilaku

Halaman **Analisis Pola Picking** tersedia melalui Dashboard pada `/picking/analysis`. Implementasi saat ini menganalisis catatan `PickingEvent` milik pengguna pada periode Bulanan (rentang tanggal dalam satu bulan) atau Tahunan, dan menyajikan tujuh kelompok: pemicu, emosi, kekuatan dorongan, durasi picking, alasan, dampak, dan konteks. Pilihan di tiap kelompok menampilkan hitungan dan proporsi terhadap pilihan dengan hitungan tertinggi dalam kelompok tersebut; kelompok tanpa data tetap menampilkan pilihan dengan hitungan nol.

Analisis menggunakan `occurredAt` sebagai waktu kejadian dan tidak memasukkan catatan dengan `occurredAt = null`. Analisis dibatasi pada data picking; belum tersedia hubungan statistik antara kekuatan dorongan dan hasil menahan/picking, agregasi gabungan dengan data Resistance, maupun ringkasan pemicu teratas langsung di Dashboard. Data yang tidak diisi tetap dibedakan dari pilihan yang dicatat.

### G. Pemantauan Jerawat

**Tujuan:** Membantu pengguna mencatat dan memantau perkembangan setiap jerawat atau koreng secara individual, termasuk perjalanan menuju sembuh, dengan bahasa yang tenang dan tidak menghakimi.

**Kebutuhan produk**
- Halaman `/acne-tracking` mengikuti navigasi aplikasi yang sudah ada.
- Catatan dibagi menjadi **Aktif** dan **Riwayat sembuh**. Satu catatan mewakili satu jerawat atau koreng. Daftar menampilkan nama, lokasi, tanggal mulai, dan status.
- Membuat catatan memerlukan nama dan satu lokasi. Tanggal mulai wajib diisi, nilai awalnya tanggal saat ini, dan tanggal di masa depan tidak diperbolehkan. Foto bersifat opsional.
- Lokasi yang disepakati untuk fitur ini terbatas pada sepuluh pilihan wajah: dahi, pelipis kiri, pelipis kanan, hidung, pipi kiri, pipi kanan, sekitar mulut, dagu, rahang kiri, dan rahang kanan. Leher tidak termasuk dalam keputusan ini; lokasi tambahan memerlukan keputusan pengguna. PRD sebelumnya belum menetapkan pilihan lokasi untuk Pemantauan Jerawat.
- Pengguna dapat membuka detail, mengedit nama/lokasi/tanggal mulai termasuk pada catatan sembuh, dan menghapus catatan setelah konfirmasi. Edit metadata catatan `HEALED` tidak mengaktifkannya kembali atau mengubah tanggal sembuh.
- Pengguna dapat menandai catatan aktif sebagai sembuh. Catatan berpindah ke Riwayat sembuh; tanggal mulai, status, tanggal sembuh, dan foto yang masih terkait tetap konsisten.
- Jika foto disertakan, pengguna menandai tepat satu titik jerawat dengan lingkaran merah. Tanpa foto tidak ada penanda. Penggantian foto memerlukan penanda baru. Foto dapat ditinjau dari detail dan diperbesar sesuai kemampuan UI yang disetujui.
- Foto merupakan aset privat: akses dan operasi foto hanya untuk pengguna yang berwenang atas catatan. Penghapusan atau penggantian catatan harus mengikuti lifecycle dan cleanup aset yang dirancang; perilaku yang belum dipastikan tidak dianggap sebagai janji produk.

**Kebutuhan keandalan (catatan teknis, bukan detail yang ditampilkan kepada pengguna)**
- Create dan operasi foto memerlukan idempotency agar pengiriman ulang permintaan yang sama tidak membuat catatan atau operasi foto ganda.
- Server memvalidasi input dan memverifikasi autentikasi serta kepemilikan data pada setiap operasi.
- Kegagalan atau status upload/cleanup yang belum pasti harus ditangani tanpa menyatakan aset berhasil dihapus atau ditautkan sebelum statusnya dapat dipastikan.

## 4. Prinsip UI/UX

- Minimalis dan bersih.
- Mobile-first, dioptimalkan untuk penggunaan satu tangan di HP.
- Navigasi: kebutuhan desain menargetkan *bottom navigation*; implementasi saat ini menggunakan navigasi kartu terpusat di Dashboard dengan tombol kembali pada halaman anak.
- Tombol Pause selalu mudah dijangkau dari dashboard.
- Formulir singkat dan tidak mengharuskan semua detail diisi (opsional selain jenis picking).
- Pilihan terstruktur (kode stabil) untuk memudahkan pencatatan dan analisis.
- Bahasa tenang, suportif, dan tidak menghakimi.
- Menghindari pengingat notifikasi berkala yang mengganggu. Pengingat yang ada bersifat kontekstual di dalam aplikasi (*in-app prompt*) saat pengguna membuka Dashboard jika ada sesi Pause `PICKED` yang belum dilengkapi detailnya, dengan opsi bebas untuk dilewati (*"Tetap buka dashboard"*).
- Pengingat deadline Pause bersifat kontekstual: aplikasi mencoba satu pemutaran audio otomatis dan notifikasi sistem jika didukung dan diizinkan pengguna; preferensi audio dapat dikelola di halaman Pause. Perilaku dan keterbatasan teknis pengingat dijelaskan pada bagian Fitur Pause.
- Tidak memberikan hukuman atau menghapus riwayat keberhasilan saat relapse.

## 5. Keamanan dan Kepemilikan Data

- Pengguna harus login untuk mengakses data pribadinya.
- Setiap catatan, keberhasilan, dan statistik terikat pada pemiliknya.
- API harus memverifikasi kepemilikan data di server, bukan hanya menyembunyikan data di UI.
- Pengguna tidak boleh membaca, mengubah, atau menghapus data pengguna lain.
- Foto Pemantauan Jerawat diperlakukan sebagai aset privat; penayangan, penggantian, dan penghapusan harus melalui otorisasi pemilik serta lifecycle aset yang terkendali.
- Password harus disimpan dalam bentuk hash yang aman.
- Kredensial dan secret tidak boleh dimasukkan ke repositori.

## 6. Di Luar Cakupan MVP

Untuk menjaga fokus, versi pertama tidak mencakup:
- Galeri perkembangan kulit atau timeline banyak foto untuk satu catatan. Keputusan fitur Pemantauan Jerawat kini mencakup catatan individual dan riwayat sembuh, dengan foto opsional pada catatan; ini memperbarui batas cakupan yang lebih lama pada daftar ini.
- Sistem level atau gamifikasi yang kompleks.
- Pengingat rutin yang mengganggu.

Fitur tersebut dapat dipertimbangkan setelah MVP digunakan dan kebutuhan nyata mulai terlihat.

## 7. Kriteria Selesai MVP

MVP dianggap memenuhi tujuan awal jika:
1. Pengguna dapat mendaftar, login, dan logout.
2. Pengguna dapat menjalankan Pause dengan durasi yang tersedia.
3. Pengguna dapat mencatat hasil setelah Pause.
4. Pengguna dapat mencatat kejadian picking dengan jenis wajib dan detail opsional.
5. Pengguna dapat mencatat keberhasilan tanpa harus menggunakan Pause.
6. Keberhasilan dan relapse tersimpan tanpa saling menghapus.
7. Dashboard menampilkan ringkasan data yang benar.
8. Analisis dapat menghitung frekuensi pilihan dari catatan pengguna.
9. Data antar-pengguna terisolasi dengan benar.
10. Alur utama nyaman digunakan dari HP.

**Kriteria penerimaan Pemantauan Jerawat**
1. Pengguna dapat melihat catatan Aktif dan Riwayat sembuh, serta membuka detail setiap catatan.
2. Pengguna dapat membuat catatan dengan nama, lokasi, dan tanggal mulai wajib; tanggal awal formulir adalah tanggal saat ini dan tanggal masa depan ditolak.
3. Lokasi yang tersedia tepat sepuluh pilihan wajah yang tercantum pada bagian Pemantauan Jerawat.
4. Pengguna dapat mengedit metadata tanpa mengubah status sembuh/tanggal sembuh, serta menandai catatan aktif sebagai sembuh.
5. Penghapusan catatan meminta konfirmasi dan menjaga lifecycle aset foto.
6. Foto opsional; jika digunakan, satu penanda merah wajib disimpan bersama foto dan penanda baru diperlukan saat foto diganti. Foto ditinjau dari detail sebagai aset privat.

## 8. Status Implementasi dan Verifikasi

Status berikut merangkum audit kode. **Terimplementasi** berarti jalur implementasi ditemukan; **terimplementasi, belum terverifikasi** berarti jalur ada tetapi perilaku runtime belum dibuktikan; **sebagian terimplementasi** berarti hanya sebagian kebutuhan tersedia; **belum terimplementasi** berarti implementasi tidak ditemukan; **bermasalah** berarti ada kegagalan atau ketidaksesuaian konkret. Status fitur Pemantauan Jerawat mempertimbangkan kode yang diperiksa dan laporan runtime terbaru; bukan pengganti pengujian end-to-end.

| Kebutuhan | Status implementasi berdasarkan audit kode | Status verifikasi |
|---|---|---|
| Pause, termasuk pemilihan hasil | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Pencatatan picking dari tindak lanjut Pause dan secara manual | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Pencatatan keberhasilan dari Pause dan secara manual | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Riwayat picking dengan edit dan hapus | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Riwayat keberhasilan dengan edit dan hapus, termasuk catatan yang terhubung ke Pause | Sudah diimplementasikan | Lolos pengujian unit logic; belum diverifikasi end-to-end di browser atau terhadap database nyata. |
| Validasi server dan pemeriksaan kepemilikan data pada jalur yang diaudit | Sudah diimplementasikan pada jalur tersebut | Lolos pengujian unit mock; integrasi Server Action dengan transaksi Prisma terhadap database nyata belum diverifikasi end-to-end. |
| Ringkasan progres dan statistik pada Dashboard | Sudah diimplementasikan untuk mode Bulanan (titik harian) dan Tahunan (titik bulanan) menggunakan Recharts v3; Dashboard menampilkan dua total dan persentase keberhasilan berbobot | Tes service statistik dan validasi: 15/15 lulus pada audit sinkronisasi PRD; UI belum diverifikasi end-to-end di browser. |
| Persentase Keberhasilan Dashboard | Sudah diimplementasikan dengan rumus berbobot yang dijelaskan pada bagian Statistik | Tes rumus dan geometri indikator lulus, tetapi 2 assertion warna pada `tests/success-percentage.test.mjs` gagal karena ekspektasi warna tes berbeda dari level yang dikembalikan implementasi. Perlu diselaraskan; UI belum diverifikasi manual. |
| Pemicu paling sering di Dashboard | Belum diimplementasikan | — |
| Streak dan pencapaian keberhasilan | Belum diimplementasikan (definisi dan formulasi teknis belum dirumuskan) | — |
| Analisis pola picking | Sudah diimplementasikan pada `/picking/analysis` untuk tujuh kelompok data picking, dengan filter Bulanan dan Tahunan; belum menganalisis data Resistance atau hubungan antara dorongan dan hasil | Tes service analisis: 19/19 lulus pada audit sinkronisasi PRD; belum diverifikasi end-to-end di browser. |
| Navigasi utama menggunakan bottom navigation | Belum diimplementasikan (saat ini menggunakan pola Hub & Spoke melalui kartu aksi pada Dashboard) | — |
| UI logout yang dapat digunakan pengguna | Sudah diimplementasikan pada header Dashboard dengan dialog konfirmasi dan aksi server | Tes header/logout dan proteksi rute: 7/7 lulus pada audit sinkronisasi PRD; alur belum diverifikasi end-to-end di lingkungan produksi. |
| Pengingat deadline Pause: audio, preferensi lokal, izin/notifikasi sistem, dan navigasi klik notifikasi | Sudah diimplementasikan; detail perilaku dan batasannya dijelaskan pada bagian Fitur Pause | Tes Pause/reminder, termasuk klik service worker: 119/119 lulus pada audit sinkronisasi PRD. Uji manual sebelumnya dilaporkan berhasil untuk pengingat; perilaku terbaru yang memprioritaskan tab sumber saat klik notifikasi masih menunggu pengujian manual pengguna. |
| Pengalaman keseluruhan di browser dan perangkat mobile | — | Belum diverifikasi end-to-end pada seluruh alur dan perangkat nyata. |
| Alur login, registrasi, reset password, serta autentikasi Google dan email/password secara end-to-end | Implementasi kode tersedia pada jalur terkait | Belum diverifikasi end-to-end di lingkungan produksi (layanan pihak ketiga seperti Resend dan Google OAuth live belum diuji). |
| Halaman dan daftar Pemantauan Jerawat: filter Aktif/Riwayat sembuh, ringkasan catatan, dan detail | Terimplementasi, belum terverifikasi menyeluruh; pengguna melaporkan halaman testing dapat menampilkan daftar | Laporan runtime mengonfirmasi daftar tampil setelah migration testing; seluruh interaksi detail belum diverifikasi end-to-end secara independen. |
| Lokasi wajah dan validasi nama/tanggal | Sebagian terimplementasi: sepuluh lokasi, nama wajib, dan validasi tanggal masa depan tersedia. Formulir create membiarkan tanggal kosong dan server mengisinya dengan tanggal Jakarta saat ini; ini belum sama dengan kebutuhan produk bahwa field wajib dan nilai awal sudah terisi. | Tes validasi terkait tersedia; perilaku default tanggal di browser belum diverifikasi. |
| Create catatan dan idempotency create | Bermasalah: endpoint, validasi, ledger idempotency, dan transaksi tersedia, tetapi pengguna melaporkan tidak dapat membuat catatan; penyebab runtime belum dikonfirmasi dan keberhasilan create belum dibuktikan. | Belum ada percobaan manual create yang berhasil. Diagnosis server terbatas mencatat kode/metadata error Prisma tanpa payload pribadi; log dari percobaan berikutnya masih diperlukan. |
| Edit metadata, termasuk mempertahankan status dan tanggal sembuh | Terimplementasi, belum terverifikasi; server hanya mengubah nama, lokasi, dan tanggal mulai, bukan status atau tanggal sembuh. | Jalur transaksi tersedia; belum ada verifikasi runtime end-to-end yang dilaporkan. |
| Tandai sembuh dan pindah ke Riwayat sembuh | Terimplementasi, belum terverifikasi; operasi server mengubah status/tanggal sembuh dan UI meminta konfirmasi. | Belum diverifikasi end-to-end pada database testing. |
| Hapus catatan dengan konfirmasi | Sebagian terimplementasi: endpoint DELETE tersedia dan menjadwalkan cleanup aset, tetapi UI yang diaudit tidak menyediakan aksi hapus atau dialog konfirmasi. | Belum diverifikasi end-to-end. |
| Upload foto opsional saat create, upload foto dari API, dan penanda titik | Sebagian terimplementasi: server menerima foto dan memvalidasi satu pasangan koordinat penanda, tetapi form UI yang diaudit tidak menawarkan upload atau pemilihan penanda. | Belum diverifikasi end-to-end. |
| Detail foto, pembesaran, dan penggantian dengan penanda baru | Sebagian terimplementasi: endpoint baca/ganti/hapus foto dan validasi penanda ada; UI detail hanya menyatakan foto tersimpan/belum ada dan tidak menampilkan atau memperbesar gambar maupun menawarkan penggantian. | Belum diverifikasi end-to-end. |
| Privasi dan otorisasi catatan/foto | Terimplementasi pada jalur server yang diaudit: operasi membatasi query ke `userId`; endpoint foto memerlukan autentikasi pemilik dan menyajikan aset melalui URL privat bertenggat. | Belum diverifikasi dengan pengujian akses lintas pengguna di runtime. |
| Idempotency operasi foto dan lifecycle cleanup | Sebagian terimplementasi: ledger foto, intent upload, dan pencatatan cleanup digunakan oleh API; tidak ditemukan worker/consumer repository yang memproses cleanup job. | Upload, recovery, dan cleanup belum diverifikasi end-to-end; pemrosesan cleanup di luar repository belum dipastikan. |

### Statistik dan keputusan yang masih terbuka

1. **Timestamp Kanonis (`occurredAt`):**
   - Kebutuhan timestamp kanonis telah diselesaikan melalui migrasi database `20261017104500_add_occurrence_timestamps`, yang menambahkan kolom `occurredAt` bertipe `TIMESTAMPTZ(3) NULL` serta indeks komposit `(userId, occurredAt)` pada tabel `PickingEvent` dan `Resistance`.
   - Statistik Dashboard dan Analisis Pola Picking saat ini mengecualikan record lama yang memiliki `occurredAt = null`.
2. **Statistik Terimplementasi:**
   - Grafik garis ganda (Keberhasilan Menahan Dorongan vs Kejadian Picking), dua kartu jumlah, dan indikator persentase keberhasilan telah diimplementasikan untuk mode **Bulanan** (rentang tanggal dalam bulan bersangkutan dengan agregasi harian) dan mode **Tahunan** (seluruh bulan dalam tahun bersangkutan).
   - Seluruh logika tanggal dan batasan waktu dipatok secara ketat pada zona waktu **`Asia/Jakarta`** (UTC+7).
3. **Keputusan Produk yang Masih Terbuka:**
   - **Formulasi Streak dan Pencapaian:** Bagaimana mendefinisikan dan menghitung streak keberhasilan secara teknis agar adil dan tidak mematikan motivasi saat terjadi relapse (mengingat prinsip inti Jerawat Hunter menghargai setiap keberhasilan menahan dorongan secara terpisah).
   - **Pemicu Paling Sering di Dashboard:** Menentukan format visualisasi (misal: badge tag frekuensi, progress bar proporsional, atau daftar ringkas) dan apakah dibatasi pada 3 atau 5 pemicu teratas.
   - **Kebutuhan Mode Mingguan Khusus:** Memutuskan apakah aplikasi memerlukan filter mode Mingguan terpisah (misalnya 7 hari bergulir atau Senin-Minggu) di samping kustomisasi rentang tanggal harian yang sudah ada pada mode Bulanan.
   - **Transisi Navigasi:** Menentukan timeline transisi dari navigasi kartu Hub & Spoke saat ini menuju *bottom navigation* tetap pada perangkat mobile.

### Catatan risiko teknis untuk tindak lanjut

- **Strategi Sesi Auth.js:** `auth.config.ts` dikonfigurasi dengan `session: { strategy: "jwt" }` karena Auth.js v5 mewajibkan strategi JWT saat menggunakan penyedia kredensial (email & password). Pada saat yang sama, `PrismaAdapter` tetap dipasang untuk sinkronisasi akun OAuth dan token database. Penyesuaian ini menjawab perbedaan catatan pada `TECHNICAL_DECISIONS.md`.
- **Idempotensi Pencatatan:** Pencatatan Resistance manual belum memiliki mekanisme idempotensi persisten; percobaan pengiriman ulang (retry) akibat kendala koneksi berpotensi menimbulkan duplikasi record.
- **Semantik Penghapusan Catatan Terkait Pause:** Penghapusan `Resistance` yang terhubung dengan Pause mengembalikan `outcome` sesi ke `null` dalam transaksi database agar pengguna dapat memilih hasil lagi. Sebaliknya, penghapusan `PickingEvent` setelah tindak lanjut ditandai selesai mempertahankan `pickingFollowUpCompleted = true` agar prompt tindak lanjut tidak muncul kembali. Perilaku ini merupakan aturan produk yang perlu dipertahankan saat perubahan terkait dibuat.
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
