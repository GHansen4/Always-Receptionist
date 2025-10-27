import { PrismaClient } from '@prisma/client'

const globalForPrisma = global

let prisma

// Use custom DATABASE_URL with connection pooling params if available
const databaseUrl = process.env.DATABASE_URL_CUSTOM || process.env.DATABASE_URL

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error'],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  })
} else {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    })
  }
  prisma = globalForPrisma.prisma
}

export default prisma
