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

Dashboard adalah halaman utama dengan desain minimalis dan bersih.

Prioritas:
1. Tombol Pause yang mudah dijangkau.
2. Ringkasan progres singkat.
3. Statistik keberhasilan menahan dorongan.
4. Ringkasan kejadian picking dan pola pemicu.

Navigasi utama menggunakan bottom navigation.

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

Jika pengguna masih menahan diri, aplikasi memprioritaskan tawaran mengulangi Pause, tetapi pengguna tetap boleh berhenti.

Jika pengguna akhirnya melakukan picking, aplikasi menawarkan pencatatan kejadian.

Pengguna tetap boleh mencatat keberhasilan melewati dorongan meskipun tidak menggunakan Pause.

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

Gunakan radio button untuk pilihan satu jawaban dan checkbox untuk pilihan yang boleh lebih dari satu. Pilihan “Lainnya” tidak mewajibkan pengguna menulis penjelasan panjang.

Tidak ada kewajiban mencatat lokasi jerawat.

### D. Pencatatan Keberhasilan Menahan Dorongan

- Pengguna dapat mencatat keberhasilan meskipun tidak memakai Pause.
- Setiap dorongan yang berhasil dilewati disimpan sebagai keberhasilan tersendiri.
- Jika dorongan muncul kembali setelah mereda, pengguna boleh mencatatnya sebagai kejadian baru.
- Jika pengguna berhasil menahan dorongan tetapi kemudian melakukan picking, kedua kejadian tetap tersimpan.
- Riwayat keberhasilan tidak dihapus akibat relapse.

### E. Dashboard dan Statistik

Dashboard menampilkan ringkasan:
- Jumlah kejadian picking.
- Jumlah dorongan yang berhasil dilewati.
- Pencapaian dan streak berdasarkan keberhasilan melewati dorongan.
- Pemicu yang paling sering muncul.
- Ringkasan harian, mingguan, dan bulanan.

Streak tidak hanya bergantung pada jumlah hari tanpa picking. Keberhasilan melewati dorongan tetap dihargai secara terpisah, meskipun kemudian terjadi relapse.

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
- Mobile-first.
- Navigasi menggunakan bottom navigation.
- Tombol Pause selalu mudah dijangkau dari dashboard.
- Formulir singkat dan tidak mengharuskan semua detail diisi.
- Pilihan terstruktur untuk memudahkan pencatatan dan analisis.
- Bahasa tenang, suportif, dan tidak menghakimi.
- Tidak menggunakan pengingat rutin yang mengganggu.
- Tidak memberikan hukuman atau menghapus pencapaian saat relapse.

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

## 8. Strategi Pengembangan

Pengembangan dilakukan bertahap:
1. Fondasi proyek, database, dan autentikasi.
2. Struktur halaman dan navigasi.
3. Dashboard dan fitur Pause.
4. Pencatatan picking serta keberhasilan menahan dorongan.
5. Statistik dan analisis.
6. Pengujian, perbaikan, dan deployment.

Detail yang belum ditentukan akan diputuskan ketika dibutuhkan oleh implementasi. Perubahan kebutuhan dicatat dan PRD diperbarui bila perlu.
