# Keputusan Teknis — Jerawat Hunter

Dokumen ini mencatat keputusan teknis yang telah disepakati untuk proyek Jerawat Hunter.
Setiap keputusan mencantumkan alasan, konsekuensi, dan hal yang belum pasti (jika ada).

> Terakhir diperbarui: 13 Oktober 2026 (revisi koreksi Prisma 7)
> Acuan utama: `docs/PRD_Web_App_Picking_v1.md`

---

## 0. Runtime dan Package Manager

**Keputusan:**
- **Node.js:** Gunakan Node.js 22 LTS.
- **Package manager:** npm.

**Versi terverifikasi dari npm registry (13 Oktober 2026):**
- Node.js 22 LTS terbaru: `22.23.3`
- npm (mesin saat ini): `11.6.2`

**Catatan Node.js di mesin saat ini:** Mesin pengembang saat ini menjalankan `v24.12.0`. Versi ini kompatibel dengan Next.js 16 dan Prisma 7. Untuk konsistensi tim atau deployment, gunakan Node.js 22 LTS (`22.23.3`) sebagai versi yang ditetapkan. Gunakan `.nvmrc` atau `engines` di `package.json` untuk mengunci versi.

**Status:** ✅ Disepakati

---

## 1. Bahasa — TypeScript dengan `strict: true`

**Keputusan:** Seluruh kode aplikasi ditulis menggunakan TypeScript. Mode `strict` diaktifkan.

**Konfigurasi wajib di `tsconfig.json`:**
```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

**Alasan:**
- Mencegah bug akibat tipe yang ambigu, terutama pada data pengguna dan query database.
- Prisma menghasilkan tipe otomatis dari schema — TypeScript strict memastikan tipe tersebut digunakan dengan benar.
- Mode strict mencakup: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, dll.

**Konsekuensi:**
- Semua variabel dan parameter harus memiliki tipe eksplisit atau dapat diinferensi dengan aman.
- Nullable values tidak boleh diakses tanpa pengecekan terlebih dahulu.

**Status:** ✅ Disepakati

---

## 2. Framework — Next.js dengan App Router

**Keputusan:** Menggunakan Next.js versi stable terbaru dengan App Router (bukan Pages Router).

**Versi terverifikasi dari npm registry (13 Oktober 2026):** `next@16.4.0`

**Alasan:**
- App Router mendukung React Server Components yang memungkinkan query database langsung dari komponen tanpa tambahan API route untuk kasus sederhana.
- Struktur layout bersarang cocok untuk navigasi bottom navigation yang didefinisikan di PRD.
- App Router adalah arah resmi Next.js ke depan.

**Konsekuensi:**
- Tidak ada Pages Router (`pages/` directory). Semua halaman ada di `app/` directory.
- Server Components (`async` components) dan Client Components (`'use client'`) harus dibedakan secara eksplisit.

**Status:** ✅ Disepakati

---

## 3. Database — Neon PostgreSQL

**Keputusan:** Menggunakan Neon PostgreSQL sebagai database utama.

**Alasan:**
- Ditetapkan di PRD.
- Neon adalah PostgreSQL serverless yang kompatibel dengan deployment Vercel — koneksi melalui connection pooling (PgBouncer) tersedia secara native.

**Hal yang perlu disiapkan:**
- Akun Neon dan project baru untuk mendapatkan `DATABASE_URL` (connection string dengan pooling).
- `DIRECT_URL` (non-pooled) diperlukan oleh Prisma Migrate — lihat Keputusan 4 untuk detail konfigurasi Prisma 7.
- Kedua URL wajib disimpan di `.env.local` dan **tidak boleh masuk Git**.

**Status:** ✅ Disepakati

---

## 4. ORM — Prisma 7

**Keputusan:** Menggunakan Prisma generasi 7 sebagai ORM. Versi yang ditetapkan: `prisma@7` dan `@prisma/client@7`.

**Versi terverifikasi dari npm registry (13 Oktober 2026):**
- `prisma@7` terbaru: `7.10.0`
- `@prisma/client@7` terbaru: `7.10.0`
- `@prisma/adapter-pg`: `7.10.0`
- `pg` (PostgreSQL driver): `8.23.1`
- `@types/pg`: `8.23.1`

> Versi `prisma@8` yang tersedia (`8.0.0-rc.22`) adalah release candidate dan **tidak digunakan** untuk fondasi proyek ini.

**Alasan memilih Prisma 7 (bukan Prisma 8 RC):**
- Prisma 7 adalah versi stable terakhir — seluruh ekosistem pendukung (adapter, Auth.js) sudah diverifikasi kompatibel.
- Prisma 8 masih dalam tahap release candidate; menggunakannya di fondasi awal meningkatkan risiko breaking changes selama development.
- Prisma 7 menghasilkan type-safe client dari schema — cocok dipadukan dengan TypeScript strict.
- Ada adapter resmi untuk Auth.js (`@auth/prisma-adapter@2.11.3`).

### Perubahan Arsitektur Penting di Prisma 7

Prisma 7 memperkenalkan perubahan arsitektur signifikan dibanding Prisma 6. **Wajib diikuti** berdasarkan dokumentasi resmi Prisma.

#### a. Driver Adapter Wajib

Prisma 7 **tidak lagi berkomunikasi langsung dengan PostgreSQL** melalui engine internal. Driver adapter JavaScript wajib digunakan. Untuk PostgreSQL, kombinasi yang digunakan:

- **`@prisma/adapter-pg`** — adapter resmi Prisma untuk PostgreSQL
- **`pg`** — driver PostgreSQL native untuk Node.js

**Cara inisialisasi `PrismaClient` di Prisma 7:**
```typescript
// src/lib/db.ts
// Import dari path generated — sesuai output di schema.prisma
// (bukan "@prisma/client" seperti di Prisma 6)
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// DATABASE_URL: pooled connection untuk runtime (Neon PgBouncer)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000, // wajib diset — Prisma 7 tidak punya default timeout
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

