export interface UserGreetingData {
  greeting: string;
  displayName: string | null;
}

/**
 * Mengambil nama tampilan pengguna dari session.
 * 1. Mengutamakan nama pengguna jika tersedia dan tidak kosong.
 * 2. Menggunakan email sebagai fallback jika nama tidak tersedia.
 * 3. Mengembalikan null jika keduanya tidak tersedia (tidak mengarang identitas).
 */
export function getUserDisplayName(
  user?: {
    name?: string | null;
    email?: string | null;
  } | null
): string | null {
  const trimmedName = user?.name?.trim();
  if (trimmedName && trimmedName.length > 0) {
    return trimmedName;
  }

  const trimmedEmail = user?.email?.trim();
  if (trimmedEmail && trimmedEmail.length > 0) {
    return trimmedEmail;
  }

  return null;
}

/**
 * Menghasilkan sapaan dan nama tampilan pengguna untuk Dashboard.
 */
export function getUserGreeting(
  user?: {
    name?: string | null;
    email?: string | null;
  } | null
): UserGreetingData {
  const displayName = getUserDisplayName(user);
  return {
    greeting: "Halo",
    displayName,
  };
}
