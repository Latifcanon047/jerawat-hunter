import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * Menghasilkan hash kata sandi yang aman menggunakan bcryptjs.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Memverifikasi kata sandi teks biasa terhadap hash yang tersimpan secara aman.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
