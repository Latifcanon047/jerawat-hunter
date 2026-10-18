"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { resolveClientIp } from "@/lib/ip";
import { hashPassword } from "@/lib/password";
import { checkRateLimit, resetRateLimitKey } from "@/lib/rate-limit";
import { generateResetToken, hashToken } from "@/lib/tokens";
import {
  forgotPasswordSchema,
  loginSchema,
  registerFormSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

export interface AuthActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Mendeteksi IP klien secara aman dari header request untuk target Vercel.
 */
async function getClientIp(): Promise<string> {
  try {
    const headersList = await headers();
    return resolveClientIp(headersList);
  } catch {
    // Abaikan jika dieksekusi di luar konteks request (misal: pengujian unit)
    return "127.0.0.1";
  }
}

/**
 * Validasi agar URL redirect selalu bersifat internal dan aman (mencegah open redirect).
 * Menolak karakter backslash (\), protocol-relative (//), skema eksternal, dan bypass URL-encoded.
 */
export async function getSafeRedirectUrl(url?: string | null): Promise<string> {
  if (!url || typeof url !== "string") {
    return "/";
  }

  // 1. Tolak jika mengandung backslash atau karakter kontrol berbahaya
  if (url.includes("\\") || /[\u0000-\u001F\u007F-\u009F]/.test(url)) {
    return "/";
  }

  // 2. Pastikan diawali tepat satu garis miring (bukan // atau /\, dsb.)
  if (!url.startsWith("/") || url.startsWith("//")) {
    return "/";
  }

  // 3. Periksa URL-encoded bypass (misal: /%5Cevil.com atau /%2F%2Fevil.com)
  try {
    const decoded = decodeURIComponent(url);
    if (
      decoded.includes("\\") ||
      decoded.startsWith("//") ||
      decoded.startsWith("/\\")
    ) {
      return "/";
    }
  } catch {
    return "/";
  }

  // 4. Uji dengan URL constructor menggunakan base origin tepercaya
  try {
    const dummyBase = "http://localhost";
    const parsed = new URL(url, dummyBase);

    // Pastikan origin hasil parsing tetap sama persis dengan base dummy
    if (parsed.origin !== dummyBase) {
      return "/";
    }

    // Pastikan pathname diawali / dan tidak dinormalisasi ke host luar
    if (!parsed.pathname.startsWith("/")) {
      return "/";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

/**
 * Server Action untuk mendaftarkan akun baru dengan email dan password.
 */
export async function registerUser(input: unknown): Promise<AuthActionResult> {
  const isFormWithConfirm =
    typeof input === "object" && input !== null && "confirmPassword" in input;

  const parseResult = isFormWithConfirm
    ? registerFormSchema.safeParse(input)
    : registerSchema.safeParse(input);

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]?.message;
    return {
      success: false,
      error: firstIssue ?? "Data pendaftaran tidak valid.",
    };
  }

  const { email, password, name } = parseResult.data;

  // Pembatasan laju pendaftaran per IP (maksimal 5 pendaftaran per jam)
  const ip = await getClientIp();
  const ipRateLimit = await checkRateLimit(`register:ip:${ip}`, {
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  if (!ipRateLimit.success) {
    return {
      success: false,
      error:
        "Terlalu banyak permintaan pendaftaran dari jaringan Anda. Silakan coba lagi nanti.",
    };
  }

  try {
    const hashedPassword = await hashPassword(password);

    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name ?? null,
      },
    });

    return {
      success: true,
      message: "Akun berhasil didaftarkan.",
    };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "Email sudah terdaftar. Silakan gunakan email lain atau masuk.",
      };
    }

    return {
      success: false,
      error: "Terjadi kesalahan saat memproses pendaftaran. Silakan coba lagi.",
    };
  }
}

/**
 * Server Action untuk masuk dengan email dan password (Credentials).
 */
