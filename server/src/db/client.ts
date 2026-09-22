import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  let retries = 5;
  while (retries > 0) {
    try {
      await prisma.$connect();
      return;
    } catch (err) {
      retries -= 1;
      if (retries === 0) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