> ⚠️ **Catatan timeout:** Driver `pg` native tidak memiliki connection timeout default (berbeda dari Prisma 6 yang otomatis 5 detik). `connectionTimeoutMillis` harus dikonfigurasi secara eksplisit.


#### b. File Konfigurasi `prisma.config.ts`

Prisma 7 memperkenalkan file konfigurasi baru `prisma.config.ts` di root proyek. Konfigurasi koneksi database **tidak lagi** menggunakan `env()` di `schema.prisma`.

**`schema.prisma` di Prisma 7:**
```prisma
datasource db {
  provider = "postgresql"
  # url tidak lagi di sini — dipindah ke prisma.config.ts
}

generator client {
  provider = "prisma-client"           # ← provider baru di Prisma 7 (bukan "prisma-client-js")
  output   = "../src/generated/prisma" # ← wajib ada di Prisma 7; menentukan import path
}
```

> ⚠️ **Catatan generator:** `prisma-client-js` masih diterima di Prisma 7 tetapi akan dihapus di rilis mendatang. Gunakan `prisma-client` dari awal. Field `output` kini **wajib** — Prisma Client tidak lagi digenerate ke `node_modules` secara default.

**Import path PrismaClient** menyesuaikan `output` di atas. Karena output adalah `../src/generated/prisma` (relatif dari `prisma/schema.prisma`), file hasil generate berada di `src/generated/prisma/`. Import dari `src/lib/db.ts`:
```typescript
import { PrismaClient } from "../generated/prisma/client";
//                          ↑ relatif dari src/lib/ ke src/generated/prisma/
```

**`prisma.config.ts`** (di root proyek, sejajar `package.json`):
```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // DIRECT_URL digunakan oleh Prisma CLI (prisma migrate, prisma db push).
    // Untuk Neon: gunakan koneksi direct (non-pooled) agar migrate tidak gagal via PgBouncer.
    // Di Prisma 7, tidak ada field "directUrl" di sini — hanya field "url".
    url: env("DIRECT_URL"),
  },
});
```

**Pemisahan koneksi untuk Neon (Prisma 7):**

