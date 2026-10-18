import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // 1. Rute publik yang bebas diakses tanpa sesi
      const isPublicAuthPage =
        pathname === "/login" ||
        pathname === "/register" ||
        pathname === "/forgot-password" ||
        pathname === "/reset-password";

      const isAuthApiRoute = pathname.startsWith("/api/auth");

      if (isPublicAuthPage || isAuthApiRoute) {
        return true;
      }

      // 2. Proteksi endpoint API: kembalikan 401 Unauthorized dalam bentuk JSON jika belum login
      if (pathname.startsWith("/api/")) {
        if (!isLoggedIn) {
          return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
          );
        }
        return true;
      }

      // 3. Proteksi rute halaman privat (misal: /, /dashboard, dll.)
      // Mengembalikan false akan mengarahkan pengguna belum login ke pages.signIn (/login) dengan callbackUrl
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (typeof token.id === "string") {
          session.user.id = token.id;
        } else if (typeof token.sub === "string") {
          session.user.id = token.sub;
        }
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
