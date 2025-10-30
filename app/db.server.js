import { PrismaClient } from '@prisma/client';

console.log('=== DB.SERVER.JS LOADING ===');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL length:', process.env.DATABASE_URL?.length || 0);
console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 30));
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('===================================');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in environment variables');
  throw new Error('DATABASE_URL is required but not set');
}

console.log('✅ Creating standard Prisma client for Supabase...');

// Standard Prisma client with connection pooling settings for serverless
const prisma = global.prisma || new PrismaClient({
  datasources: {
    db: {
      url: connectionString,
    },
  },
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
  // Disable prepared statements for pgBouncer compatibility
  // This prevents "prepared statement already exists" errors
  __internal: {
    engine: {
      enablePreparedStatements: false,
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

console.log('✅ Prisma client created successfully');

export default prisma;