| Variabel | Jenis | Digunakan oleh |
|----------|-------|----------------|
| `DATABASE_URL` | Pooled (PgBouncer) | Runtime app — driver adapter di `src/lib/db.ts` |
| `DIRECT_URL` | Direct (non-pooled) | Prisma CLI — `prisma.config.ts` (`datasource.url`) |

> ⚠️ **Perbedaan dari Prisma 6:** Di Prisma 6, kedua URL dikonfigurasi di `schema.prisma` menggunakan field `url` dan `directUrl`. Di Prisma 7, `prisma.config.ts` hanya mengenal field `url` — tidak ada `directUrl`. URL yang ada di sana digunakan untuk operasi CLI (migrate). URL runtime dikonfigurasi secara terpisah di `db.ts` melalui driver adapter.

> ⚠️ **Konfigurasi ini perlu diverifikasi ulang saat implementasi**, terutama:
> - Kompatibilitas ESM (Prisma 7 adalah ESM; perlu dicek apakah Next.js 16 memerlukan `"type": "module"`)
> - Kompatibilitas `@auth/prisma-adapter` dengan import path generated Prisma 7
> - TypeScript strict mode dengan tipe yang dihasilkan generator `prisma-client`


#### c. Dependensi yang Diperlukan (Prisma 7 + PostgreSQL)

```bash
# Runtime
npm install @prisma/client@7 @prisma/adapter-pg@7 pg
# Catatan: @prisma/client tetap diinstall sebagai runtime dependency,
# meskipun import dilakukan dari path generated (bukan langsung dari package ini).

# Dev
npm install --save-dev prisma@7 @types/pg dotenv
```

**Status:** ✅ Disepakati — Prisma 7 stable, Prisma 8 RC tidak digunakan

---

## 5. Penyimpanan Pilihan Terstruktur (Multi-select)

**Keputusan:**
- Semua pilihan terstruktur (pemicu, emosi, alasan, dampak, konteks, dll.) disimpan menggunakan **kode stabil** — bukan label UI.
- Label UI bisa berubah sewaktu-waktu; kode yang tersimpan di database harus tetap konsisten.
- Untuk field multi-select yang sesuai, evaluasi penggunaan **PostgreSQL array** (`String[]` di Prisma).

**Contoh pola yang disepakati:**
```typescript
// Di database — disimpan sebagai kode stabil
triggers: ["TEXTURE_FEEL", "MIRROR", "STRESS"]

// Di kode — mapping label didefinisikan di satu tempat
const TRIGGER_LABELS: Record<TriggerCode, string> = {
  TEXTURE_FEEL: "Merasa ada benjolan atau tekstur kulit",
  MIRROR:       "Melihat kulit di cermin",
  STRESS:       "Stres atau cemas",
  // ...
}
```

**Alasan:**
- Kode stabil memungkinkan query analitik yang andal (`WHERE 'STRESS' = ANY(triggers)`).
- Memudahkan penambahan bahasa lain di masa depan tanpa migrasi data.
- Label UI dapat diubah tanpa menyentuh data yang sudah tersimpan.

**Keputusan yang dikonfirmasi saat fase schema:**
- Gunakan `String[]` (PostgreSQL text array) untuk MVP — lebih fleksibel dibanding enum array karena tidak memerlukan migrasi saat ada nilai baru.

**Status:** ✅ Prinsip disepakati — detail implementasi dikonfirmasi saat fase schema

---

## 6. Autentikasi — Auth.js v5 (next-auth@beta) dengan Prisma Adapter

**Keputusan:**
- Menggunakan **Auth.js v5** (`next-auth@beta`) sebagai library autentikasi utama.
- Gunakan **Prisma Adapter** (`@auth/prisma-adapter`) untuk menyimpan sesi dan akun OAuth di database.
- Provider yang didukung: Google OAuth dan Credentials (email/password).

**Versi terverifikasi dari npm registry (13 Oktober 2026):**
- `next-auth@beta`: `5.0.0-beta.32`
- `@auth/prisma-adapter`: `2.11.3`

