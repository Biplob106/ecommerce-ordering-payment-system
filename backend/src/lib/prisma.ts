import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * A single shared PrismaClient for the whole process.
 *
 * Each PrismaClient opens its own pool of database connections. Creating a new
 * one per request would quickly exhaust the database's connection limit, so we
 * make exactly one and reuse it everywhere.
 *
 * In development, `tsx watch` reloads the module on every file change. Without
 * the global cache below, each reload would leak another client. Stashing it on
 * `globalThis` keeps a single instance alive across reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
