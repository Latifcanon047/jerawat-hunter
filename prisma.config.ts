import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // DIRECT_URL digunakan oleh Prisma CLI (prisma migrate, dsb.)
    // Untuk Neon: gunakan direct connection string (non-pooled)
    url: process.env.DIRECT_URL,
  },
});