> ⚠️ **Auth.js v5 masih dalam status beta.** API-nya sudah relatif stabil untuk Next.js App Router, tetapi breaking changes dapat terjadi sebelum rilis stable.

### Verifikasi Penting — Password Reset

Berdasarkan riset terhadap dokumentasi resmi Auth.js dan konfirmasi komunitas (13 Oktober 2026):

> **Auth.js v5 TIDAK menyediakan alur reset password bawaan untuk Credentials provider.**
>
> Reset password harus diimplementasikan secara manual menggunakan:
> - Tabel `PasswordResetToken` di database (token + expiry)
> - Email provider eksternal — **Resend** dicatat sebagai kandidat (lihat Keputusan 6a)
> - Library kriptografi untuk generate token aman (`crypto.randomBytes` dari Node.js built-in)
> - Library hashing password (`bcryptjs`)

**Konsekuensi:**
- Schema database harus menyertakan model `PasswordResetToken`.
- Implementasi reset password adalah pekerjaan tersendiri, dilakukan pada **tahap autentikasi**.
- Password harus di-hash menggunakan `bcryptjs` sebelum disimpan — tidak pernah disimpan dalam bentuk plain text.

**Status:** ✅ Library disepakati — implementasi password reset dikonfirmasi membutuhkan kode kustom

---

## 6a. Email Provider — Kandidat untuk Password Reset

**Keputusan saat ini:** **Resend** dicatat sebagai kandidat email provider untuk implementasi fitur reset password.

**Alasan Resend sebagai kandidat:**
- API sederhana dan cocok untuk integrasi Next.js/TypeScript.
- Memiliki free tier yang cukup untuk development dan MVP.
- Dokumentasi resmi tersedia untuk Next.js App Router + Server Actions.

> ⚠️ **Keputusan final dan konfigurasi email provider dilakukan pada tahap autentikasi — bukan sekarang.** Jangan memasang atau mengonfigurasi package Resend sebelum tahap tersebut dimulai.

**Alternatif yang dapat dievaluasi saat tahap autentikasi:**
- **Nodemailer** — SMTP-based, lebih fleksibel, tidak butuh akun layanan eksternal
- **SendGrid** — cocok untuk skala besar, lebih kompleks untuk setup awal

**Status:** 📌 Kandidat dicatat — keputusan final ditunda ke tahap autentikasi

---

## 7. PauseSession — Lifecycle State

**Keputusan:** Record `PauseSession` dibuat di database **saat sesi Pause dimulai**, bukan saat selesai.

**Alasan:**
- Memastikan data tidak hilang jika pengguna menutup tab atau browser crash.
- Durasi sebenarnya dihitung dari selisih `startedAt` dan `endedAt` (timestamp aktual), bukan dari durasi yang dipilih pengguna.

**Aturan bisnis yang disepakati:**
1. Saat Pause dimulai: record dibuat dengan `endedAt: null`, `outcome: null`.
2. Saat Pause selesai (normal atau dipercepat): `endedAt` dan `outcome` diperbarui.
3. **Sesi dengan `endedAt: null` atau `outcome: null` tidak dihitung sebagai keberhasilan apapun.**
4. Sesi "terbengkalai" (tidak pernah selesai setelah batas waktu tertentu) tidak dihapus, tetapi dikecualikan dari semua kalkulasi statistik.

**Relasi dengan entitas lain:**
- Jika `outcome = SUCCEEDED`: buat record `Resistance` yang terhubung ke sesi ini.
- Jika `outcome = PICKED`: buat record `PickingEvent` yang terhubung ke sesi ini.
- Jika `outcome = STILL_RESISTING`: tidak ada record baru; tampilkan tawaran untuk mengulangi Pause.
- `PickingEvent` dan `Resistance` dapat dibuat **tanpa** `PauseSession` (pengguna boleh mencatat langsung).

**Status:** ✅ Disepakati

---

## 8. Keamanan Data — Pemeriksaan Kepemilikan di Sisi Server

**Keputusan:** Setiap query database yang membaca, mengubah, atau menghapus data pengguna wajib menyertakan pemeriksaan kepemilikan di sisi server.

