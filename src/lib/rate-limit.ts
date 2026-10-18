export interface RateLimitOptions {
  limit: number; // Batas maksimal permintaan
  windowMs: number; // Jendela waktu dalam milidetik
  failClosed?: boolean; // Jika true, tolak permintaan saat store gagal (default: false / fail-open)
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Timestamp kedaluwarsa kuota dalam milidetik
}

export interface StoreEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<StoreEntry>;
  reset(key: string): Promise<void>;
}

/**
 * Penyimpanan rate limiting in-memory untuk lingkungan lokal/single-instance.
 * Catatan Arsitektur Produksi:
 * Di lingkungan serverless/multi-instance (seperti Vercel), store in-memory ini
 * tidak tersinkronisasi antar-instance. Untuk deployment produksi skala penuh,
 * modul ini siap disambungkan dengan distributed store (seperti Redis/Upstash).
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, StoreEntry>();
  private lastCleanup = Date.now();

  async increment(key: string, windowMs: number): Promise<StoreEntry> {
    const now = Date.now();

    // Pembersihan berkala setiap 5 menit untuk mencegah kebocoran memori
    if (now - this.lastCleanup > 5 * 60 * 1000) {
      this.cleanup(now);
      this.lastCleanup = now;
    }

    const entry = this.store.get(key);

    if (!entry || entry.resetAt <= now) {
      const newEntry: StoreEntry = { count: 1, resetAt: now + windowMs };
      this.store.set(key, newEntry);
      return newEntry;
    }

    entry.count += 1;
    return entry;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  private cleanup(now: number): void {
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}

// Instance store default
export const defaultRateLimitStore = new InMemoryRateLimitStore();

/**
 * Memeriksa kuota permintaan berdasarkan kunci tertentu.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions,
  customStore?: RateLimitStore
): Promise<RateLimitResult> {
  const { limit, windowMs, failClosed = false } = options;
  const store = customStore ?? defaultRateLimitStore;

  try {
    const entry = await store.increment(key, windowMs);
    const success = entry.count <= limit;
    const remaining = Math.max(0, limit - entry.count);

    return {
      success,
      limit,
      remaining,
      resetAt: entry.resetAt,
    };
  } catch {
    // Perilaku fail-closed atau fail-open saat store gagal
    if (failClosed) {
      return {
        success: false,
        limit,
        remaining: 0,
        resetAt: Date.now() + windowMs,
      };
    }

    return {
      success: true,
      limit,
      remaining: 1,
      resetAt: Date.now() + windowMs,
    };
  }
}

/**
 * Mereset kuota untuk kunci tertentu (misal: saat login berhasil).
 */
export async function resetRateLimitKey(
  key: string,
  customStore?: RateLimitStore
): Promise<void> {
  const store = customStore ?? defaultRateLimitStore;
  try {
    await store.reset(key);
  } catch {
    // Abaikan kegagalan reset agar tidak memutus alur pengguna
  }
}