export async function loginWithCredentials(
  input: unknown,
  callbackUrl?: string
): Promise<AuthActionResult> {
  const parseResult = loginSchema.safeParse(input);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]?.message;
    return {
      success: false,
      error: firstIssue ?? "Email atau kata sandi tidak valid.",
    };
  }

  const { email, password } = parseResult.data;
  const ip = await getClientIp();

  // 1. Pembatasan laju per email (maksimal 5 percobaan per 15 menit)
  const emailRateLimit = await checkRateLimit(`login:email:${email}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!emailRateLimit.success) {
    return {
      success: false,
      error:
        "Terlalu banyak percobaan masuk yang gagal untuk akun ini. Silakan coba lagi dalam 15 menit.",
    };
  }

  // 2. Pembatasan laju per IP (maksimal 20 percobaan per 15 menit)
  const ipRateLimit = await checkRateLimit(`login:ip:${ip}`, {
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });

  if (!ipRateLimit.success) {
    return {
      success: false,
      error:
        "Terlalu banyak percobaan masuk dari jaringan Anda. Silakan coba lagi dalam 15 menit.",
    };
  }

  const safeRedirect = await getSafeRedirectUrl(callbackUrl);

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeRedirect,
    });

    // Reset kuota percobaan gagal saat login berhasil tanpa exception
    await resetRateLimitKey(`login:email:${email}`);

    return {
      success: true,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return {
            success: false,
            error: "Email atau kata sandi tidak cocok. Silakan periksa kembali.",
          };
        default:
          return {
            success: false,
            error: "Terjadi kendala saat masuk. Silakan coba lagi sebentar lagi.",
          };
      }
    }

    // Jika terjadi navigasi internal Next.js (bukan AuthError), login berhasil: reset kuota
    await resetRateLimitKey(`login:email:${email}`);

    // Re-throw internal redirect exception agar Next.js dapat melakukan navigasi
    throw error;
  }
}

/**
 * Server Action untuk memulai alur autentikasi Google OAuth.
 */
export async function loginWithGoogle(callbackUrl?: string): Promise<void> {
  const safeRedirect = await getSafeRedirectUrl(callbackUrl);
  await signIn("google", { redirectTo: safeRedirect });
}

/**
 * Server Action untuk meminta pengaturan ulang kata sandi.
 * Memberikan respons generik seragam untuk email terdaftar maupun tidak terdaftar.
 */
export async function requestPasswordReset(
  input: unknown
): Promise<AuthActionResult> {
  const parseResult = forgotPasswordSchema.safeParse(input);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]?.message;
    return {
      success: false,
      error: firstIssue ?? "Format email tidak valid.",
    };
  }

  const { email } = parseResult.data;

  // Respons generik seragam untuk mencegah enumerasi pengguna
  const genericSuccessMessage =
    "Jika email Anda terdaftar pada sistem kami, instruksi pemulihan kata sandi telah diproses. Silakan periksa kotak masuk atau folder spam Anda.";

  // Pembatasan laju per email (maks 3 per jam) dan per IP (maks 10 per jam)
  const ip = await getClientIp();
  const emailRateLimit = await checkRateLimit(`pwd-reset:email:${email}`, {
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });

  const ipRateLimit = await checkRateLimit(`pwd-reset:ip:${ip}`, {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });

  // Jika melampaui batas, kembalikan pesan generik sukses tanpa mengeksekusi DB atau email
  if (!emailRateLimit.success || !ipRateLimit.success) {
    return {
      success: true,
      message: genericSuccessMessage,
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Jika pengguna tidak ditemukan, tetap kembalikan pesan sukses generik
    if (!user) {
      return {
        success: true,
        message: genericSuccessMessage,
      };
    }

    // Buat token acak berentropi tinggi
    const { rawToken, tokenHash, expiresAt } = generateResetToken();

    // Batalkan token lama dan simpan hash token baru secara transaksional
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    // Susun URL reset password
    const baseUrl =
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

    // Kirim email melalui provider (Resend) jika terkonfigurasi
    await sendPasswordResetEmail({
      email: user.email,
      resetUrl,
    });

    return {
      success: true,
      message: genericSuccessMessage,
    };
  } catch {
    return {
      success: false,
      error: "Terjadi kesalahan saat memproses permintaan. Silakan coba lagi nanti.",
    };
  }
}

/**
 * Server Action untuk mengatur ulang kata sandi dengan verifikasi token dan konsumsi atomik.
 * Mencegah race condition dan replay attack dengan mengonsumsi token terlebih dahulu sebelum
 * melakukan perubahan kata sandi di dalam transaksi PostgreSQL yang sama.
 */
export async function resetPassword(
  input: unknown
): Promise<AuthActionResult> {
  const parseResult = resetPasswordSchema.safeParse(input);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]?.message;
    return {
      success: false,
      error: firstIssue ?? "Data pembaruan kata sandi tidak valid.",
    };
  }

  const { token, password } = parseResult.data;
  const ip = await getClientIp();
  const ipRateLimit = await checkRateLimit(`pwd-token:ip:${ip}`, {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });

  if (!ipRateLimit.success) {
    return {
      success: false,
      error:
        "Terlalu banyak percobaan pembaruan kata sandi dari jaringan Anda. Silakan coba lagi nanti.",
    };
  }

  const tokenHash = hashToken(token);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Cari token berdasarkan hash SHA-256 untuk mendapatkan identitas pengguna
      const resetToken = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
      });

      if (!resetToken) {
        return {
          success: false,
          error:
            "Tautan pemulihan tidak valid atau sudah pernah digunakan. Silakan ajukan permohonan baru.",
        };
      }

      // 2. Periksa masa berlaku token menggunakan waktu server yang konsisten
      const now = new Date();
      if (resetToken.expiresAt <= now) {
        // Hapus token yang sudah kedaluwarsa
        await tx.passwordResetToken.deleteMany({
          where: { id: resetToken.id },
        });
        return {
          success: false,
          error:
            "Tautan pemulihan sudah kedaluwarsa. Silakan ajukan permohonan baru.",
        };
      }

      // 3. KONSUMSI ATOMIK SEBELUM MENGUBAH PASSWORD:
      // Operasi deleteMany pada PostgreSQL memperoleh exclusive row lock.
      // Jika dua permintaan konkurensi tiba dengan token yang sama, hanya tepat 1 transaksi
      // yang menghasilkan count === 1. Transaksi kedua yang menunggu lock akan mendapati
      // baris tersebut sudah terhapus (count === 0) dan langsung ditolak.
      const consumeResult = await tx.passwordResetToken.deleteMany({
        where: {
          id: resetToken.id,
          tokenHash,
          userId: resetToken.userId,
          expiresAt: { gt: now },
        },
      });

      if (consumeResult.count !== 1) {
        return {
          success: false,
          error:
            "Tautan pemulihan sudah pernah digunakan atau sedang diproses. Silakan ajukan permohonan baru.",
        };
      }

      // 4. Perbarui password pengguna dalam transaksi yang sama
      const hashedPassword = await hashPassword(password);
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      });

      // 5. Batalkan seluruh sisa token aktif lainnya milik pengguna tersebut
      await tx.passwordResetToken.deleteMany({
        where: { userId: resetToken.userId },
      });

      return {
        success: true,
        message:
          "Kata sandi Anda berhasil diperbarui. Silakan masuk menggunakan kata sandi baru Anda.",
      };
    });

    return result;
  } catch {
    return {
      success: false,
      error:
        "Terjadi kendala saat memperbarui kata sandi. Silakan coba lagi.",
    };
  }
}

/**
 * Server Action untuk keluar dari sesi pengguna (Logout).
 * Menggunakan fungsi resmi NextAuth v5 signOut dan mengarahkan ke /login.
 */
export async function logoutUser(): Promise<{ success: false; error: string } | undefined> {
  try {
    await signOut({ redirectTo: "/login" });
  } catch (error) {
    if (
      (error instanceof Error && error.message === "NEXT_REDIRECT") ||
      (error &&
        typeof error === "object" &&
        "digest" in error &&
        typeof (error as { digest: unknown }).digest === "string" &&
        (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"))
    ) {
      throw error;
    }

    console.error("Logout action error:", error);
    return {
      success: false,
      error: "Terjadi kesalahan saat keluar dari akun. Silakan coba lagi.",
    };
  }
}