**Pola wajib:**
```typescript
// Contoh pola yang benar — selalu filter berdasarkan userId dari sesi
const event = await prisma.pickingEvent.findUnique({
  where: {
    id: eventId,
    userId: session.user.id, // ← WAJIB, bukan opsional
  },
});

// Jika null, kembalikan 404 — bukan 403 — untuk mencegah enumeration attack
if (!event) return notFound();
```

**Aturan:**
- `userId` dari sesi aktif **tidak boleh** diambil dari request body atau query parameter klien.
- Selalu ambil `userId` dari sesi server yang telah diverifikasi Auth.js.
- API tidak boleh hanya menyembunyikan data di UI — validasi kepemilikan harus ada di level query.

**Status:** ✅ Disepakati

---

## Ringkasan Status Keputusan

| # | Keputusan | Versi / Detail | Status |
|---|-----------|----------------|--------|
| 0 | Node.js 22 LTS + npm | Node `22.23.3`, npm `11.6.2` | ✅ Disepakati |
| 1 | TypeScript `strict: true` | TypeScript `7.0.2` | ✅ Disepakati |
| 2 | Next.js App Router | `next@16.4.0` | ✅ Disepakati |
| 3 | Neon PostgreSQL | — | ✅ Disepakati |
| 4 | Prisma 7 (bukan Prisma 8 RC) | `prisma@7.10.0`, `@prisma/client@7.10.0` | ✅ Disepakati |
| 5 | Kode stabil untuk pilihan terstruktur | PostgreSQL `String[]` | ✅ Prinsip disepakati |
| 6 | Auth.js v5 beta + Prisma Adapter | `next-auth@5.0.0-beta.32` | ✅ Disepakati |
| 6a | Email provider — Resend (kandidat) | Keputusan final di tahap autentikasi | 📌 Ditunda |
| 7 | PauseSession dibuat saat dimulai | — | ✅ Disepakati |
| 8 | Pemeriksaan kepemilikan di server | — | ✅ Disepakati |

---

## 9. Catatan Inisialisasi Fondasi Proyek (13 Oktober 2026)

Tahap inisialisasi fondasi telah selesai dijalankan dengan perintah dan konfigurasi berikut:

### a. Perintah Setup yang Berhasil Dijalankan
1. Inisialisasi Next.js:
   ```bash
   npx create-next-app@16.4.0 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes
   ```
2. Inisialisasi Git:
   ```bash
   git init
   ```
3. Pembuatan struktur folder dan placeholder:
   - `src/components/ui/`
   - `src/lib/`
   - `src/types/index.ts`
4. Konfigurasi Environment & Ignore:
   - `.env.example` (template tanpa kredensial)
   - `.gitignore` (diperbarui dengan `!.env.example`)
   - `.nvmrc` (dikunci ke `22.23.3`)
5. Script tambahan di `package.json`:
   - `"type-check": "tsc --noEmit"`
   - `"engines": { "node": ">=22.0.0" }`

### b. Hasil Verifikasi Fondasi
- **TypeScript Check (`npm run type-check`):** ✅ Lolos (exit code 0, 0 error)
- **ESLint (`npm run lint`):** ✅ Lolos (exit code 0, 0 error/warning)
- **Production Build (`npm run build`):** ✅ Lolos (exit code 0, terkompilasi dalam 10.9s, static pages 4/4 ter-generate)

---

## 10. Catatan Pemasangan dan Konfigurasi Prisma 7 (13 Oktober 2026)

### a. Catatan Lingkungan Node.js
- **Target Proyek:** Node.js `22.23.3` (LTS) tetap dipertahankan pada `.nvmrc` dan `engines` `package.json`.
- **Runtime Lokal Sementara:** Menggunakan Node.js `v24.12.0` yang aktif di mesin pengembang, terverifikasi kompatibel penuh (`engines` Prisma 7: `^20.19 || ^22.12 || >=24.0`). Instalasi global tidak diubah.

### b. Dependensi yang Dipasang
```bash
npm install @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg@8.23.1
npm install --save-dev prisma@7.10.0 @types/pg@8.23.1 dotenv
```

