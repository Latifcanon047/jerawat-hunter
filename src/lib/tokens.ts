import crypto from "crypto";

export const RESET_TOKEN_EXPIRY_MINUTES = 60;

/**
 * Menghasilkan hash SHA-256 dari token acak mentah.
 * Hanya nilai hash ini yang disimpan di database.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Membuat token acak kriptografis berentropi tinggi (32 bytes = 256 bit)
 * beserta hash SHA-256 dan waktu kedaluwarsa.
 */
export function generateResetToken(): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000
  );

  return {
    rawToken,
    tokenHash,
    expiresAt,
  };
}
