import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    /*
     * Mencakup seluruh rute aplikasi kecuali:
     * - _next/static (file statis build)
     * - _next/image (optimasi gambar Next.js)
     * - favicon.ico (ikon browser)
     * - file publik dengan ekstensi media/aset (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