### c. File Konfigurasi dan Skema
1. **`prisma/schema.prisma`**:
   - Generator: `prisma-client`, output: `../src/generated/prisma`.
   - Datasource: `postgresql`.
   - Model: `User`, `PauseSession`, `PickingEvent`, `Resistance`.
   - Enums: `PauseOutcome`, `PickingType`, `DurationRange`, `ContextType`.
   - Multi-select fields: `triggers`, `emotions`, `reasons`, `impacts` disimpan sebagai `String[]` kode stabil.
2. **`prisma.config.ts`**:
   - Konfigurasi root Prisma 7 dengan `datasource: { url: process.env.DIRECT_URL }`.
3. **`src/lib/db.ts`**:
   - Singleton client Prisma 7 menggunakan `PrismaPg` adapter dari `pg.Pool` dengan timeout 5000 ms.

### d. Hasil Verifikasi
- **Validasi Skema (`npx prisma validate`):** ✅ Lolos (exit code 0)
- **Generate Client (`npx prisma generate`):** ✅ Lolos (exit code 0, output ke `src/generated/prisma`)
- **TypeScript Check (`npm run type-check`):** ✅ Lolos (exit code 0, 0 error)
- **ESLint (`npm run lint`):** ✅ Lolos (exit code 0, 0 error/warning)
- **Production Build (`npm run build`):** ✅ Lolos (exit code 0, terkompilasi dalam 12.3s)

---

## 11. Finalisasi Skema Autentikasi Auth.js v5 dan Password Reset (13 Oktober 2026)

### a. Keputusan yang Disetujui
1. **Model `User`:**
   - Integritas email non-nullable tetap dipertahankan (`email String @unique`) untuk mencegah akun anonim/tanpa email.
   - Ditambahkan field `emailVerified DateTime?` dan `image String?` untuk menerima metadata profil dari Google OAuth.
   - Ditambahkan relasi ke `accounts Account[]`, `sessions Session[]`, dan `passwordResetTokens PasswordResetToken[]`.
2. **Model Auth.js Prisma Adapter:**
   - `Account`: Menyimpan token & identitas provider Google OAuth (`@@unique([provider, providerAccountId])`, `@@index([userId])`).
   - `Session`: Disediakan sesuai kontrak delegasi `@auth/prisma-adapter` (`@@index([userId])`).
   - `VerificationToken`: Disediakan sesuai kontrak adapter (`@@unique([identifier, token])`).
3. **Model Keamanan `PasswordResetToken`:**
   - Kepemilikan terikat langsung ke `User` via `userId` (`onDelete: Cascade`), bukan hanya email string.
   - Menyimpan `tokenHash String @unique` (hash SHA-256 dari token acak mentah berentropi tinggi), sehingga token mentah tidak pernah disimpan di database.
   - Memiliki `expiresAt DateTime` dan indeks `@@index([userId])` yang hanya berfungsi mempercepat pencarian token berdasarkan pengguna; indeks ini tidak membatalkan atau menghapus token lama secara otomatis. Saat pengguna meminta reset password baru, aplikasi nantinya harus secara eksplisit menghapus atau membatalkan token lama melalui logika aplikasi. Konsumsi token saat reset password harus tetap dirancang aman dan atomik.
4. **Model Domain Tetap Utuh:**
   - Seluruh model `PauseSession`, `PickingEvent`, dan `Resistance` beserta relasi, enum (`PauseOutcome`, `PickingType`, `DurationRange`, `ContextType`), indeks, dan aturan multi-select (`String[]`) dipertahankan 100% tanpa modifikasi.

### b. Hasil Verifikasi Lokal
- **`npx prisma validate`:** ✅ Lolos (exit code 0)
- **`npx prisma generate`:** ✅ Lolos (exit code 0, tipe client di `src/generated/prisma` diperbarui)
- **`npm run type-check`:** ✅ Lolos (exit code 0, 0 error tipe)
- **`npm run lint`:** ✅ Lolos (exit code 0, 0 error/warning)
- **`npm run build`:** ✅ Lolos (exit code 0, build produksi terkompilasi sukses)
