import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function withUtcSessionTimezone(connectionString: string | undefined) {
  if (!connectionString) return undefined;

  const url = new URL(connectionString);
  const options = url.searchParams.get("options")?.trim();
  url.searchParams.set(
    "options",
    [options, "-c timezone=UTC"].filter(Boolean).join(" ")
  );
  return url.toString();
}

const pool = new Pool({
  connectionString: withUtcSessionTimezone(process.env.DATABASE_URL),
  connectionTimeoutMillis: 5000,
});

export interface DatabasePoolSnapshot {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export function getDatabasePoolSnapshot(): DatabasePoolSnapshot | null {
  try {
    return {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
  } catch {
    return null;
  }
}

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
