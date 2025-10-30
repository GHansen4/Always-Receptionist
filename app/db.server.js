import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required but not set');
}

// Standard Prisma client - no adapters needed for Supabase
const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn']
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;