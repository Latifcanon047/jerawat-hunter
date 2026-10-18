import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validations/auth";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parseResult = loginSchema.safeParse(credentials);
        if (!parseResult.success) {
          return null;
        }

        const { email, password } = parseResult.data;

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });

          // Akun tidak ditemukan atau akun OAuth tanpa password
          if (!user || !user.password) {
            return null;
          }

          const isPasswordValid = await verifyPassword(password, user.password);
          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        } catch {
          // Gagal secara aman tanpa membocorkan error internal database
          return null;
        }
      },
    }),
  ],
});
