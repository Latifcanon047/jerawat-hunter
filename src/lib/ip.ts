import { isIP } from "node:net";

/**
 * Interface minimal pembaca header untuk kompatibilitas dengan Headers (Web API),
 * ReadonlyHeaders (Next.js headers()), maupun Map/Record sederhana.
 */
export interface HeaderSource {
  get(name: string): string | null | undefined;
}

/**
 * Mengekstrak dan memvalidasi alamat IP tunggal (IPv4 atau IPv6).
 *
 * Perilaku:
 * 1. Menolak nilai null, undefined, kosong, atau hanya whitespace.
 * 2. Mengambil elemen pertama sebelum tanda koma (jika ada rantai proxy) dan melakukan trim.
 * 3. Memvalidasi bahwa kandidat adalah alamat IPv4 atau IPv6 yang sah menggunakan `net.isIP`.
 * 4. Menolak string yang mengandung teks tambahan, karakter injeksi, atau format tidak valid.
 *
 * PENTING: Validasi sintaksis ini TIDAK membuktikan keaslian IP. Keaslian IP bergantung
 * pada jaminan edge network (seperti Vercel) yang menimpa header request dari klien eksternal.
 */
export function parseAndValidateIp(rawHeader?: string | null): string | null {
  if (!rawHeader || typeof rawHeader !== "string") {
    return null;
  }

  const trimmed = rawHeader.trim();
  if (!trimmed) {
    return null;
  }

  // Jika terdapat rantai proxy, ambil elemen pertama (alamat klien asli menurut proxy)
  const candidate = trimmed.split(",")[0]?.trim();
  if (!candidate) {
    return null;
  }

  const ipVersion = isIP(candidate);
  if (ipVersion === 4 || ipVersion === 6) {
    return candidate;
  }

  return null;
}

/**
 * Menentukan alamat IP klien berdasarkan prioritas header untuk target Vercel:
 *
 * 1. `x-real-ip`: Sumber utama pada Vercel Functions. Vercel menyematkan IP asli klien
 *    sebagai alamat tunggal yang bersih.
 * 2. `x-forwarded-for`: Sumber cadangan standar. Elemen pertama diambil karena Vercel
 *    menempatkan IP publik klien di awal rantai.
 * 3. `cf-connecting-ip`: Cadangan jika lalu lintas melewati Cloudflare proxy sebelum mencapai Vercel.
 *
 * Fallback:
 * Jika seluruh header tidak ada atau tidak valid, fungsi mengembalikan `"127.0.0.1"`.
 * Konsekuensi fallback:
 * - Pada lingkungan lokal (development), seluruh request berbagi kuota rate limit "127.0.0.1".
 * - Ini lebih aman daripada menghasilkan identifier acak baru per request, karena identifier acak
 *   akan menyebabkan pembatasan rate limit berbasis IP dapat dilewati sepenuhnya.
 */
export function resolveClientIp(headersSource: HeaderSource): string {
  // 1. Prioritas Vercel: x-real-ip
  const realIp = parseAndValidateIp(headersSource.get("x-real-ip"));
  if (realIp) {
    return realIp;
  }

  // 2. Cadangan Vercel: x-forwarded-for (elemen pertama)
  const forwardedFor = parseAndValidateIp(headersSource.get("x-forwarded-for"));
  if (forwardedFor) {
    return forwardedFor;
  }

  // 3. Cadangan Cloudflare: cf-connecting-ip
  const cfIp = parseAndValidateIp(headersSource.get("cf-connecting-ip"));
  if (cfIp) {
    return cfIp;
  }

  return "127.0.0.1";
}
